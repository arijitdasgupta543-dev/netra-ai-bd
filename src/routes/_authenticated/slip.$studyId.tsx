import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Printer, Share2, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { districtLabel, maskPhone } from "@/lib/bd";
import { rankHospitals, smsText, STEPS_BN, statusLabel, typeLabel, whatsappLink } from "@/lib/referral";
import { referralsKey, useHospitals, useReferralForStudy } from "@/lib/referral-data";
import { smsPatient } from "@/lib/notify.functions";

export const Route = createFileRoute("/_authenticated/slip/$studyId")({
  head: ({ params }) => ({ meta: [{ title: `Referral slip ${params.studyId} – Netra AI` }, { name: "description", content: "Patient referral slip." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Slip />
    </RoleGate>
  ),
});

function Slip() {
  const { studyId } = Route.useParams();
  const { L, T } = useLang();
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useReferralForStudy(studyId);
  const hospitals = useHospitals();
  const [busy, setBusy] = useState(false);
  const ref = q.data?.referral ?? null;
  const ranked = useMemo(() => (ref && hospitals.data ? rankHospitals(hospitals.data, q.data?.patient.district, ref.referral_type) : []), [ref, hospitals.data, q.data?.patient.district]);
  const hospital = ref?.hospitals ?? ranked[0] ?? null;

  // remember the suggested hospital on the referral so doctors and reports see the same one
  useEffect(() => {
    if (ref && !ref.hospital_id && ranked[0] && ref.patient_visible) void supabase.from("referrals").update({ hospital_id: ranked[0].id }).eq("id", ref.id).then(() => qc.invalidateQueries({ queryKey: referralsKey }));
  }, [ref, ranked, qc]);

  if (q.isLoading) return <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>;
  if (!q.data) return <p>{L("Record not found", "রেকর্ড পাওয়া যায়নি")}</p>;
  if (!ref || !ref.patient_visible) return (
    <div className="mx-auto max-w-md space-y-3 rounded-xl border bg-success-soft p-6 text-center">
      <p className="font-semibold">{L("No referral for this patient.", "এই রোগীর কোনো রেফারাল নেই।")}</p>
      <p className="text-sm">{L("Advise a yearly eye check.", "বছরে একবার চোখ পরীক্ষার পরামর্শ দিন।")}</p>
      <Button asChild variant="outline"><Link to="/records/$studyId" params={{ studyId }}>{L("View record", "রেকর্ড দেখুন")}</Link></Button>
    </div>
  );

  const text = smsText({ studyId, type: ref.referral_type, hospital });
  const setHospital = async (id: string) => {
    const { error } = await supabase.from("referrals").update({ hospital_id: id }).eq("id", ref.id);
    if (error) toast.error(error.message); else await qc.invalidateQueries({ queryKey: referralsKey });
  };
  const setStatus = async (status: "patient_informed" | "reached" | "not_reached") => {
    const { error } = await supabase.from("referrals").update({ status }).eq("id", ref.id);
    if (error) toast.error(error.message); else { toast.success(L("Saved", "সংরক্ষিত")); await qc.invalidateQueries({ queryKey: referralsKey }); }
  };
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: "Netra AI", text }); await setStatus("patient_informed"); return; } } catch { return; }
    await navigator.clipboard?.writeText(text); toast.success(L("Copied", "কপি হয়েছে"));
  };
  const sms = async () => {
    setBusy(true);
    try {
      const r = await smsPatient({ data: { patientId: ref.patient_id } });
      if (r.status === "sent") { toast.success(L("SMS sent", "SMS পাঠানো হয়েছে")); await qc.invalidateQueries({ queryKey: referralsKey }); }
      else if (r.status === "no_phone") toast.error(L("No mobile number saved.", "মোবাইল নম্বর নেই।"));
      else if (r.status === "not_configured") toast.error(L("SMS is not set up yet – use WhatsApp or show the slip.", "SMS এখনো চালু হয়নি – WhatsApp বা স্লিপ দেখান।"));
      else toast.error(L("SMS failed", "SMS যায়নি"));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="print:hidden"><PageTitle sub={T(statusLabel[ref.status])}>{L("Referral slip", "রেফারাল স্লিপ")}</PageTitle></div>

      <article className="space-y-4 rounded-2xl border-2 border-primary bg-card p-5 print:border-black">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xl font-bold">নেত্র AI · রেফারাল স্লিপ</p>
            <p className="text-xs text-muted-foreground">স্ক্রিনিং, রোগ নির্ণয় নয় · {new Date().toLocaleDateString("bn-BD")}</p>
          </div>
          <span className="rounded-lg bg-secondary px-3 py-1 font-mono text-lg font-bold">{studyId}</span>
        </header>
        {q.data.contact && (
          <p className="text-sm"><b>নাম:</b> {q.data.contact.full_name} · <b>মোবাইল:</b> {maskPhone(q.data.contact.phone)}</p>
        )}
        <div className={ref.priority === "urgent" ? "rounded-xl bg-danger-soft p-3" : "rounded-xl bg-warning-soft p-3"}>
          <p className="text-lg font-semibold">প্রয়োজন: {typeLabel[ref.referral_type].bn}</p>
          {ref.priority === "urgent" && <p className="text-sm font-medium">যত তাড়াতাড়ি সম্ভব যান।</p>}
          {ref.doctor_note && <p className="mt-1 text-sm"><b>ডাক্তারের পরামর্শ:</b> {ref.doctor_note}</p>}
        </div>
        <section>
          <p className="font-semibold">কোথায় যাবেন</p>
          {hospital ? (
            <div className="text-sm">
              <p className="text-base font-medium">{hospital.name_bn}</p>
              <p>{hospital.address_bn ?? hospital.address_en} · {T(districtLabel(hospital.district))}</p>
              {hospital.phone ? <p>ফোন: <a href={`tel:${hospital.phone}`} className="underline">{hospital.phone}</a></p> : <p className="text-muted-foreground">ফোন নম্বর যাচাই হয়নি</p>}
              {hospital.cost_note_bn && <p>{hospital.cost_note_bn}</p>}
            </div>
          ) : <p className="text-sm">নিকটস্থ সরকারি হাসপাতালের চক্ষু বিভাগ</p>}
        </section>
        <section>
          <p className="font-semibold">কী করবেন</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{STEPS_BN[ref.referral_type].map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
        {q.data.vision.length > 0 && <p className="text-xs text-muted-foreground">দৃষ্টি: {q.data.vision.map((v) => `${v.eye === "right" ? "ডান" : "বাম"} ${v.snellen ?? "<6/60"}`).join(" · ")}</p>}
      </article>

      <div className="space-y-2 print:hidden">
        {ranked.length > 1 && (
          <Select value={hospital?.id ?? ""} onValueChange={setHospital}>
            <SelectTrigger className="h-12"><SelectValue placeholder={L("Choose hospital", "হাসপাতাল বেছে নিন")} /></SelectTrigger>
            <SelectContent>{ranked.map((h) => <SelectItem key={h.id} value={h.id}>{L(h.name_en, h.name_bn)} · {T(districtLabel(h.district))}{h.verified ? " ✓" : ""}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-12" onClick={() => window.print()}><Printer />{L("Print", "প্রিন্ট")}</Button>
          <Button className="h-12" variant="outline" onClick={share}><Share2 />{L("Share", "শেয়ার")}</Button>
          <Button asChild className="h-12 bg-[#25D366] text-white hover:bg-[#1ebe5b]">
            <a href={whatsappLink(q.data.contact?.phone ?? null, text)} target="_blank" rel="noreferrer" onClick={() => void setStatus("patient_informed")}><MessageSquare />WhatsApp</a>
          </Button>
          <Button className="h-12" variant="outline" disabled={busy || !q.data.contact?.phone} onClick={sms}><Send />SMS</Button>
        </div>
        {role !== "doctor" && (
          <div className="space-y-2 rounded-xl border bg-card p-3">
            <p className="text-sm font-medium">{L("Follow-up: did the patient go?", "ফলোআপ: রোগী কি হাসপাতালে গেছেন?")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={ref.status === "reached" ? "default" : "outline"} className="h-11" onClick={() => setStatus("reached")}><CheckCircle2 />{L("Yes, went", "হ্যাঁ, গেছেন")}</Button>
              <Button variant={ref.status === "not_reached" ? "default" : "outline"} className="h-11" onClick={() => setStatus("not_reached")}>{L("No", "না")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
