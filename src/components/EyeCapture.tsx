import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, Wand2, Hand, CheckCircle2, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { analyseQuality, compressImage, loadImageCached, type Circle, type Quality } from "@/lib/image";
import { CircleEditor } from "./CircleEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GuidedCamera, type GuidedPhoto } from './GuidedCamera';
import { PupilFocus } from './PupilFocus';
import { nextCircleMethod, type GuideBox, type CaptureChecks, type CircleMethod } from '@/lib/capture';

export type EyeData = {
  blob: Blob;
  url: string;
  circle: Circle | null;
  circleConfirmed: boolean;
  flash: boolean;
  lighting: "indoor" | "outdoor" | "torch";
  phoneModel: string;
  quality: Quality | null;
  acuity: string;
  notes: string;
  guide: GuideBox | null;
  captureChecks: CaptureChecks | null;
  /** Circle found automatically (camera iris detection or still-photo detection), if any. */
  autoCircle: Circle | null;
  /** How the saved circle was placed: auto / manual / auto-then-edited. */
  circleMethod: CircleMethod | null;
};

export function PhotoPicker({ onPick, label }: { onPick: (f: File) => void; label?: string }) {
  const { L } = useLang();
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = "";
  };
  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="default" className="h-14 text-base" onClick={() => cam.current?.click()}>
          <Camera className="h-5 w-5" /> {L("Camera", "ক্যামেরা")}
        </Button>
        <Button type="button" variant="outline" className="h-14 text-base" onClick={() => gal.current?.click()}>
          <ImagePlus className="h-5 w-5" /> {L("Gallery", "গ্যালারি")}
        </Button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={gal} type="file" accept="image/*" className="hidden" onChange={handle} />
    </div>
  );
}

export function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Button
          type="button"
          variant="outline"
          aria-pressed={value === o.v}
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
            value === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-card",
          )}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

const qualityStyle = {
  good: "bg-success-soft border-success/40",
  fair: "bg-warning-soft border-warning/50",
  poor: "bg-danger-soft border-destructive/40",
};

export function QualityPanel({ q }: { q: Quality }) {
  const { L } = useLang();
  const head = {
    good: L("Photo quality: good", "ছবির মান: ভালো"),
    fair: L("Photo quality: fair – retake if possible", "ছবির মান: মোটামুটি – সম্ভব হলে আবার তুলুন"),
    poor: L("Photo quality: poor – please retake", "ছবির মান: খারাপ – আবার তুলুন"),
  }[q.status];
  return (
    <div className={cn("rounded-xl border p-4", qualityStyle[q.status])}>
      <p className="font-semibold">{head}</p>
      {q.advice.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {q.advice.map((a) => (
            <li key={a.en}>• {L(a.en, a.bn)}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {L("Sharpness", "তীক্ষ্ণতা")} {q.blur.toFixed(0)} · {L("Brightness", "উজ্জ্বলতা")} {q.brightness.toFixed(0)} ·{" "}
        {L("Glare", "প্রতিফলন")} {(q.glare * 100).toFixed(1)}%
      </p>
    </div>
  );
}

export function EyeCapture({
  value,
  onChange,
  defaultPhone,
}: {
  value: EyeData | null;
  onChange: (v: EyeData | null) => void;
  defaultPhone: string;
}) {
  const { L } = useLang();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const latestValue = useRef(value);
  latestValue.current = value;

  useEffect(() => {
    if (!value?.url) return setImg(null);
    void loadImageCached(value.url).then(setImg).catch(() => setImg(null));
  }, [value?.url]);

  // Re-run quality check whenever the circle moves
  useEffect(() => {
    if (!img || !value) return;
    const t = setTimeout(() => {
      const current = latestValue.current;
      if (!current || current.url !== value.url) return;
      onChange({ ...current, quality: analyseQuality(img, current.circle) });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, value?.circle?.cx, value?.circle?.cy, value?.circle?.r]);

  const [tab, setTab] = useState<"auto" | "manual">("auto");
  const [detecting, setDetecting] = useState(false);
  const [autoMissing, setAutoMissing] = useState(false);

  const pick = async (f: Blob, guided?: GuidedPhoto) => {
    // Every photo is stored as max 1600 px JPEG q0.85 (smaller uploads on rural networks).
    const blob = await compressImage(f, 1600, 0.85);
    if (value?.url) URL.revokeObjectURL(value.url);
    const autoCircle = guided?.autoCircle ?? null;
    const next: EyeData = {
      blob,
      url: URL.createObjectURL(blob),
      circle: autoCircle ?? guided?.circle ?? { cx: 0.5, cy: 0.5, r: 0.09 },
      circleConfirmed: false,
      guide: guided?.guide ?? null,
      captureChecks: guided?.checks ?? null,
      autoCircle,
      circleMethod: autoCircle ? "auto" : null,
      flash: value?.flash ?? false,
      lighting: guided?.torch ? 'torch' : value?.lighting ?? "indoor",
      phoneModel: value?.phoneModel ?? defaultPhone,
      quality: null,
      acuity: value?.acuity ?? "",
      notes: value?.notes ?? "",
    };
    onChange(next);
    setAutoMissing(false);
    if (autoCircle) { setTab("auto"); return; }
    // Not found live (or gallery photo): try once on the still photo, otherwise go to manual.
    setTab("auto"); setDetecting(true);
    const found = await runDetection(next.url);
    setDetecting(false);
    const cur = latestValue.current;
    if (!cur || cur.url !== next.url) return;
    if (found) onChange({ ...cur, circle: found, autoCircle: found, circleMethod: "auto", circleConfirmed: false });
    else { setAutoMissing(true); setTab("manual"); }
  };

  const chooseAuto = async () => {
    if (!value) return;
    setTab("auto");
    if (value.autoCircle) return set({ circle: value.autoCircle, circleMethod: "auto", circleConfirmed: false });
    setDetecting(true);
    const found = await runDetection(value.url);
    setDetecting(false);
    const cur = latestValue.current;
    if (!cur || cur.url !== value.url) return;
    if (found) onChange({ ...cur, circle: found, autoCircle: found, circleMethod: "auto", circleConfirmed: false });
    else { setAutoMissing(true); setTab("manual"); }
  };

  const set = (patch: Partial<EyeData>) => { const cur = latestValue.current; if (cur) onChange({ ...cur, ...patch }); };

  if (!value) return <GuidedCamera onGallery={(f) => void pick(f)} onCapture={photo => void pick(photo.blob, photo)} />;


  return (
    <div className="space-y-5">
      {!value.circleConfirmed && <>
        <div className="grid grid-cols-2 gap-2" role="tablist">
          <Button type="button" role="tab" aria-selected={tab === "auto"} variant={tab === "auto" ? "default" : "outline"} className="h-12 whitespace-normal" onClick={() => void chooseAuto()}>
            <Wand2 className="h-4 w-4" /> {L("Automatic", "স্বয়ংক্রিয়")}
          </Button>
          <Button type="button" role="tab" aria-selected={tab === "manual"} variant={tab === "manual" ? "default" : "outline"} className="h-12 whitespace-normal" onClick={() => setTab("manual")}>
            <Hand className="h-4 w-4" /> {L("Manual", "নিজে ঠিক করুন")}
          </Button>
        </div>
        {tab === "auto" ? (
          <div className="space-y-2">
            {detecting ? (
              <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{L("Finding the pupil…", "মণি খোঁজা হচ্ছে…")}</p>
            ) : value.circleMethod === "auto" ? (
              <p className="flex items-center gap-2 rounded-lg border border-success bg-success-soft p-3 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" />{L("Pupil found automatically. Check the preview below.", "মণি স্বয়ংক্রিয়ভাবে পাওয়া গেছে। নিচের প্রিভিউ দেখে নিশ্চিত করুন।")}</p>
            ) : null}
            <CirclePreview src={value.url} circle={value.circle} />
            <p className="text-xs text-muted-foreground">{L("Not right? Use Manual to move or resize the circle.", "ঠিক না হলে 'নিজে ঠিক করুন' চেপে বৃত্ত সরান বা ছোট-বড় করুন।")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {autoMissing && <p className="rounded-lg border border-warning bg-warning-soft p-3 text-sm">{L("Pupil not found automatically – place the circle on the pupil.", "মণি স্বয়ংক্রিয়ভাবে পাওয়া যায়নি – মণির ওপর বৃত্ত বসান।")}</p>}
            <CircleEditor src={value.url} value={value.circle} onChange={(circle) => set({ circle, circleConfirmed: false, circleMethod: nextCircleMethod(latestValue.current?.circleMethod ?? null) })} />
          </div>
        )}
      </>}
      {value.circle && <div className="space-y-2"><p className="font-medium">{L('Pupil only','শুধু মণি')}</p><div className="mx-auto max-w-[260px]"><PupilFocus src={value.url} circle={value.circle}/></div></div>}
      <Button type="button" variant={value.circleConfirmed ? 'outline' : 'default'} className="min-h-12 w-full whitespace-normal" disabled={!value.circle || detecting} onClick={() => set({circleConfirmed: !value.circleConfirmed, circleMethod: value.circleMethod ?? 'manual'})}>
        {value.circleConfirmed ? L('Adjust circle','বৃত্ত ঠিক করুন') : L('Circle is correct','বৃত্ত ঠিক আছে')}
      </Button>
      {value.quality && <QualityPanel q={value.quality} />}
      <Button type="button" variant="outline" className="h-12 w-full" onClick={() => onChange(null)}>
        <RefreshCw className="h-4 w-4" /> {L("Retake photo", "আবার ছবি তুলুন")}
      </Button>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <p className="font-semibold">{L("Capture settings", "ছবি তোলার তথ্য")}</p>
        <div className="space-y-2">
          <Label>{L("Flash used?", "ফ্ল্যাশ ব্যবহার?")}</Label>
          <Choice
            value={value.flash ? "yes" : "no"}
            onChange={(v) => set({ flash: v === "yes" })}
            options={[
              { v: "no", label: L("No", "না") },
              { v: "yes", label: L("Yes", "হ্যাঁ") },
            ]}
          />
        </div>
        <div className="space-y-2">
          <Label>{L("Lighting", "আলো")}</Label>
          <Choice
            value={value.lighting}
            onChange={(lighting) => set({ lighting })}
            options={[
              { v: "indoor", label: L("Indoor", "ঘরের ভিতরে") },
              { v: "outdoor", label: L("Outdoor", "বাইরে") },
              { v: "torch", label: L("Torch", "টর্চ") },
            ]}
          />
        </div>
        <div className="space-y-2">
          <Label>{L("Phone model", "ফোনের মডেল")}</Label>
          <Input className="h-12" value={value.phoneModel} onChange={(e) => set({ phoneModel: e.target.value })} />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <p className="font-semibold">{L("Optional", "ঐচ্ছিক")}</p>
        <div className="space-y-2">
          <Label>{L("Visual acuity (e.g. 6/18)", "দৃষ্টিশক্তি (যেমন 6/18)")}</Label>
          <Input className="h-12" value={value.acuity} onChange={(e) => set({ acuity: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{L("Notes", "মন্তব্য")}</Label>
          <Textarea value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

/** Lazy-loads MediaPipe only when a still photo needs automatic detection. */
async function runDetection(url: string): Promise<Circle | null> {
  try {
    const [{ detectIrisInImage }, img] = await Promise.all([import("@/lib/iris"), loadImageCached(url)]);
    return await detectIrisInImage(img);
  } catch { return null; }
}

/** Read-only photo with the automatic circle drawn on it. */
function CirclePreview({ src, circle }: { src: string; circle: Circle | null }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  return (
    <div className="relative mx-auto overflow-hidden rounded-xl border bg-muted" style={dims ? { aspectRatio: `${dims.w} / ${dims.h}`, width: `min(100%, calc(45svh * ${dims.w / dims.h}))` } : undefined}>
      <img src={src} alt="" className="block h-full w-full" onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      {dims && circle && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none">
          <ellipse cx={circle.cx * dims.w} cy={circle.cy * dims.h} rx={circle.r * dims.w} ry={circle.r * dims.w} fill="none" stroke="var(--warning)" strokeWidth={Math.max(2, dims.w / 250)} />
        </svg>
      )}
    </div>
  );
}
