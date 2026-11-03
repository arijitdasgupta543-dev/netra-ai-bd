import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Choice } from "@/components/EyeCapture";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { districtLabel } from "@/lib/bd";
import { rankHospitals, reasonLabel, statusLabel, typeLabel, type ReferralType } from "@/lib/referral";
import { referralsKey, useHospitals, useReferrals, type ReferralRow } from "@/lib/referral-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals – Netra AI" }, { name: "description", content: "Referral queue and follow-up." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Referrals />
    </RoleGate>
  ),
});

function Referrals() {
  const { L } = useLang();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const q = useReferrals(filter);
  const urgent = (q.data ?? []).filter((r) => r.priority === "urgent" && r.status === "awaiting_doctor").length;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle sub={L(`${urgent} urgent waiting for a doctor`, `${urgent}টি জরুরি কেস ডাক্তারের অপেক্ষায়`)}>{L("Referrals", "রেফারাল")}</PageTitle>
      <Choice value={filter} onChange={setFilter} options={[{ v: "open", label: L("Open", "চলমান") }, { v: "all", label: L("All", "সব") }]} />
      {q.isLoading && <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>}
      {q.data?.length === 0 && <div className="rounded-xl border bg-success-soft p-6 text-center">{L("No referrals.", "কোনো রেফারাল নেই।")}</div>}
      {q.data?.map((r) => <Card key={r.id} r={r} />)}
    </div>
  );
}

function Card({ r }: { r: ReferralRow }) {
  const { L, T } = useLang();
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const p = r.patients;
  const badge = { urgent: "bg-destructive text-white", routine: "bg-warning-soft", audit: "bg-secondary" }[r.priority];
  return (
    <div className={cn("space-y-2 rounded-xl border bg-card p-4", r.priority === "urgent" && r.status === "awaiting_doctor" && "border-destructive")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{p?.study_id}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge)}>{r.priority === "urgent" ? L("Urgent", "জরুরি") : r.priority === "audit" ? L("Quality check", "মান যাচাই") : L("Routine", "সাধারণ")}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{T(statusLabel[r.status])}</span>
        <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
      </div>
      <p className="text-sm">{T(typeLabel[r.referral_type])} · {T(reasonLabel[r.reason])} · {L("Age", "বয়স")} {p?.age ?? "?"} · {T(districtLabel(p?.district))}</p>
      {r.hospitals && <p className="text-xs text-muted-foreground">{L(r.hospitals.name_en, r.hospitals.name_bn)}</p>}
      {r.doctor_note && <p className="text-xs"><b>{L("Doctor", "ডাক্তার")}:</b> {r.doctor_note}</p>}
      <div className="flex flex-wrap gap-2">
        {p && r.patient_visible && <Button asChild size="sm" variant="outline"><Link to="/slip/$studyId" params={{ studyId: p.study_id }}>{L("Slip", "স্লিপ")}</Link></Button>}
        {p && <Button asChild size="sm" variant="outline"><Link to="/records/$studyId" params={{ studyId: p.study_id }}>{L("Record", "রেকর্ড")}</Link></Button>}
        {(role === "doctor" || role === "admin") && ["awaiting_doctor", "confirmed"].includes(r.status) && <Button size="sm" onClick={() => setOpen(!open)}>{L("Doctor decision", "ডাক্তারের সিদ্ধান্ত")}</Button>}
      </div>
      {open && <Decision r={r} onDone={() => setOpen(false)} />}
    </div>
  );
}

function Decision({ r, onDone }: { r: ReferralRow; onDone: () => void }) {
  const { L, T } = useLang();
  const qc = useQueryClient();
  const hospitals = useHospitals();
  const [type, setType] = useState<ReferralType>(r.referral_type === "none" ? "cataract" : r.referral_type);
  const ranked = useMemo(() => rankHospitals(hospitals.data ?? [], r.patients?.district, type), [hospitals.data, r.patients?.district, type]);
  const [hospitalId, setHospitalId] = useState<string>(r.hospital_id ?? "");
  const [note, setNote] = useState(r.doctor_note ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (status: "confirmed" | "not_needed") => {
    setBusy(true);
    const { error } = await supabase.from("referrals").update({
      status, referral_type: status === "not_needed" ? "none" : type, hospital_id: status === "confirmed" ? (hospitalId || ranked[0]?.id || null) : null,
      doctor_note: note.trim() || null, ...(status === "confirmed" ? { patient_visible: true, priority: r.priority === "audit" ? "routine" : r.priority } : {}),
    }).eq("id", r.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(L("Saved", "সংরক্ষিত"));
    await qc.invalidateQueries({ queryKey: referralsKey });
    onDone();
  };
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{L("Label the eye photos in Doctor review first; the AI score is shown there only after your label.", "আগে ডাক্তারের মূল্যায়ন পাতায় ছবিতে লেবেল দিন; আপনার লেবেলের পরেই সেখানে AI স্কোর দেখা যাবে।")}</p>
      <Choice value={type} onChange={setType} options={(["cataract", "spectacles", "other"] as const).map((v) => ({ v, label: T(typeLabel[v]) }))} />
      <Select value={hospitalId || ranked[0]?.id || ""} onValueChange={setHospitalId}>
        <SelectTrigger className="h-11"><SelectValue placeholder={L("Hospital", "হাসপাতাল")} /></SelectTrigger>
        <SelectContent>{ranked.map((h) => <SelectItem key={h.id} value={h.id}>{L(h.name_en, h.name_bn)} · {T(districtLabel(h.district))}</SelectItem>)}</SelectContent>
      </Select>
      <Textarea placeholder={L("Advice for the patient (Bangla)", "রোগীর জন্য পরামর্শ (বাংলায়)")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11" disabled={busy} onClick={() => save("confirmed")}>{L("Confirm referral", "রেফার নিশ্চিত")}</Button>
        <Button className="h-11" variant="outline" disabled={busy} onClick={() => save("not_needed")}>{L("Not needed", "প্রয়োজন নেই")}</Button>
      </div>
    </div>
  );
}
