import { supabase } from "@/integrations/supabase/client";
import { uploadPhoto } from "./storage";

/**
 * Screening save with an offline fallback.
 * Every screening gets client-side ids (patient + eye rows), so a retry after a
 * dropped connection never creates duplicates: existing rows are detected and skipped.
 */

export type PendingEye = {
  id: string;
  eye: "left" | "right";
  photo: Blob;
  roi: Blob;
  thumb: Blob;
  row: Record<string, unknown>; // eye_images columns except ids/paths
};

export type PendingPrediction = { eyeId: string; model_run_id: string | null; model_url: string; threshold: number; score: number; positive: boolean; inference_ms: number | null };
export type PendingVision = { eye: "left" | "right"; distance_m: number; logmar: number | null; snellen: string | null; contrast_log_cs: number | null; px_per_mm: number; pinhole_improves: boolean | null };
export type PendingContact = { full_name: string; phone: string | null; address: string | null };
export type PendingReferral = { reason: "low_vision" | "worker"; referral_type: "cataract" | "spectacles" | "other"; priority: "urgent" | "routine" };

export type PendingScreening = {
  key: string; // = patient id
  createdAt: number;
  userId: string;
  patient: Record<string, unknown>; // patients columns except id
  consentPhoto: Blob | null;
  eyes: PendingEye[];
  /** PII – stored only in patient_contacts; optional (screening works without it). */
  contact?: PendingContact | null;
  predictions?: PendingPrediction[];
  vision?: PendingVision[];
  referral?: PendingReferral | null;
};

const DB = "netra-offline", STORE = "screenings", EVENT = "netra-queue-change";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const notify = () => window.dispatchEvent(new Event(EVENT));
export const onQueueChange = (fn: () => void) => { window.addEventListener(EVENT, fn); return () => window.removeEventListener(EVENT, fn); };
export async function enqueue(item: PendingScreening) { await tx("readwrite", (s) => s.put(item)); notify(); }
export async function pendingItems(): Promise<PendingScreening[]> { try { return await tx("readonly", (s) => s.getAll() as IDBRequest<PendingScreening[]>); } catch { return []; } }
async function remove(key: string) { await tx("readwrite", (s) => s.delete(key)); notify(); }

export function isNetworkError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("network request failed") || m.includes("timeout");
}

/** Uploads photos and inserts rows. Safe to call again for the same item. Returns the Study ID. */
export async function submitScreening(item: PendingScreening): Promise<string> {
  const existing = await supabase.from("patients").select("id, study_id").eq("id", item.key).maybeSingle();
  if (existing.error) throw existing.error;
  let studyId = existing.data?.study_id;
  if (!studyId) {
    const consentPath = item.consentPhoto ? await uploadPhoto("consent", item.consentPhoto, item.key) : null;
    const ins = await supabase.from("patients").insert({ ...(item.patient as object), id: item.key, consent_photo_path: consentPath, created_by: item.userId } as never).select("study_id").single();
    if (ins.error) throw ins.error;
    studyId = (ins.data as { study_id: string }).study_id;
  }
  const done = await supabase.from("eye_images").select("eye").eq("patient_id", item.key);
  if (done.error) throw done.error;
  const have = new Set((done.data ?? []).map((r) => r.eye));
  for (const e of item.eyes) {
    if (have.has(e.eye)) continue;
    const [path, roiPath, thumbPath] = await Promise.all([
      uploadPhoto(`eyes/${studyId}`, e.photo, e.id),
      uploadPhoto(`pupil-roi/${studyId}`, e.roi, e.id),
      uploadPhoto(`pupil-roi/${studyId}/thumb`, e.thumb, e.id),
    ]);
    const res = await supabase.from("eye_images").insert({ ...(e.row as object), id: e.id, patient_id: item.key, eye: e.eye, storage_path: path, pupil_roi_path: roiPath, thumb_path: thumbPath, created_by: item.userId } as never);
    if (res.error) throw res.error;
  }
  // Contacts, AI scores, vision tests and the field referral are each retry-safe (ignore duplicates).
  if (item.contact) {
    const c = await supabase.from("patient_contacts").upsert({ ...item.contact, patient_id: item.key, contact_consent: true, created_by: item.userId }, { onConflict: "patient_id", ignoreDuplicates: true });
    if (c.error) throw c.error;
  }
  if (item.predictions?.length) {
    // inserting a positive prediction makes the database create an urgent referral (trigger)
    const p = await supabase.from("predictions").upsert(item.predictions.map(({ eyeId, ...r }) => ({ ...r, eye_image_id: eyeId, created_by: item.userId })), { onConflict: "eye_image_id,model_url", ignoreDuplicates: true });
    if (p.error) throw p.error;
  }
  if (item.vision?.length) {
    const v = await supabase.from("vision_tests").upsert(item.vision.map((r) => ({ ...r, patient_id: item.key, method: "tumbling_e", created_by: item.userId })), { onConflict: "patient_id,eye,method", ignoreDuplicates: true });
    if (v.error) throw v.error;
  }
  if (item.referral) {
    const r = await supabase.rpc("field_referral", { _patient: item.key, _reason: item.referral.reason, _type: item.referral.referral_type, _priority: item.referral.priority });
    if (r.error) throw r.error;
  }
  return studyId;
}

let running = false;
/** Try to upload everything waiting in the phone. Called on app start and when the network returns. */
export async function processQueue(userId: string | null): Promise<number> {
  if (running || !userId || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  running = true;
  let uploaded = 0;
  try {
    for (const item of await pendingItems()) {
      if (item.userId !== userId) continue;
      try { await submitScreening(item); await remove(item.key); uploaded++; }
      catch (e) { if (isNetworkError(e)) break; /* keep it for a later retry */ }
    }
  } finally { running = false; }
  return uploaded;
}
