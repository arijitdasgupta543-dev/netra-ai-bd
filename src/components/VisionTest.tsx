import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, EyeOff, Ruler } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Choice } from "@/components/EyeCapture";
import { cn } from "@/lib/utils";
import {
  CONTRASTS, DEFAULT_PX_PER_MM, ID_CARD_WIDTH_MM, LINES, OPTOTYPES_PER_LINE, greyFor, lineFinished, logCS,
  optotypePx, randomDirs, scoreAcuity, type Dir, type LineResult,
} from "@/lib/vision";

export type EyeVision = { logmar: number | null; snellen: string | null; contrast_log_cs: number | null; pinhole_improves: boolean | null; distance_m: number; px_per_mm: number };
export type VisionResults = Partial<Record<"left" | "right", EyeVision>>;

const KEY = "netra-px-per-mm";
const readCal = () => { try { const v = Number(localStorage.getItem(KEY)); return v > 1 && v < 40 ? v : null; } catch { return null; } };

/** Tumbling E optotype: 5×5 units, opening to the right when rotation = 0. */
function TumblingE({ dir, sizePx, grey = 0 }: { dir: Dir; sizePx: number; grey?: number }) {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
  const fill = `rgb(${grey},${grey},${grey})`;
  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 5 5" style={{ transform: `rotate(${rot}deg)` }} aria-hidden>
      <rect x="0" y="0" width="1" height="5" fill={fill} />
      <rect x="0" y="0" width="5" height="1" fill={fill} />
      <rect x="0" y="2" width="5" height="1" fill={fill} />
      <rect x="0" y="4" width="5" height="1" fill={fill} />
    </svg>
  );
}

function Calibrate({ onDone, initial }: { onDone: (pxPerMm: number) => void; initial: number }) {
  const { L } = useLang();
  const [w, setW] = useState(Math.round(initial * ID_CARD_WIDTH_MM));
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold"><Ruler className="h-5 w-5" />{L("Calibrate this phone (once)", "এই ফোন ক্যালিব্রেট করুন (একবারই)")}</p>
      <p className="text-sm text-muted-foreground">{L("Hold an NID or bank card against the screen. Move the slider until the blue bar is exactly as wide as the card.", "স্ক্রিনের ওপর একটি জাতীয় পরিচয়পত্র বা ব্যাংক কার্ড ধরুন। স্লাইডার সরিয়ে নীল দাগটি কার্ডের প্রস্থের সমান করুন।")}</p>
      <div className="overflow-hidden"><div className="h-14 rounded bg-primary" style={{ width: w }} /></div>
      <Slider min={150} max={900} step={1} value={[w]} onValueChange={(v) => setW(v[0] ?? w)} />
      <Button className="h-12 w-full" onClick={() => { const v = w / ID_CARD_WIDTH_MM; try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ } onDone(v); }}>
        {L("Bar matches the card", "দাগ কার্ডের সমান হয়েছে")}
      </Button>
    </div>
  );
}

function AcuityRun({ distance, pxPerMm, onDone }: { distance: number; pxPerMm: number; onDone: (r: { logmar: number | null; snellen: string | null }) => void }) {
  const { L } = useLang();
  const [lineIdx, setLineIdx] = useState(0);
  const [dirs, setDirs] = useState<Dir[]>(() => randomDirs(OPTOTYPES_PER_LINE));
  const [shown, setShown] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [results, setResults] = useState<LineResult[]>([]);
  const line = LINES[lineIdx];
  const size = line ? optotypePx(line.logmar, distance, pxPerMm) : 0;

  const answer = (d: Dir | null) => {
    if (!line) return;
    const c = correct + (d === dirs[shown] ? 1 : 0), s = shown + 1;
    if (!lineFinished(c, s)) { setCorrect(c); setShown(s); return; }
    const res = [...results, { logmar: line.logmar, correct: c, shown: s }];
    const passed = c >= 3;
    if (!passed || lineIdx === LINES.length - 1) {
      const best = scoreAcuity(res);
      onDone({ logmar: best?.logmar ?? null, snellen: best?.snellen ?? null });
      return;
    }
    setResults(res); setLineIdx(lineIdx + 1); setDirs(randomDirs(OPTOTYPES_PER_LINE)); setShown(0); setCorrect(0);
  };

  if (!line) return null;
  const tooBig = size > 0.9 * (typeof window !== "undefined" ? window.innerWidth : 400);
  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-muted-foreground">{L("Line", "লাইন")} {line.snellen} · {shown + 1}/{OPTOTYPES_PER_LINE}</p>
      <div className="grid min-h-[45svh] place-items-center rounded-xl border bg-white">
        {tooBig ? <p className="p-4 text-center text-sm text-destructive">{L("Too large for this screen – use a shorter distance.", "এই স্ক্রিনে খুব বড় – দূরত্ব কমান।")}</p> : <TumblingE dir={dirs[shown] ?? "right"} sizePx={size} />}
      </div>
      <div className="mx-auto grid w-56 grid-cols-3 gap-2">
        <span /><Button className="h-14" aria-label={L("Up", "উপরে")} onClick={() => answer("up")}><ArrowUp /></Button><span />
        <Button className="h-14" aria-label={L("Left", "বামে")} onClick={() => answer("left")}><ArrowLeft /></Button>
        <Button variant="secondary" className="h-14 px-1 text-xs" onClick={() => answer(null)}><EyeOff className="h-4 w-4" />{L("Can't see", "দেখছেন না")}</Button>
        <Button className="h-14" aria-label={L("Right", "ডানে")} onClick={() => answer("right")}><ArrowRight /></Button>
        <span /><Button className="h-14" aria-label={L("Down", "নিচে")} onClick={() => answer("down")}><ArrowDown /></Button><span />
      </div>
      <p className="text-center text-xs text-muted-foreground">{L("Tap the direction the patient points to.", "রোগী যেদিকে আঙুল দেখান সেই তীর চাপুন।")}</p>
    </div>
  );
}

/** Experimental: largest E at decreasing contrast; the lowest contrast seen gives log contrast sensitivity. */
function ContrastRun({ distance, pxPerMm, onDone }: { distance: number; pxPerMm: number; onDone: (lcs: number | null) => void }) {
  const { L } = useLang();
  const [i, setI] = useState(0), [dir, setDir] = useState<Dir>("right"), [lowest, setLowest] = useState<number | null>(null), [miss, setMiss] = useState(0);
  const pct = CONTRASTS[i] ?? 100;
  const size = Math.min(optotypePx(0.8, distance, pxPerMm), 0.6 * (typeof window !== "undefined" ? window.innerWidth : 400));
  const answer = (d: Dir | null) => {
    const ok = d === dir;
    const nextMiss = ok ? 0 : miss + 1;
    const nextLowest = ok ? pct : lowest;
    if (nextMiss >= 2 || i === CONTRASTS.length - 1) { onDone(logCS(nextLowest)); return; }
    setLowest(nextLowest); setMiss(nextMiss); if (ok) setI(i + 1); setDir(randomDirs(2).find((x) => x !== dir) ?? "up");
  };
  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-muted-foreground">{L("Contrast", "কনট্রাস্ট")} {pct}% · {L("experimental", "পরীক্ষামূলক")}</p>
      <div className="grid min-h-[35svh] place-items-center rounded-xl border bg-white"><TumblingE dir={dir} sizePx={size} grey={greyFor(pct)} /></div>
      <div className="grid grid-cols-5 gap-2">
        {(["up", "left", "right", "down"] as Dir[]).map((d) => <Button key={d} className="h-12" onClick={() => answer(d)}>{{ up: <ArrowUp />, left: <ArrowLeft />, right: <ArrowRight />, down: <ArrowDown /> }[d]}</Button>)}
        <Button variant="secondary" className="h-12 px-1 text-xs" onClick={() => answer(null)}>{L("No", "না")}</Button>
      </div>
    </div>
  );
}

/** Vision test step of the screening: calibration, Tumbling-E acuity per eye, pinhole, optional contrast. */
export function VisionTest({ value, onChange }: { value: VisionResults; onChange: (v: VisionResults) => void }) {
  const { L } = useLang();
  const [pxPerMm, setPxPerMm] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [eye, setEye] = useState<"right" | "left">("right");
  const [distance, setDistance] = useState<"2" | "3" | "1">("2");
  const [mode, setMode] = useState<"idle" | "acuity" | "contrast">("idle");
  useEffect(() => { setPxPerMm(readCal()); }, []);
  const cur = value[eye];
  const d = Number(distance);
  const set = (patch: Partial<EyeVision>) => onChange({ ...value, [eye]: { logmar: null, snellen: null, contrast_log_cs: null, pinhole_improves: null, distance_m: d, px_per_mm: pxPerMm ?? DEFAULT_PX_PER_MM, ...cur, ...patch } });
  const low = useMemo(() => cur && (cur.logmar == null || cur.logmar > 0.3), [cur]);

  if (!pxPerMm || calibrating) return <Calibrate initial={pxPerMm ?? 6} onDone={(v) => { setPxPerMm(v); setCalibrating(false); }} />;
  if (mode === "acuity") return <AcuityRun distance={d} pxPerMm={pxPerMm} onDone={(r) => { set({ ...r, distance_m: d, px_per_mm: pxPerMm }); setMode("idle"); }} />;
  if (mode === "contrast") return <ContrastRun distance={d} pxPerMm={pxPerMm} onDone={(lcs) => { set({ contrast_log_cs: lcs }); setMode("idle"); }} />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary-soft p-3 text-sm">
        {L("Set screen brightness to maximum. Patient sits at the chosen distance and covers the other eye with a palm. Test with their glasses if they have them.", "স্ক্রিনের উজ্জ্বলতা সর্বোচ্চ করুন। রোগী নির্দিষ্ট দূরত্বে বসবেন এবং অন্য চোখ হাতের তালু দিয়ে ঢাকবেন। চশমা থাকলে চশমা পরে পরীক্ষা করুন।")}
      </div>
      <Choice value={eye} onChange={setEye} options={[{ v: "right", label: L("Right eye", "ডান চোখ") + (value.right ? " ✓" : "") }, { v: "left", label: L("Left eye", "বাম চোখ") + (value.left ? " ✓" : "") }]} />
      <div className="space-y-1">
        <p className="text-sm font-medium">{L("Distance (measure it)", "দূরত্ব (মেপে নিন)")}</p>
        <Choice value={distance} onChange={setDistance} options={[{ v: "2", label: "2 m" }, { v: "3", label: "3 m" }, { v: "1", label: "1 m" }]} />
      </div>
      <Button className="h-14 w-full text-base" onClick={() => setMode("acuity")}>{cur ? L("Repeat test", "আবার পরীক্ষা") : L("Start E test", "E পরীক্ষা শুরু")}</Button>
      {cur && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-lg font-semibold">{L("Result", "ফল")}: {cur.snellen ?? L("worse than 6/60", "6/60-এর চেয়ে খারাপ")}</p>
          {low && (
            <div className="space-y-1">
              <p className="text-sm">{L("Repeat through a pinhole (needle hole in card). Better?", "কার্ডে সুঁইয়ের ছিদ্র (পিনহোল) দিয়ে আবার দেখান। ভালো দেখছেন?")}</p>
              <Choice value={cur.pinhole_improves == null ? "" : cur.pinhole_improves ? "yes" : "no"} onChange={(v) => set({ pinhole_improves: v === "yes" })} options={[{ v: "yes", label: L("Yes, better", "হ্যাঁ, ভালো") }, { v: "no", label: L("No", "না") }]} />
            </div>
          )}
          <Button variant="outline" className="h-11 w-full" onClick={() => setMode("contrast")}>{L("Contrast check (experimental)", "কনট্রাস্ট পরীক্ষা (পরীক্ষামূলক)")}{cur.contrast_log_cs != null ? ` · logCS ${cur.contrast_log_cs}` : ""}</Button>
        </div>
      )}
      <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setCalibrating(true)}>{L("Re-calibrate screen", "স্ক্রিন আবার ক্যালিব্রেট করুন")}</button>
    </div>
  );
}
