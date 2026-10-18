import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Diagnosis } from "./labels";
import type { CaptureChecks, GuideBox } from './capture';

export type ReviewRow = {
  id: string;
  doctor_id: string;
  diagnosis: Diagnosis;
  other_text: string | null;
  confidence: number | null;
  referral: boolean | null;
  comments: string | null;
  created_at: string;
};

export type EyeRow = {
  id: string;
  patient_id: string;
  eye: "left" | "right";
  storage_path: string;
  pupil_roi_path?: string | null;
  thumb_path?: string | null;
  circle_method?: string | null;
  pupil_circle_confirmed?: boolean;
  roi_storage_path?: string | null;
  guide_box?: GuideBox | null;
  capture_checks?: CaptureChecks | null;
  circle_cx: number | null;
  circle_cy: number | null;
  circle_r: number | null;
  flash_used: boolean | null;
  lighting: string | null;
  phone_model: string | null;
  blur_score: number | null;
  brightness: number | null;
  glare_fraction: number | null;
  quality_status: string | null;
  visual_acuity: string | null;
  notes: string | null;
  created_at: string;
  reviews: ReviewRow[];
};

export type PatientRow = {
  id: string;
  study_id: string;
  age: number | null;
  sex: string | null;
  area: string | null;
  site_id: string | null;
  consent_given: boolean;
  consent_type: string | null;
  consent_photo_path: string | null;
  screening_date: string;
  created_at: string;
  sites: { name: string } | null;
  eye_images: EyeRow[];
};

export const recordsKey = ["records"];

export function useRecords() {
  return useQuery({
    queryKey: recordsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, sites(name), eye_images(*, reviews(*))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PatientRow[];
    },
  });
}

export const PAGE_SIZE = 20;

/** PostgREST `or` filter values must not contain these characters. */
export function safeSearch(q: string) { return q.trim().replace(/[,()*%\\]/g, " ").slice(0, 40).trim(); }

export type RecordListRow = {
  id: string; study_id: string; age: number | null; sex: string | null; area: string | null; screening_date: string;
  sites: { name: string } | null;
  eye_images: { id: string; eye: "left" | "right"; thumb_path: string | null; pupil_roi_path: string | null; pupil_circle_confirmed: boolean; quality_status: string | null; reviews: { diagnosis: Diagnosis }[] }[];
};

/** One page (20 patients) with only the columns the list needs; search runs in the database. */
export function useRecordsPage(page: number, q: string) {
  const s = safeSearch(q);
  return useQuery({
    queryKey: [...recordsKey, "page", page, s],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let query = supabase
        .from("patients")
        .select("id, study_id, age, sex, area, screening_date, sites(name), eye_images(id, eye, thumb_path, pupil_roi_path, pupil_circle_confirmed, quality_status, reviews(diagnosis))", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (s) query = query.or(`study_id.ilike.*${s}*,area.ilike.*${s}*`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data as unknown as RecordListRow[], total: count ?? 0 };
    },
  });
}

/** A single patient record (detail page) instead of downloading every record. */
export function useRecord(studyId: string) {
  return useQuery({
    queryKey: [...recordsKey, "one", studyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, sites(name), eye_images(*, reviews(*))")
        .eq("study_id", studyId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PatientRow | null;
    },
  });
}

export type DashboardStats = {
  patients: number; eyes: number; reviewed: number; pass: number;
  sex: Record<string, number>; age: Record<string, number>; sites: Record<string, number>; labels: Record<string, number>;
};

/** Aggregates computed in the database (dashboard_stats RPC) – no row download. */
export function useDashboardStats() {
  return useQuery({
    queryKey: [...recordsKey, "stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats");
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
  });
}

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach((p) => (map[p.id] = p.full_name || p.email || p.id.slice(0, 8)));
      return map;
    },
  });
}
