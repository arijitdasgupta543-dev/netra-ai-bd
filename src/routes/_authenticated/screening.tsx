import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useSites, recordsKey } from "@/lib/data";
import { compressImage, loadImageCached, maskedPupil, canvasToBlob, thumbnail } from "@/lib/image";
import { enqueue, isNetworkError, submitScreening, type PendingScreening } from "@/lib/offline-queue";
import { detectPhoneModel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { EyeCapture, PhotoPicker, Choice, type EyeData } from "@/components/EyeCapture";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PupilFocus } from '@/components/PupilFocus';
import { circleConfirmed } from '@/lib/capture';
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { VisionTest, type VisionResults } from "@/components/VisionTest";
import { DISTRICTS, normalizeBdPhone } from "@/lib/bd";
import { useActiveModel, scorePupil, bandOf, type Band } from "@/lib/inference";
import { decideReferral, typeLabel, type Decision } from "@/lib/referral";
import { notifyDoctors } from "@/lib/notify.functions";
import type { PendingPrediction } from "@/lib/offline-queue";

export const Route = createFileRoute("/_authenticated/screening")({
  head: () => ({ meta: [{ title: "New screening – Netra AI" }, { name: "description", content: "Record a new consented eye screening." }, { property: "og:title", content: "New screening – Netra AI" }, { property: "og:description", content: "Record a new consented eye screening." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker"]}>
      <ScreeningWizard />
    </RoleGate>
  ),
});

type Patient = { age: string; sex: "male" | "female" | "other" | ""; area: string; district: string; siteId: string };
type Contact = { use: "yes" | "no"; name: string; phone: string; address: string };
type AiEye = { status: "running" | "done" | "missing" | "error"; score?: number; positive?: boolean; band?: Band; ms?: number };

function ScreeningWizard() {
  const { L, T } = useLang();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const sites = useSites();
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [consentType, setConsentType] = useState<"verbal" | "written">("verbal");
  const [consentPhoto, setConsentPhoto] = useState<Blob | null>(null);
  const [patient, setPatient] = useState<Patient>({ age: "", sex: "", area: "", district: "", siteId: "" });
  const [contact, setContact] = useState<Contact>({ use: "yes", name: "", phone: "", address: "" });
  const [vision, setVision] = useState<VisionResults>({});
  const [ai, setAi] = useState<Partial<Record<"left" | "right", AiEye>>>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const model = useActiveModel();
  const [left, setLeft] = useState<EyeData | null>(null);
  const [right, setRight] = useState<EyeData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [phone, setPhone] = useState("Unknown");

  useEffect(() => { void detectPhoneModel(navigator).then(setPhone); }, []);
  useEffect(() => {
    if (!patient.siteId && sites.data?.length) {
      const def = sites.data.find((s) => s.name === "Medical Centre 1") ?? sites.data[0];
      if (def) setPatient((p) => ({ ...p, siteId: def.id }));
    }
  }, [sites.data, patient.siteId]);

  const steps = [L("Consent", "সম্মতি"), L("Patient", "রোগী"), L("Left eye", "বাম চোখ"), L("Right eye", "ডান চোখ"), L("Vision", "দৃষ্টি"), L("Result", "ফলাফল")];
  const LAST = steps.length - 1;
  const phoneNorm = contact.phone.trim() ? normalizeBdPhone(contact.phone) : null;
  const contactOk = contact.use === "no" || (contact.name.trim().length > 0 && (!contact.phone.trim() || !!phoneNorm));
  const patientOk = patient.age !== "" && Number(patient.age) >= 0 && Number(patient.age) < 120 && patient.sex !== "" && patient.district !== "" && contactOk;

  // Run the on-device AI on both eyes when the result step opens (works offline once the model is cached).
  useEffect(() => {
    if (step !== LAST || !model.data) return;
    let cancelled = false;
    const m = model.data;
    void (async () => {
      for (const [eye, d] of [["left", left], ["right", right]] as const) {
        if (!d?.circle || !d.circleConfirmed || ai[eye]?.status === "done") continue;
        setAi((a) => ({ ...a, [eye]: { status: "running" } }));
        try {
          const r = await scorePupil(m.url, d.url, d.circle);
          if (cancelled) return;
          setAi((a) => ({ ...a, [eye]: r ? { status: "done", score: r.score, positive: r.score >= m.threshold, band: bandOf(r.score, m), ms: r.ms } : { status: "missing" } }));
        } catch { if (!cancelled) setAi((a) => ({ ...a, [eye]: { status: "error" } })); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, model.data, left, right]);

  useEffect(() => {
    if (step !== LAST) return;
    setDecision(decideReferral((["left", "right"] as const).map((eye) => ({
      eye, aiPositive: ai[eye]?.status === "done" ? !!ai[eye]?.positive : null,
      logmar: vision[eye]?.logmar ?? null, visionTested: !!vision[eye], pinholeImproves: vision[eye]?.pinhole_improves ?? null,
    }))));
  }, [step, ai, vision, LAST]);
  const aiBusy = Object.values(ai).some((a) => a?.status === "running");

  const reset = () => {
    setStep(0); setConsent(false); setConsentType("verbal"); setConsentPhoto(null);
    setPatient((p) => ({ age: "", sex: "", area: "", district: p.district, siteId: p.siteId }));
    setContact({ use: "yes", name: "", phone: "", address: "" }); setVision({}); setAi({}); setDecision(null);
    setLeft(null); setRight(null); setSaved(null); setQueued(false);
  };

  const save = async () => {
    if (!userId || !consent || !patientOk || (!left && !right) || (left && !circleConfirmed(left.circle, left.circleConfirmed)) || (right && !circleConfirmed(right.circle, right.circleConfirmed))) return;
    setSaving(true);
    let item: PendingScreening | null = null;
    try {
      // Prepare everything first (pupil ROI + thumbnail are made on the phone), so a
      // dropped connection can be retried later without the original photos in memory.
      const eyes = [];
      for (const [eye, d] of [["left", left], ["right", right]] as const) {
        if (!d || !d.circle) continue;
        const img = await loadImageCached(d.url);
        const roiCanvas = maskedPupil(img, d.circle);
        eyes.push({
          id: crypto.randomUUID(),
          eye,
          photo: d.blob,
          roi: await canvasToBlob(roiCanvas, "image/jpeg", 0.9),
          thumb: await canvasToBlob(thumbnail(roiCanvas, 160), "image/jpeg", 0.8),
          row: {
            pupil_circle_confirmed: true,
            circle_method: d.circleMethod ?? "manual",
            guide_box: d.guide ? { ...d.guide } : null,
            capture_checks: d.captureChecks ? { ...d.captureChecks } : null,
            circle_cx: d.circle.cx,
            circle_cy: d.circle.cy,
            circle_r: d.circle.r,
            flash_used: d.flash,
            lighting: d.lighting,
            phone_model: d.phoneModel,
            blur_score: d.quality?.blur ?? null,
            brightness: d.quality?.brightness ?? null,
            glare_fraction: d.quality?.glare ?? null,
            quality_status: d.quality?.status ?? null,
            visual_acuity: d.acuity || null,
            notes: d.notes || null,
          },
        });
      }
      const m = model.data;
      const predictions: PendingPrediction[] = [];
      for (const e of eyes) {
        const r = ai[e.eye];
        if (m && r?.status === "done" && r.score != null) predictions.push({ eyeId: e.id, model_run_id: m.id, model_url: m.url, threshold: m.threshold, score: r.score, positive: !!r.positive, inference_ms: r.ms ?? null });
      }
      const fieldRef = decision && decision.refer && decision.reason === "low_vision" && decision.type !== "none" ? { reason: "low_vision" as const, referral_type: decision.type, priority: decision.priority === "urgent" ? "urgent" as const : "routine" as const } : null;
      item = {
        key: crypto.randomUUID(),
        createdAt: Date.now(),
        userId,
        consentPhoto,
        patient: {
          age: Number(patient.age),
          sex: patient.sex || null,
          area: patient.area || null,
          district: patient.district || null,
          site_id: patient.siteId || null,
          consent_given: true,
          consent_type: consentType,
        },
        eyes,
        contact: contact.use === "yes" ? { full_name: contact.name.trim(), phone: phoneNorm, address: contact.address.trim() || null } : null,
        predictions,
        vision: (["left", "right"] as const).flatMap((eye) => { const v = vision[eye]; return v ? [{ eye, ...v }] : []; }),
        referral: fieldRef,
      };
      const studyId = await submitScreening(item);
      // best effort: SMS alert to opted-in doctors for urgent referrals (the in-app queue works regardless)
      if (decision?.priority === "urgent") void notifyDoctors({ data: { patientId: item.key } }).catch(() => {});
      qc.invalidateQueries({ queryKey: recordsKey });
      setSaved(studyId);
    } catch (e) {
      if (item && isNetworkError(e)) {
        try { await enqueue(item); setQueued(true); setSaved("…"); }
        catch { toast.error(L("Could not store offline: ", "অফলাইনে রাখা যায়নি: ") + (e as Error).message); }
      } else toast.error(L("Could not save: ", "সংরক্ষণ হয়নি: ") + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (saved)
    return (
      <div className={cn("mx-auto max-w-md rounded-2xl border p-8 text-center", queued ? "bg-warning-soft" : "bg-success-soft")}>
        {queued ? <CloudOff className="mx-auto h-14 w-14 text-warning" /> : <CheckCircle2 className="mx-auto h-14 w-14 text-success" />}
        <p className="mt-3 text-lg font-semibold">{queued ? L("Saved on this phone – pending upload", "ফোনে সংরক্ষিত – আপলোডের অপেক্ষায়") : L("Screening saved", "স্ক্রিনিং সংরক্ষিত হয়েছে")}</p>
        {queued ? (
          <p className="mt-2 text-sm text-muted-foreground">{L("No network. It will upload automatically when the internet is back. The Study ID is given after upload.", "নেটওয়ার্ক নেই। ইন্টারনেট ফিরলে নিজে থেকেই আপলোড হবে। আপলোডের পর স্টাডি আইডি পাওয়া যাবে।")}</p>
        ) : (<>
        <p className="mt-2 text-sm text-muted-foreground">{L("Study ID", "স্টাডি আইডি")}</p>
        <p className="font-mono text-3xl font-bold tracking-wider">{saved}</p></>)}
        <div className="mt-4 grid grid-cols-2 gap-3">{[left,right].map((d,i) => d?.circle ? <PupilFocus key={i} src={d.url} circle={d.circle}/> : null)}</div>
        {decision?.refer && (
          <div className={cn("mt-4 rounded-xl border p-3 text-left text-sm", decision.priority === "urgent" ? "border-destructive bg-danger-soft" : "border-warning bg-warning-soft")}>
            <p className="font-semibold">{L("Referral", "রেফারাল")}: {T(typeLabel[decision.type])}</p>
            <p>{decision.reason === "ai_suspected" ? L("Sent automatically to the doctor's urgent list.", "স্বয়ংক্রিয়ভাবে ডাক্তারের জরুরি তালিকায় পাঠানো হয়েছে।") : L("Added to the referral list.", "রেফারাল তালিকায় যোগ হয়েছে।")}</p>
          </div>
        )}
        <div className="mt-6 grid gap-2">
          <Button className="h-12 text-base" onClick={reset}>{L("New screening", "নতুন স্ক্রিনিং")}</Button>
          {!queued && decision?.refer && <Button asChild variant="default" className="h-12 bg-destructive">
            <Link to="/slip/$studyId" params={{ studyId: saved }}>{L("Patient referral slip", "রোগীর রেফারাল স্লিপ")}</Link>
          </Button>}
          {!queued && <Button asChild variant="outline" className="h-12">
            <Link to="/records/$studyId" params={{ studyId: saved }}>{L("View record", "রেকর্ড দেখুন")}</Link>
          </Button>}
        </div>
      </div>
    );

  const eyeMissingCircle = (d: EyeData | null) => d && !circleConfirmed(d.circle, d.circleConfirmed);

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
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="font-semibold">{L("Contact for referral & follow-up", "রেফারাল ও ফলোআপের জন্য যোগাযোগ")}</p>
            <p className="text-xs text-muted-foreground">{L("Kept in a separate protected list, seen only by doctors and you. Never used in research data or AI training.", "আলাদা সুরক্ষিত তালিকায় থাকে, শুধু ডাক্তার ও আপনি দেখতে পারবেন। গবেষণার ডেটা বা AI ট্রেনিংয়ে কখনো যায় না।")}</p>
            <Choice value={contact.use} onChange={(use) => setContact({ ...contact, use })} options={[{ v: "yes", label: L("Patient agrees to give contact", "রোগী যোগাযোগের তথ্য দিতে রাজি") }, { v: "no", label: L("Does not want to", "দিতে চান না") }]} />
            {contact.use === "yes" && <>
              <div className="space-y-1"><Label>{L("Name", "নাম")}</Label><Input className="h-12" maxLength={120} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>{L("Mobile number", "মোবাইল নম্বর")}</Label><Input className="h-12" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                {contact.phone.trim() !== "" && !phoneNorm && <p className="text-sm text-destructive">{L("Enter an 11-digit mobile number (01…).", "১১ সংখ্যার মোবাইল নম্বর দিন (01…)।")}</p>}</div>
              <div className="space-y-1"><Label>{L("Address (village, union)", "ঠিকানা (গ্রাম, ইউনিয়ন)")}</Label><Textarea maxLength={300} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></div>
            </>}
          </div>
          <div className="space-y-2">
            <Label>{L("Age (years)", "বয়স (বছর)")}</Label>
            <Input type="number" inputMode="numeric" min={0} max={120} className="h-12 text-lg" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{L("Sex", "লিঙ্গ")}</Label>
            <Choice value={patient.sex} onChange={(sex) => setPatient({ ...patient, sex })} options={[{ v: "male", label: L("Male", "পুরুষ") }, { v: "female", label: L("Female", "মহিলা") }, { v: "other", label: L("Other", "অন্যান্য") }]} />
          </div>
          <div className="space-y-2">
            <Label>{L("District", "জেলা")}</Label>
            <Select value={patient.district} onValueChange={(district) => setPatient({ ...patient, district })}>
              <SelectTrigger className="h-12"><SelectValue placeholder={L("Choose district", "জেলা বেছে নিন")} /></SelectTrigger>
              <SelectContent>{DISTRICTS.map((d) => <SelectItem key={d.en} value={d.en}>{L(d.en, d.bn)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L("Upazila / Union", "উপজেলা / ইউনিয়ন")}</Label>
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

      {step === 4 && <VisionTest value={vision} onChange={setVision} />}

      {step === LAST && (
        <div className="space-y-3">
        <div className="space-y-2 rounded-xl border bg-card p-5 text-sm">
          <p className="font-semibold">{L("AI screening (research)", "AI স্ক্রিনিং (গবেষণা)")}</p>
          {(["left", "right"] as const).map((eye) => {
            const a = ai[eye], d = eye === "left" ? left : right;
            if (!d) return null;
            return <Row key={eye} k={eye === "left" ? L("Left eye", "বাম চোখ") : L("Right eye", "ডান চোখ")} v={
              !a || a.status === "running" ? L("Checking…", "যাচাই হচ্ছে…")
              : a.status === "missing" ? L("No AI model – doctor will review", "AI মডেল নেই – ডাক্তার দেখবেন")
              : a.status === "error" ? L("AI error – doctor will review", "AI ত্রুটি – ডাক্তার দেখবেন")
              : a.band === "refer" ? L("Possible cataract – urgent referral", "সম্ভাব্য ছানি – জরুরি রেফার")
              : a.band === "review" ? L("Unclear – a doctor will look at the photo", "অস্পষ্ট – ডাক্তার ছবিটি দেখবেন")
              : L("No sign found", "লক্ষণ পাওয়া যায়নি")} />;
          })}
          {model.data && !model.data.calibrated && <p className="text-xs text-muted-foreground">{L("Model threshold not calibrated yet.", "মডেলের থ্রেশহোল্ড এখনো ঠিক করা হয়নি।")}</p>}
          <p className="text-xs text-muted-foreground">{L("Not a diagnosis. A doctor reviews every referred case.", "এটি রোগ নির্ণয় নয়। প্রতিটি রেফার করা কেস ডাক্তার দেখবেন।")}</p>
        </div>
        {decision && (
          <div className={cn("rounded-xl border p-4 text-sm", decision.refer ? (decision.priority === "urgent" ? "border-destructive bg-danger-soft" : "border-warning bg-warning-soft") : "bg-success-soft")}>
            <p className="font-semibold">{decision.refer ? L("Refer: ", "রেফার: ") + T(typeLabel[decision.type]) : L("No referral needed now", "এখন রেফারের প্রয়োজন নেই")}</p>
            {!decision.refer && <p>{L("Advise a yearly eye check.", "বছরে একবার চোখ পরীক্ষার পরামর্শ দিন।")}</p>}
          </div>
        )}
        <div className="space-y-3 rounded-xl border bg-card p-5 text-sm">
          <Row k={L("Consent", "সম্মতি")} v={consentType === "verbal" ? L("Verbal", "মৌখিক") : L("Written", "লিখিত")} />
          <Row k={L("Age", "বয়স")} v={patient.age} />
          <Row k={L("Sex", "লিঙ্গ")} v={patient.sex} />
          <Row k={L("Left eye", "বাম চোখ")} v={left ? (left.quality?.status ?? "✓") : L("Skipped", "বাদ")} />
          <Row k={L("Right eye", "ডান চোখ")} v={right ? (right.quality?.status ?? "✓") : L("Skipped", "বাদ")} />
          <Row k={L("Vision R / L", "দৃষ্টি ডান / বাম")} v={`${vision.right ? vision.right.snellen ?? "<6/60" : "–"} / ${vision.left ? vision.left.snellen ?? "<6/60" : "–"}`} />
          {!left && !right && <p className="text-destructive">{L("Add at least one eye photo.", "অন্তত একটি চোখের ছবি দিন।")}</p>}
        </div>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex gap-2 border-t bg-background/95 py-3 backdrop-blur">
        {step > 0 && <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(step - 1)}>{L("Back", "পিছনে")}</Button>}
        {(step === 2 || step === 3) && !(step === 2 ? left : right) && (
          <Button variant="secondary" className="h-12 flex-1" onClick={() => setStep(step + 1)}>{L("Skip this eye", "এই চোখ বাদ দিন")}</Button>
        )}
        {step === 4 && !vision.left && !vision.right && (
          <Button variant="secondary" className="h-12 flex-1" onClick={() => setStep(step + 1)}>{L("Skip vision test", "দৃষ্টি পরীক্ষা বাদ দিন")}</Button>
        )}
        {step < LAST && !((step === 2 || step === 3) && !(step === 2 ? left : right)) && !(step === 4 && !vision.left && !vision.right) && (
          <Button
            className="h-12 flex-1 text-base"
            disabled={(step === 0 && !consent) || (step === 1 && !patientOk) || (step === 2 && !!eyeMissingCircle(left)) || (step === 3 && !!eyeMissingCircle(right))}
            onClick={() => setStep(step + 1)}
          >
            {L("Next", "পরবর্তী")}
          </Button>
        )}
        {step === LAST && (
          <Button className="h-12 flex-1 text-base" disabled={saving || aiBusy || (!left && !right) || !!eyeMissingCircle(left) || !!eyeMissingCircle(right)} onClick={save}>
            {saving ? L("Saving…", "সংরক্ষণ হচ্ছে…") : L("Save", "সংরক্ষণ করুন")}
          </Button>
        )}
      </div>
      {(step === 2 || step === 3) && eyeMissingCircle(step === 2 ? left : right) && (
        <p className="text-center text-sm text-muted-foreground">{L("Confirm the pupil circle to continue.", "চালিয়ে যেতে মণির বৃত্ত নিশ্চিত করুন।")}</p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b pb-2 last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
