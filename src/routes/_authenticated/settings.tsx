import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISTRICTS, districtByName, normalizeBdPhone } from "@/lib/bd";
import { useHospitals } from "@/lib/referral-data";
import { validModelUrl } from "@/lib/capture";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings – Netra AI" }, { name: "description", content: "Alerts, hospitals and model versions." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <SettingsPage />
    </RoleGate>
  ),
});

function SettingsPage() {
  const { L } = useLang();
  const { role } = useAuth();
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageTitle>{L("Settings", "সেটিংস")}</PageTitle>
      {(role === "doctor" || role === "admin") && <Alerts />}
      {role === "admin" && <Hospitals />}
      {role === "admin" && <ModelRuns />}
      {role === "admin" && <AuditRate />}
    </div>
  );
}

function Alerts() {
  const { L } = useLang();
  const { userId } = useAuth();
  const [phone, setPhone] = useState(""), [on, setOn] = useState(false);
  const q = useQuery({ queryKey: ["my-profile", userId], enabled: !!userId, queryFn: async () => (await supabase.from("profiles").select("phone, notify_sms").eq("id", userId!).single()).data });
  useEffect(() => { if (q.data) { setPhone(q.data.phone ?? ""); setOn(q.data.notify_sms); } }, [q.data]);
  const save = async () => {
    const p = phone.trim() ? normalizeBdPhone(phone) : null;
    if (phone.trim() && !p) { toast.error(L("Invalid mobile number", "মোবাইল নম্বর সঠিক নয়")); return; }
    const { error } = await supabase.from("profiles").update({ phone: p, notify_sms: on && !!p }).eq("id", userId!);
    if (error) toast.error(error.message); else toast.success(L("Saved", "সংরক্ষিত"));
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold">{L("SMS alert for urgent referrals", "জরুরি রেফারালের SMS সতর্কতা")}</h2>
      <Input className="h-12" type="tel" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><Switch checked={on} onCheckedChange={setOn} />{L("Send me an SMS when the AI flags a patient", "AI কোনো রোগীকে সন্দেহ করলে আমাকে SMS দিন")}</label>
      <Button className="h-11" onClick={save}>{L("Save", "সংরক্ষণ")}</Button>
    </section>
  );
}

const SERVICES = [
  { v: "cataract_surgery", en: "Cataract surgery", bn: "ছানি অপারেশন" },
  { v: "spectacles", en: "Glasses", bn: "চশমা" },
  { v: "eye_opd", en: "Eye OPD", bn: "চক্ষু বহির্বিভাগ" },
  { v: "emergency", en: "Emergency", bn: "জরুরি" },
];

function Hospitals() {
  const { L } = useLang();
  const qc = useQueryClient();
  const hospitals = useHospitals();
  const empty = { name_en: "", name_bn: "", district: "", address_bn: "", phone: "", services: [] as string[], cost_note_bn: "", verified: false };
  const [f, setF] = useState(empty), [editId, setEditId] = useState<string | null>(null);
  const save = async () => {
    if (!f.name_en.trim() || !f.name_bn.trim() || !f.district) { toast.error(L("Name and district are required", "নাম ও জেলা দিতে হবে")); return; }
    const row = { ...f, division: districtByName(f.district)?.division ?? null, phone: f.phone.trim() || null, address_bn: f.address_bn.trim() || null, cost_note_bn: f.cost_note_bn.trim() || null, updated_at: new Date().toISOString() };
    const { error } = editId ? await supabase.from("hospitals").update(row).eq("id", editId) : await supabase.from("hospitals").insert(row);
    if (error) { toast.error(error.message); return; }
    setF(empty); setEditId(null); await qc.invalidateQueries({ queryKey: ["hospitals"] }); toast.success(L("Saved", "সংরক্ষিত"));
  };
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{L("Referral hospitals", "রেফারাল হাসপাতাল")}</h2>
      <p className="text-sm text-muted-foreground">{L("Call each hospital to confirm phone, services and cost, then tick Verified.", "প্রতিটি হাসপাতালে ফোন করে নম্বর, সেবা ও খরচ নিশ্চিত করে \"যাচাই হয়েছে\" দিন।")}</p>
      <ul className="divide-y rounded-xl border bg-card">
        {hospitals.data?.map((h) => (
          <li key={h.id} className="flex items-center gap-2 p-3 text-sm">
            <span className="flex-1">{h.name_bn}<span className="block text-xs text-muted-foreground">{h.district} · {h.services.join(", ")} {h.verified ? "✓" : `· ${L("not verified", "যাচাই হয়নি")}`}</span></span>
            <Button size="sm" variant="outline" onClick={() => { setEditId(h.id); setF({ name_en: h.name_en, name_bn: h.name_bn, district: h.district, address_bn: h.address_bn ?? "", phone: h.phone ?? "", services: h.services, cost_note_bn: h.cost_note_bn ?? "", verified: h.verified }); }}>{L("Edit", "সম্পাদনা")}</Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 rounded-xl border bg-card p-4">
        <p className="font-medium">{editId ? L("Edit hospital", "হাসপাতাল সম্পাদনা") : L("Add hospital", "হাসপাতাল যোগ করুন")}</p>
        <Input placeholder="Name (English)" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        <Input placeholder="নাম (বাংলা)" value={f.name_bn} onChange={(e) => setF({ ...f, name_bn: e.target.value })} />
        <Select value={f.district} onValueChange={(district) => setF({ ...f, district })}>
          <SelectTrigger><SelectValue placeholder={L("District", "জেলা")} /></SelectTrigger>
          <SelectContent>{DISTRICTS.map((d) => <SelectItem key={d.en} value={d.en}>{L(d.en, d.bn)}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="ঠিকানা (বাংলা)" value={f.address_bn} onChange={(e) => setF({ ...f, address_bn: e.target.value })} />
        <Input placeholder={L("Phone", "ফোন")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="খরচ/সময় নোট (বাংলা)" value={f.cost_note_bn} onChange={(e) => setF({ ...f, cost_note_bn: e.target.value })} />
        <div className="flex flex-wrap gap-3 text-sm">
          {SERVICES.map((s) => <label key={s.v} className="flex items-center gap-1"><input type="checkbox" checked={f.services.includes(s.v)} onChange={(e) => setF({ ...f, services: e.target.checked ? [...f.services, s.v] : f.services.filter((x) => x !== s.v) })} />{L(s.en, s.bn)}</label>)}
          <label className="flex items-center gap-1 font-medium"><input type="checkbox" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />{L("Verified", "যাচাই হয়েছে")}</label>
        </div>
        <div className="flex gap-2"><Button onClick={save}>{L("Save", "সংরক্ষণ")}</Button>{editId && <Button variant="outline" onClick={() => { setEditId(null); setF(empty); }}>{L("Cancel", "বাতিল")}</Button>}</div>
      </div>
    </section>
  );
}

function ModelRuns() {
  const { L } = useLang();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["model-runs"], queryFn: async () => (await supabase.from("model_runs").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [f, setF] = useState({ version: "", model_url: "", threshold: "", notes: "" });
  const add = async () => {
    const t = Number(f.threshold);
    if (!f.version.trim() || !validModelUrl(f.model_url.trim()) || !(t > 0 && t < 1)) { toast.error(L("Version, HTTPS model URL and a threshold between 0 and 1 are required.", "ভার্সন, HTTPS মডেল URL ও ০–১ এর মধ্যে থ্রেশহোল্ড দিন।")); return; }
    const { error } = await supabase.from("model_runs").insert({ version: f.version.trim(), model_url: f.model_url.trim(), threshold: t, notes: f.notes.trim() || null });
    if (error) { toast.error(error.message); return; }
    setF({ version: "", model_url: "", threshold: "", notes: "" }); await qc.invalidateQueries({ queryKey: ["model-runs"] });
  };
  const activate = async (id: string) => {
    await supabase.from("model_runs").update({ active: false }).eq("active", true);
    const { error } = await supabase.from("model_runs").update({ active: true }).eq("id", id);
    if (error) toast.error(error.message); else { await qc.invalidateQueries({ queryKey: ["model-runs"] }); await qc.invalidateQueries({ queryKey: ["active-model"] }); toast.success(L("Model activated", "মডেল চালু হয়েছে")); }
  };
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{L("AI model versions", "AI মডেলের ভার্সন")}</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {q.data?.map((m) => (
          <li key={m.id} className="flex items-center gap-2 p-3 text-sm">
            <span className="flex-1"><b>{m.version}</b> · {L("refer", "রেফার")} ≥ {m.threshold.toFixed(3)}{m.review_threshold != null && <> · {L("review", "ডাক্তার দেখবেন")} ≥ {m.review_threshold.toFixed(3)}</>}<span className="block truncate text-xs text-muted-foreground">{m.model_url}</span></span>
            {m.active ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs">{L("Active", "চালু")}</span> : <Button size="sm" variant="outline" onClick={() => activate(m.id)}>{L("Activate", "চালু করুন")}</Button>}
          </li>
        ))}
      </ul>
      <div className="grid gap-2 rounded-xl border bg-card p-4">
        <Label>{L("Register a model", "মডেল যোগ করুন")}</Label>
        <Input placeholder="v3.0-pupil-crop" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} />
        <Input placeholder="https://…/model.json" value={f.model_url} onChange={(e) => setF({ ...f, model_url: e.target.value })} />
        <Input placeholder={L("Threshold (from validation)", "থ্রেশহোল্ড (ভ্যালিডেশন থেকে)")} inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} />
        <Input placeholder={L("Notes", "নোট")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Button onClick={add}>{L("Add", "যোগ করুন")}</Button>
      </div>
    </section>
  );
}

/** Share of AI-negative patients sent to a doctor at random so missed cataracts can be counted (pilot 10%). */
function AuditRate() {
  const { L } = useLang();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["screening-config"], queryFn: async () => (await supabase.from("screening_config").select("audit_rate").eq("id", 1).maybeSingle()).data });
  const [v, setV] = useState("");
  const save = async () => {
    const pct = Number(v);
    if (!(pct > 0 && pct <= 100)) { toast.error(L("Enter a percentage between 1 and 100.", "১ থেকে ১০০-এর মধ্যে শতাংশ দিন।")); return; }
    const { error } = await supabase.from("screening_config").update({ audit_rate: pct / 100, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    toast.success(L("Saved", "সংরক্ষিত")); setV(""); await qc.invalidateQueries({ queryKey: ["screening-config"] });
  };
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{L("Random audit of AI-negative patients", "AI-নেগেটিভ রোগীর গোপন যাচাই")}</h2>
      <p className="text-sm text-muted-foreground">{L("Current rate", "এখনকার হার")}: <b>{q.data ? Math.round(q.data.audit_rate * 100) : "–"}%</b>. {L("Use 10–20% during a pilot, lower at scale.", "পাইলটে ১০–২০%, বড় পরিসরে কম।")}</p>
      <div className="flex gap-2">
        <Input inputMode="decimal" placeholder="10" value={v} onChange={(e) => setV(e.target.value)} />
        <Button onClick={save}>{L("Save", "সংরক্ষণ")}</Button>
      </div>
    </section>
  );
}
