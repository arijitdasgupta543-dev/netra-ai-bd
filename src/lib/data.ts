import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Diagnosis } from "./labels";

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
