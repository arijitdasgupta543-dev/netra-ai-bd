import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Plus, Minus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { Circle } from "@/lib/image";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * Manual pupil circle editor.
 * Tap = new centre, drag outward = radius. Drag inside to move, drag the edge to resize.
 * Zoom buttons enlarge the photo (the view follows the circle); +/- and arrows give fine control.
 */
export function CircleEditor({
  src,
  value,
  onChange,
}: {
  src: string;
  value: Circle | null;
  onChange: (c: Circle) => void;
}) {
  const { L } = useLang();
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const mode = useRef<null | { kind: "move"; ox: number; oy: number } | { kind: "resize" }>(null);

  // keep the circle in view when zooming
  useEffect(() => {
    const s = scroller.current, b = box.current;
    if (!s || !b || !value) return;
    const x = value.cx * b.clientWidth - s.clientWidth / 2;
    const y = value.cy * b.clientHeight - s.clientHeight / 2;
    s.scrollTo({ left: Math.max(0, x), top: Math.max(0, y) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const toNorm = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, rw: r.width, rh: r.height };
  };

  // distance in display pixels, converted to a fraction of width
  const distW = (p: ReturnType<typeof toNorm>, c: Circle) => {
    const dx = (p.x - c.cx) * p.rw;
    const dy = (p.y - c.cy) * p.rh;
    return Math.sqrt(dx * dx + dy * dy) / p.rw;
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toNorm(e);
    if (value) {
      const d = distW(p, value);
      const tol = 24 / p.rw;
      if (Math.abs(d - value.r) < tol) { mode.current = { kind: "resize" }; return; }
      if (d < value.r) { mode.current = { kind: "move", ox: p.x - value.cx, oy: p.y - value.cy }; return; }
    }
    onChange({ cx: p.x, cy: p.y, r: value?.r ?? 0.09 });
    mode.current = { kind: "resize" };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!mode.current || !value) return;
    const p = toNorm(e);
    if (mode.current.kind === "move") onChange({ ...value, cx: clamp(p.x - mode.current.ox), cy: clamp(p.y - mode.current.oy) });
    else {
      const r = distW(p, value);
      if (r > 0.01) onChange({ ...value, r: Math.min(0.3, r) });
    }
  };

  const onUp = () => (mode.current = null);
  const nudge = (dx: number, dy: number) => value && onChange({ ...value, cx: clamp(value.cx + dx), cy: clamp(value.cy + dy) });
  const resize = (f: number) => value && onChange({ ...value, r: Math.max(0.01, Math.min(0.3, value.r * f)) });
  const step = 0.005 / zoom;
  const zi = ZOOMS.indexOf(zoom);

  return (
    <div className="space-y-3">
      <div ref={scroller} className="relative max-h-[60svh] overflow-auto rounded-xl border bg-muted">
        <div ref={box} className="relative" style={{ width: `${zoom * 100}%` }}>
          <img
            src={src}
            alt=""
            className="block w-full select-none"
            draggable={false}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {dims && (
            <svg
              className="absolute inset-0 h-full w-full touch-none"
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              preserveAspectRatio="none"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {value && (
                <>
                  <ellipse cx={value.cx * dims.w} cy={value.cy * dims.h} rx={value.r * dims.w} ry={value.r * dims.w} fill="none" stroke="var(--warning)" strokeWidth={Math.max(2, dims.w / (250 * zoom))} />
                  <circle cx={value.cx * dims.w} cy={value.cy * dims.h} r={Math.max(3, dims.w / (200 * zoom))} fill="var(--warning)" />
                </>
              )}
            </svg>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" disabled={zi <= 0} aria-label={L("Zoom out", "ছোট করুন")} onClick={() => setZoom(ZOOMS[zi - 1] ?? 1)}><ZoomOut /></Button>
          <span className="w-10 text-center text-sm tabular-nums">{zoom}×</span>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" disabled={zi >= ZOOMS.length - 1} aria-label={L("Zoom in", "বড় করুন")} onClick={() => setZoom(ZOOMS[zi + 1] ?? 4)}><ZoomIn /></Button>
        </div>
        {value && (
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={L("Smaller circle", "বৃত্ত ছোট")} onClick={() => resize(0.95)}><Minus /></Button>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={L("Bigger circle", "বৃত্ত বড়")} onClick={() => resize(1.05)}><Plus /></Button>
          </div>
        )}
      </div>

      {value && (
        <div className="flex items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={L("Move up", "উপরে")} onClick={() => nudge(0, -step)}><ArrowUp /></Button>
            <span />
            <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={L("Move left", "বামে")} onClick={() => nudge(-step, 0)}><ArrowLeft /></Button>
            <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={L("Move down", "নিচে")} onClick={() => nudge(0, step)}><ArrowDown /></Button>
            <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label={L("Move right", "ডানে")} onClick={() => nudge(step, 0)}><ArrowRight /></Button>
          </div>
          <div className="flex flex-1 items-center gap-3">
            <span className="text-sm">{L("Size", "আকার")}</span>
            <Slider min={1} max={30} step={0.25} value={[value.r * 100]} onValueChange={([v]) => onChange({ ...value, r: (v ?? 1) / 100 })} />
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {L(
          "Tap the centre of the pupil, then drag outwards to the edge of the iris. Drag inside to move. Use zoom, +/– and arrows for fine adjustment.",
          "মণির কেন্দ্রে ট্যাপ করুন, তারপর আইরিসের কিনারা পর্যন্ত টানুন। সরাতে ভেতরে টানুন। সূক্ষ্মভাবে ঠিক করতে জুম, +/– আর তীর বাটন ব্যবহার করুন।",
        )}
      </p>
    </div>
  );
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
