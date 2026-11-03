import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Hospital, Priority, ReferralReason, ReferralStatus, ReferralType } from "./referral";

export type ReferralRow = {
  id: string; patient_id: string; reason: ReferralReason; referral_type: ReferralType; priority: Priority; status: ReferralStatus;
  hospital_id: string | null; doctor_note: string | null; patient_visible: boolean; created_at: string; updated_at: string;
  hospitals: Hospital | null;
  patients: { study_id: string; age: number | null; sex: string | null; district: string | null; area: string | null } | null;
};

export const referralsKey = ["referrals"];
const SELECT = "id, patient_id, reason, referral_type, priority, status, hospital_id, doctor_note, patient_visible, created_at, updated_at, hospitals(*), patients(study_id, age, sex, district, area)";

export function useReferrals(filter: "open" | "all") {
  return useQuery({
    queryKey: [...referralsKey, filter],
    queryFn: async () => {
      let q = supabase.from("referrals").select(SELECT).order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(200);
      if (filter === "open") q = q.in("status", ["awaiting_doctor", "confirmed", "patient_informed"]);
      const { data, error } = await q;
      if (error) throw error;
      // 'urgent' > 'routine' > 'audit' alphabetically is not the clinical order, so sort here
      const rank = { urgent: 0, routine: 1, audit: 2 } as const;
      return (data as unknown as ReferralRow[]).sort((a, b) => rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at));
    },
  });
}

export function useReferralForStudy(studyId: string) {
  return useQuery({
    queryKey: [...referralsKey, "study", studyId],
    queryFn: async () => {
      const p = await supabase.from("patients").select("id, study_id, age, sex, district, area").eq("study_id", studyId).maybeSingle();
      if (p.error) throw p.error;
      if (!p.data) return null;
      const [r, c, v] = await Promise.all([
        supabase.from("referrals").select(SELECT).eq("patient_id", p.data.id).maybeSingle(),
        supabase.from("patient_contacts").select("full_name, phone, address").eq("patient_id", p.data.id).maybeSingle(),
        supabase.from("vision_tests").select("eye, snellen, logmar, pinhole_improves").eq("patient_id", p.data.id),
      ]);
      return { patient: p.data, referral: (r.data as unknown as ReferralRow | null) ?? null, contact: c.data ?? null, vision: v.data ?? [] };
    },
  });
}

export function useHospitals() {
  return useQuery({
    queryKey: ["hospitals"],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("hospitals").select("*").order("district");
      if (error) throw error;
      return data as Hospital[];
    },
  });
}

/** Count of urgent referrals waiting for a doctor (nav badge). */
export function useUrgentCount(enabled: boolean) {
  return useQuery({
    queryKey: [...referralsKey, "urgent-count"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("referrals").select("id", { count: "exact", head: true }).eq("status", "awaiting_doctor").eq("priority", "urgent");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
