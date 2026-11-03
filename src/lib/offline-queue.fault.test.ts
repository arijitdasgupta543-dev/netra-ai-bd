// @ts-nocheck -- in-memory fake backend with dynamic rows; type safety of the code under test is checked elsewhere
/**
 * Fault-injection test of the offline save path (paper: "offline-first, idempotent synchronisation").
 * An in-memory fake backend fails requests at random, both BEFORE a write reaches the server (request lost) and
 * AFTER it was applied (response lost — the dangerous case for duplicates). Each screening is retried until it
 * succeeds; afterwards the stored rows must equal exactly what one clean save would have produced.
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    p: 0.25, // failure probability per phase per request
    rnd: (() => { let s = 12345; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })(),
    tables: { patients: [] as Row[], eye_images: [] as Row[], patient_contacts: [] as Row[], predictions: [] as Row[], vision_tests: [] as Row[], referrals: [] as Row[] } as Record<string, Row[]>,
    uploads: 0, injected: { before: 0, after: 0 }, nonNetworkErrors: 0, seq: 0,
  };
  const net = () => new Error("TypeError: Failed to fetch");
  const failBefore = () => { if (state.rnd() < state.p) { state.injected.before++; throw net(); } };
  const failAfter = () => { if (state.rnd() < state.p) { state.injected.after++; throw net(); } };
  const keyOf: Record<string, (r: Row) => string> = {
    patients: (r) => String(r.id), eye_images: (r) => String(r.id), patient_contacts: (r) => String(r.patient_id),
    predictions: (r) => `${r.eye_image_id}|${r.model_url}`, vision_tests: (r) => `${r.patient_id}|${r.eye}|${r.method}`, referrals: (r) => String(r.patient_id),
  };
  class Q {
    op: "select" | "insert" | "upsert" = "select"; filters: [string, unknown][] = []; payload: Row | Row[] = []; returning = false;
    constructor(private t: string) {}
    select() { if (this.op !== "select") this.returning = true; return this; }
    eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
    insert(r: Row) { this.op = "insert"; this.payload = r; return this; }
    upsert(r: Row | Row[]) { this.op = "upsert"; this.payload = r; return this; }
    maybeSingle() { return this.run("maybe"); }
    single() { return this.run("single"); }
    then(a: (v: unknown) => unknown, b?: (e: unknown) => unknown) { return this.run("many").then(a, b); }
    async run(kind: string) {
      failBefore();
      const rows = state.tables[this.t];
      let out: unknown = null;
      if (this.op === "select") {
        const m = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v));
        out = kind === "many" ? m : (m[0] ?? null);
      } else {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const r0 of list) {
          const r = { ...r0 };
          const k = keyOf[this.t](r);
          if (rows.some((x) => keyOf[this.t](x) === k)) {
            if (this.op === "upsert") continue; // ignoreDuplicates
            state.nonNetworkErrors++;
            return { data: null, error: { message: `duplicate key on ${this.t}` } };
          }
          if (this.t === "patients") r.study_id = `NETRA-${String(++state.seq).padStart(4, "0")}`;
          rows.push(r);
          out = r;
        }
      }
      failAfter();
      return { data: out, error: null };
    }
  }
  const supabase = {
    from: (t: string) => new Q(t),
    rpc: async (name: string, a: Record<string, unknown>) => {
      failBefore();
      if (name === "field_referral" && !state.tables.referrals.some((r) => r.patient_id === a._patient))
        state.tables.referrals.push({ patient_id: a._patient, reason: a._reason });
      failAfter();
      return { data: null, error: null };
    },
  };
  const objects = new Set<string>();
  // mirrors storage.ts: deterministic name when given; an existing object counts as success
  const uploadPhoto = async (prefix: string, _b: Blob, name?: string) => {
    failBefore(); state.uploads++;
    const path = `${prefix}/${name ?? `rnd-${state.uploads}`}.jpg`;
    objects.add(path); failAfter(); return path;
  };
  return { state, supabase, uploadPhoto, objects };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.supabase }));
vi.mock("./storage", () => ({ uploadPhoto: h.uploadPhoto }));

import { submitScreening, isNetworkError, type PendingScreening } from "./offline-queue";

const blob = () => new Blob(["x"]);
function screening(i: number): PendingScreening {
  const key = `p-${i}`;
  return {
    key, createdAt: 0, userId: "w1", patient: { age: 60, sex: "female" }, consentPhoto: blob(),
    eyes: (["left", "right"] as const).map((eye) => ({ id: `${key}-${eye}`, eye, photo: blob(), roi: blob(), thumb: blob(), row: {} })),
    contact: { full_name: "N", phone: null, address: null },
    predictions: (["left", "right"] as const).map((eye) => ({ eyeId: `${key}-${eye}`, model_run_id: null, model_url: "/model/model.json", threshold: 0.5, score: 0.1, positive: false, inference_ms: 10 })),
    vision: (["left", "right"] as const).map((eye) => ({ eye, distance_m: 2, logmar: 0.3, snellen: "6/12", contrast_log_cs: null, px_per_mm: 10, pinhole_improves: null })),
    referral: i % 3 === 0 ? { reason: "low_vision", referral_type: "spectacles", priority: "routine" } : null,
  };
}

describe("offline save under injected network faults", () => {
  it.each([0.05, 0.1, 0.2])("1,000 screenings, fault probability %s per request phase (lost request / lost response): nothing lost, nothing duplicated", async (p) => {
    const st = h.state; st.p = p; st.uploads = 0; st.injected = { before: 0, after: 0 }; st.nonNetworkErrors = 0; h.objects.clear();
    for (const k of Object.keys(st.tables)) st.tables[k] = [];
    const N = 1000; const attempts: number[] = [];
    for (let i = 0; i < N; i++) {
      let n = 0;
      for (;;) {
        n++;
        try { await submitScreening(screening(i)); break; }
        catch (e) { if (!isNetworkError(e)) throw e; if (n > 5000) throw new Error("did not converge"); }
      }
      attempts.push(n);
    }
    const t = h.state.tables;
    const uniq = (rows: Record<string, unknown>[], f: (r: Record<string, unknown>) => string) => new Set(rows.map(f)).size;
    const report = {
      p, screenings: N, patients: t.patients.length, eyes: t.eye_images.length, eyePairsUnique: uniq(t.eye_images, (r) => `${r.patient_id}|${r.eye}`),
      contacts: t.patient_contacts.length, predictions: t.predictions.length, vision: t.vision_tests.length, referrals: t.referrals.length,
      faultsBefore: h.state.injected.before, faultsAfter: h.state.injected.after, nonNetworkErrors: h.state.nonNetworkErrors,
      meanAttempts: attempts.reduce((a, b) => a + b, 0) / N, maxAttempts: Math.max(...attempts),
      uploadRequests: h.state.uploads, storedObjects: h.objects.size, objectsNeeded: N * 7, orphanObjects: h.objects.size - N * 7,
    };
    console.log("FAULT_INJECTION_REPORT " + JSON.stringify(report));
    expect(report.patients).toBe(N);
    expect(report.eyes).toBe(2 * N);
    expect(report.eyePairsUnique).toBe(2 * N);
    expect(report.contacts).toBe(N);
    expect(report.predictions).toBe(2 * N);
    expect(report.vision).toBe(2 * N);
    expect(report.referrals).toBe(Math.ceil(N / 3));
    expect(report.nonNetworkErrors).toBe(0);
    expect(report.orphanObjects).toBe(0);
    expect(new Set(t.patients.map((r) => r.study_id)).size).toBe(N);
  }, 120000);
});
