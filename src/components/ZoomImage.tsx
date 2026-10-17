import { useState } from "react";
import { ZoomIn, ZoomOut, Circle as CircleIcon } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function ZoomImage({ src, circle }: { src: string | undefined; circle: { cx: number; cy: number; r: number } | null }) {
  const { L } = useLang();
  const [zoom, setZoom] = useState(1);
  const [show, setShow] = useState(true);
  const [ar, setAr] = useState(1);
  return (
    <div className="space-y-2">
      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-foreground/90">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          {src ? (
            <img src={src} alt="" className="block w-full" onLoad={(e) => setAr(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
          ) : (
            <div className="aspect-[4/3] animate-pulse bg-muted" />
          )}
          {src && show && circle && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 1000 ${1000 * ar}`} preserveAspectRatio="none">
              <ellipse cx={circle.cx * 1000} cy={circle.cy * 1000 * ar} rx={circle.r * 1000} ry={circle.r * 1000} fill="none" stroke="var(--warning)" strokeWidth={3} />
            </svg>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label={L('Zoom out','ছোট করুন')}><ZoomOut /></Button>
        <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label={L('Zoom in','বড় করুন')}><ZoomIn /></Button>
        {circle && (
          <Button type="button" variant={show ? "default" : "outline"} className="h-11" onClick={() => setShow(!show)}>
            <CircleIcon className="h-4 w-4" /> {L("Pupil circle", "মণির বৃত্ত")}
          </Button>
        )}
      </div>
    </div>
  );
}
