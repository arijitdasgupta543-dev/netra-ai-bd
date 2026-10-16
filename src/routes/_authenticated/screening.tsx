import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSites, recordsKey } from "@/lib/data";
import { compressImage } from "@/lib/image";
import { uploadPhoto } from "@/lib/storage";
import { guessPhoneModel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { EyeCapture, PhotoPicker, Choice, type EyeData } from "@/components/EyeCapture";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/screening")({
  head: () => ({ meta: [{ title: "New screening – Netra AI" }, { name: "description", content: "Record a new consented eye screening." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker"]}>
      <ScreeningWizard />
    </RoleGate>
  ),
});

type Patient = { age: string; sex: "male" | "female" | "other" | ""; area: string; siteId: string };

function ScreeningWizard() {
  const { L } = useLang();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const sites = useSites();
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [consentType, setConsentType] = useState<"verbal" | "written">("verbal");
  const [consentPhoto, setConsentPhoto] = useState<Blob | null>(null);
  const [patient, setPatient] = useState<Patient>({ age: "", sex: "", area: "", siteId: "" });
  const [left, setLeft] = useState<EyeData | null>(null);
  const [right, setRight] = useState<EyeData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [phone, setPhone] = useState("Unknown");

  useEffect(() => setPhone(guessPhoneModel(navigator.userAgent)), []);
  useEffect(() => {
    if (!patient.siteId && sites.data?.length) {
      const def = sites.data.find((s) => s.name === "Medical Centre 1") ?? sites.data[0];
      if (def) setPatient((p) => ({ ...p, siteId: def.id }));
    }
  }, [sites.data, patient.siteId]);

  const steps = [L("Consent", "সম্মতি"), L("Patient", "রোগী"), L("Left eye", "বাম চোখ"), L("Right eye", "ডান চোখ"), L("Save", "সংরক্ষণ")];
  const patientOk = patient.age !== "" && Number(patient.age) >= 0 && Number(patient.age) < 120 && patient.sex !== "";

  const reset = () => {
    setStep(0); setConsent(false); setConsentType("verbal"); setConsentPhoto(null);
    setPatient((p) => ({ age: "", sex: "", area: "", siteId: p.siteId }));
    setLeft(null); setRight(null); setSaved(null);
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const consentPath = consentPhoto ? await uploadPhoto("consent", consentPhoto) : null;
      const { data: p, error } = await supabase
        .from("patients")
        .insert({
          age: Number(patient.age),
          sex: patient.sex || null,
          area: patient.area || null,
          site_id: patient.siteId || null,
          consent_given: true,
          consent_type: consentType,
          consent_photo_path: consentPath,
          created_by: userId,
        })
        .select("id, study_id")
        .single();
      if (error) throw error;
      for (const [eye, d] of [["left", left], ["right", right]] as const) {
        if (!d) continue;
        const path = await uploadPhoto(`eyes/${p.study_id}`, d.blob);
        const { error: e2 } = await supabase.from("eye_images").insert({
          patient_id: p.id,
          eye,
          storage_path: path,
          circle_cx: d.circle?.cx ?? null,
          circle_cy: d.circle?.cy ?? null,
          circle_r: d.circle?.r ?? null,
          flash_used: d.flash,
          lighting: d.lighting,
          phone_model: d.phoneModel,
          blur_score: d.quality?.blur ?? null,
          brightness: d.quality?.brightness ?? null,
          glare_fraction: d.quality?.glare ?? null,
          quality_status: d.quality?.status ?? null,
          visual_acuity: d.acuity || null,
          notes: d.notes || null,
          created_by: userId,
        });
        if (e2) throw e2;
      }
      qc.invalidateQueries({ queryKey: recordsKey });
      setSaved(p.study_id);
    } catch (e) {
      toast.error(L("Could not save: ", "সংরক্ষণ হয়নি: ") + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (saved)
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-success-soft p-8 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
        <p className="mt-3 text-lg font-semibold">{L("Screening saved", "স্ক্রিনিং সংরক্ষিত হয়েছে")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{L("Study ID", "স্টাডি আইডি")}</p>
        <p className="font-mono text-3xl font-bold tracking-wider">{saved}</p>
        <div className="mt-6 grid gap-2">
          <Button className="h-12 text-base" onClick={reset}>{L("New screening", "নতুন স্ক্রিনিং")}</Button>
          <Button asChild variant="outline" className="h-12">
            <Link to="/records/$studyId" params={{ studyId: saved }}>{L("View record", "রেকর্ড দেখুন")}</Link>
          </Button>
        </div>
      </div>
    );

  const eyeMissingCircle = (d: EyeData | null) => d && !d.circle;

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle>{L("New screening", "নতুন স্ক্রিনিং")}</PageTitle>
      <ol className="mb-6 flex gap-1">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <p className={cn("mt-1 truncate text-[11px]", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5 h-6 w-6" />
            <span className="font-medium">{L("Patient (or guardian) gave informed consent", "রোগী (বা অভিভাবক) জেনে-বুঝে সম্মতি দিয়েছেন")}</span>
          </label>
          <div className="space-y-2">
            <Label>{L("Consent type", "সম্মতির ধরন")}</Label>
            <Choice value={consentType} onChange={setConsentType} options={[{ v: "verbal", label: L("Verbal", "মৌখিক") }, { v: "written", label: L("Written", "লিখিত") }]} />
          </div>
          {consentPhoto ? (
            <div className="space-y-2">
              <img src={URL.createObjectURL(consentPhoto)} alt="" className="max-h-56 rounded-xl border" />
              <Button variant="outline" onClick={() => setConsentPhoto(null)}>{L("Remove photo", "ছবি সরান")}</Button>
            </div>
          ) : (
            <PhotoPicker label={L("Photo of signed consent form (optional)", "স্বাক্ষরিত সম্মতিপত্রের ছবি (ঐচ্ছিক)")} onPick={async (f) => setConsentPhoto(await compressImage(f, 1600, 0.8))} />
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <p className="rounded-xl bg-primary-soft p-3 text-sm">{L("Do not record names or phone numbers. A Study ID is created automatically.", "নাম বা ফোন নম্বর লিখবেন না। স্টাডি আইডি স্বয়ংক্রিয়ভাবে তৈরি হবে।")}</p>
          <div className="space-y-2">
            <Label>{L("Age (years)", "বয়স (বছর)")}</Label>
            <Input type="number" inputMode="numeric" min={0} max={120} className="h-12 text-lg" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{L("Sex", "লিঙ্গ")}</Label>
            <Choice value={patient.sex} onChange={(sex) => setPatient({ ...patient, sex })} options={[{ v: "male", label: L("Male", "পুরুষ") }, { v: "female", label: L("Female", "মহিলা") }, { v: "other", label: L("Other", "অন্যান্য") }]} />
          </div>
          <div className="space-y-2">
            <Label>{L("District / Upazila", "জেলা / উপজেলা")}</Label>
            <Input className="h-12" value={patient.area} onChange={(e) => setPatient({ ...patient, area: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{L("Screening site", "স্ক্রিনিং স্থান")}</Label>
            <Select value={patient.siteId} onValueChange={(siteId) => setPatient({ ...patient, siteId })}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sites.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">{L("Date", "তারিখ")}: {new Date().toLocaleDateString()}</p>
        </div>
      )}

      {step === 2 && <EyeCapture value={left} onChange={setLeft} defaultPhone={phone} />}
      {step === 3 && <EyeCapture value={right} onChange={setRight} defaultPhone={left?.phoneModel ?? phone} />}

      {step === 4 && (
        <div className="space-y-3 rounded-xl border bg-card p-5 text-sm">
          <Row k={L("Consent", "সম্মতি")} v={consentType === "verbal" ? L("Verbal", "মৌখিক") : L("Written", "লিখিত")} />
          <Row k={L("Age", "বয়স")} v={patient.age} />
          <Row k={L("Sex", "লিঙ্গ")} v={patient.sex} />
          <Row k={L("Left eye", "বাম চোখ")} v={left ? (left.quality?.status ?? "✓") : L("Skipped", "বাদ")} />
          <Row k={L("Right eye", "ডান চোখ")} v={right ? (right.quality?.status ?? "✓") : L("Skipped", "বাদ")} />
          {!left && !right && <p className="text-destructive">{L("Add at least one eye photo.", "অন্তত একটি চোখের ছবি দিন।")}</p>}
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex gap-2 border-t bg-background/95 py-3 backdrop-blur">
        {step > 0 && <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(step - 1)}>{L("Back", "পিছনে")}</Button>}
        {(step === 2 || step === 3) && !(step === 2 ? left : right) && (
          <Button variant="secondary" className="h-12 flex-1" onClick={() => setStep(step + 1)}>{L("Skip this eye", "এই চোখ বাদ দিন")}</Button>
        )}
        {step < 4 && !((step === 2 || step === 3) && !(step === 2 ? left : right)) && (
          <Button
            className="h-12 flex-1 text-base"
            disabled={(step === 0 && !consent) || (step === 1 && !patientOk) || (step === 2 && !!eyeMissingCircle(left)) || (step === 3 && !!eyeMissingCircle(right))}
            onClick={() => setStep(step + 1)}
          >
            {L("Next", "পরবর্তী")}
          </Button>
        )}
        {step === 4 && (
          <Button className="h-12 flex-1 text-base" disabled={saving || (!left && !right)} onClick={save}>
            {saving ? L("Saving…", "সংরক্ষণ হচ্ছে…") : L("Save", "সংরক্ষণ করুন")}
          </Button>
        )}
      </div>
      {(step === 2 || step === 3) && eyeMissingCircle(step === 2 ? left : right) && (
        <p className="text-center text-sm text-muted-foreground">{L("Mark the pupil circle to continue.", "চালিয়ে যেতে মণির বৃত্ত চিহ্নিত করুন।")}</p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b pb-2 last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
