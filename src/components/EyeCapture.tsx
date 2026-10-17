import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { analyseQuality, compressImage, loadImage, type Circle, type Quality } from "@/lib/image";
import { CircleEditor } from "./CircleEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GuidedCamera, type GuidedPhoto } from './GuidedCamera';
import { PupilFocus } from './PupilFocus';
import type { GuideBox, CaptureChecks } from '@/lib/capture';

export type EyeData = {
  blob: Blob;
  url: string;
  circle: Circle | null;
  flash: boolean;
  lighting: "indoor" | "outdoor" | "torch";
  phoneModel: string;
  quality: Quality | null;
  acuity: string;
  notes: string;
  guide: GuideBox | null;
  captureChecks: CaptureChecks | null;
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

  useEffect(() => {
    if (!value?.url) return setImg(null);
    loadImage(value.url).then(setImg);
  }, [value?.url]);

  // Re-run quality check whenever the circle moves
  useEffect(() => {
    if (!img || !value) return;
    const t = setTimeout(() => onChange({ ...value, quality: analyseQuality(img, value.circle) }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, value?.circle?.cx, value?.circle?.cy, value?.circle?.r]);

  const pick = async (f: Blob, guided?: GuidedPhoto) => {
    const blob = guided ? f : await compressImage(f);
    if (value?.url) URL.revokeObjectURL(value.url);
    onChange({
      blob,
      url: URL.createObjectURL(blob),
      circle: guided?.circle ?? { cx: 0.5, cy: 0.5, r: 0.065 },
      guide: guided?.guide ?? null,
      captureChecks: guided?.checks ?? null,
      flash: value?.flash ?? false,
      lighting: guided?.torch ? 'torch' : value?.lighting ?? "indoor",
      phoneModel: value?.phoneModel ?? defaultPhone,
      quality: null,
      acuity: value?.acuity ?? "",
      notes: value?.notes ?? "",
    });
  };

  if (!value) return <GuidedCamera onGallery={pick} onCapture={photo => void pick(photo.blob, photo)} />;

  const set = (patch: Partial<EyeData>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <CircleEditor src={value.url} value={value.circle} onChange={(circle) => set({ circle })} />
      {value.circle && <div className="space-y-2"><p className="font-medium">{L('Pupil focus','মণির ফোকাস')}</p><PupilFocus src={value.url} circle={value.circle}/></div>}
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
