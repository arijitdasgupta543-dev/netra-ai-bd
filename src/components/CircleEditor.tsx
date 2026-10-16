import { useRef, useState } from "react";
import type { Circle } from "@/lib/image";
import { Slider } from "@/components/ui/slider";
import { useLang } from "@/lib/i18n";

/**
 * Tap to place the pupil centre, drag outward to set the radius.
 * Drag inside the circle to move it; drag its edge to resize.
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
  const box = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const mode = useRef<null | { kind: "move"; ox: number; oy: number } | { kind: "resize" }>(null);

  const toNorm = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, rw: r.width, rh: r.height };
  };

  // distance in display pixels, then convert to fraction of width
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
      if (Math.abs(d - value.r) < tol) {
        mode.current = { kind: "resize" };
        return;
      }
      if (d < value.r) {
        mode.current = { kind: "move", ox: p.x - value.cx, oy: p.y - value.cy };
        return;
      }
    }
    onChange({ cx: p.x, cy: p.y, r: value?.r ?? 0.08 });
    mode.current = { kind: "resize" };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!mode.current || !value) return;
    const p = toNorm(e);
    if (mode.current.kind === "move") {
      onChange({ ...value, cx: clamp(p.x - mode.current.ox), cy: clamp(p.y - mode.current.oy) });
    } else {
      const r = distW(p, value);
      if (r > 0.01) onChange({ ...value, r: Math.min(0.6, r) });
    }
  };

  const onUp = () => (mode.current = null);

  return (
    <div className="space-y-3">
      <div ref={box} className="relative overflow-hidden rounded-xl border bg-muted">
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
                <ellipse
                  cx={value.cx * dims.w}
                  cy={value.cy * dims.h}
                  rx={value.r * dims.w}
                  ry={value.r * dims.w}
                  fill="none"
                  stroke="var(--warning)"
                  strokeWidth={Math.max(2, dims.w / 250)}
                />
                <circle cx={value.cx * dims.w} cy={value.cy * dims.h} r={Math.max(3, dims.w / 200)} fill="var(--warning)" />
              </>
            )}
          </svg>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {L(
          "Tap the centre of the pupil, then drag outwards to cover the pupil/iris. Drag inside to move, or use the slider.",
          "মণির কেন্দ্রে ট্যাপ করুন, তারপর বাইরের দিকে টেনে মণি/আইরিস ঢেকে দিন। সরাতে ভিতরে টানুন, অথবা স্লাইডার ব্যবহার করুন।",
        )}
      </p>
      {value && (
        <div className="flex items-center gap-3">
          <span className="text-sm">{L("Size", "আকার")}</span>
          <Slider
            min={1}
            max={60}
            step={0.5}
            value={[value.r * 100]}
            onValueChange={([v]) => onChange({ ...value, r: v / 100 })}
          />
        </div>
      )}
    </div>
  );
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
