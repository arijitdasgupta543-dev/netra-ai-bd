import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Zap, X, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLang } from '@/lib/i18n';
import { canvasToBlob, type Circle } from '@/lib/image';
import { checkPixels, initialPupilCircle, guideBox, viewRect, GUIDE_RADIUS, hintFor, readySince, shouldAutoCapture, type CaptureChecks, type GuideBox } from '@/lib/capture';
import { cn } from '@/lib/utils';

export type GuidedPhoto = { blob: Blob; circle: Circle; autoCircle: Circle | null; guide: GuideBox; checks: CaptureChecks | null; torch: boolean };
type ExtraCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; pointsOfInterest?: unknown };
type Detector = Awaited<ReturnType<typeof import('@/lib/iris').createIrisDetector>>;

const TICK_MS = 300;          // live checks ~3 per second
const CELL_W = 120, CELL_H = 160; // tiny canvas for the centre cell (quality checks)
const DET_W = 240, DET_H = 320;   // small canvas for iris detection
const SVG_W = 300, SVG_H = 400;   // guide overlay coordinate system (3:4)

/** Compact 3:4 guided camera: tic-tac-toe guide, tap anywhere to take the photo. */
export function GuidedCamera({ onCapture, onGallery }: { onCapture: (photo: GuidedPhoto) => void; onGallery: (file: File) => void }) {
  const { L } = useLang();
  const video = useRef<HTMLVideoElement>(null), gallery = useRef<HTMLInputElement>(null), fallback = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null), alive = useRef(true), busy = useRef(false), readyAt = useRef<number | null>(null);
  const latest = useRef<{ circle: Circle | null; checks: CaptureChecks | null }>({ circle: null, checks: null });
  const autoRef = useRef(false), captureRef = useRef<() => Promise<void>>(async () => {});
  const [active, setActive] = useState(false), [failed, setFailed] = useState(false), [opening, setOpening] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false), [torch, setTorch] = useState(false), [auto, setAuto] = useState(false);
  const [checks, setChecks] = useState<CaptureChecks | null>(null), [flash, setFlash] = useState(false);

  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; readyAt.current = null; latest.current = { circle: null, checks: null }; setActive(false); setTorch(false); };
  useEffect(() => {
    alive.current = true;
    const onHide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { alive.current = false; document.removeEventListener('visibilitychange', onHide); stream.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const constraint = async (values: Record<string, unknown>) => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [values as MediaTrackConstraintSet] }); } catch { /* optional device feature */ }
  };

  const open = async () => {
    if (opening) return;
    setOpening(true); setFailed(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!alive.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as ExtraCapabilities;
      setTorchSupported(!!caps.torch); setChecks(null); setActive(true);
      if (caps.focusMode?.includes('continuous')) void constraint({ focusMode: 'continuous' });
      if (caps.pointsOfInterest) void constraint({ pointsOfInterest: [{ x: .5, y: .5 }] });
    } catch { setFailed(true); } finally { if (alive.current) setOpening(false); }
  };

  useEffect(() => {
    if (!active || !video.current || !stream.current) return;
    const v = video.current; v.srcObject = stream.current; void v.play().catch(() => setFailed(true));
    let cancelled = false, detector: Detector | null = null, findIris: typeof import('@/lib/iris').nearestIris | null = null;
    let nextTs: typeof import('@/lib/iris').nextTimestamp | null = null, tickNo = 0, lastIris: Circle | null = null;
    // MediaPipe is loaded lazily, after the camera is already visible.
    void import('@/lib/iris').then(async mod => { const d = await mod.createIrisDetector(); if (!cancelled) { detector = d; findIris = mod.nearestIris; nextTs = mod.nextTimestamp; } }).catch(() => {});
    const cell = document.createElement('canvas'); cell.width = CELL_W; cell.height = CELL_H;
    const cctx = cell.getContext('2d', { willReadFrequently: true });
    const det = document.createElement('canvas'); det.width = DET_W; det.height = DET_H;
    const dctx = det.getContext('2d');
    const tick = () => {
      if (!cctx || v.readyState < 2 || !v.videoWidth || cancelled) return;
      const r = viewRect(v.videoWidth, v.videoHeight), b = guideBox(), now = performance.now();
      // iris detection every second tick on a small frame (saves CPU on cheap phones)
      if (detector && findIris && nextTs && dctx && tickNo++ % 2 === 0) {
        try { dctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, DET_W, DET_H); lastIris = findIris(detector.detectForVideo(det, nextTs(now)).faceLandmarks[0] ?? [], DET_H / DET_W); } catch { detector = null; lastIris = null; }
      }
      const iris = lastIris;
      cctx.drawImage(v, r.sx + b.x * r.sw, r.sy + b.y * r.sh, b.width * r.sw, b.height * r.sh, 0, 0, CELL_W, CELL_H);
      const values = { ...checkPixels(cctx.getImageData(0, 0, CELL_W, CELL_H).data, CELL_W, CELL_H, { cx: .5, cy: .5, r: GUIDE_RADIUS / b.width }), iris_found: !!iris, iris_ratio: iris ? iris.r / GUIDE_RADIUS : null, offset_x: iris ? iris.cx - .5 : null, offset_y: iris ? (iris.cy - .5) * (DET_H / DET_W) : null };
      const hint = hintFor(values), result = { ...values, hint, ready: hint === 'ready' };
      latest.current = { circle: iris, checks: result };
      setChecks(prev => prev && prev.hint === result.hint && prev.iris_found === result.iris_found && Math.abs((prev.offset_x ?? 0) - (result.offset_x ?? 0)) < .02 ? prev : result);
      readyAt.current = readySince(readyAt.current, result.ready, now);
      if (autoRef.current && shouldAutoCapture(readyAt.current, now)) void captureRef.current();
    };
    const timer = setInterval(tick, TICK_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [active]);

  const capture = async () => {
    const v = video.current;
    if (!v || v.readyState < 2 || busy.current) return;
    busy.current = true;
    try {
      setFlash(true); setTimeout(() => setFlash(false), 180);
      try { navigator.vibrate?.(50); } catch { /* not supported */ }
      // Save exactly what the user saw: the 3:4 visible region of the frame.
      const r = viewRect(v.videoWidth, v.videoHeight);
      const c = document.createElement('canvas'); c.width = r.sw; c.height = r.sh;
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
      const box = guideBox(), iris = latest.current.circle;
      const blob = await canvasToBlob(c, 'image/jpeg', .9);
      const circle = initialPupilCircle(iris, box, r.sh / r.sw);
      onCapture({ blob, circle, autoCircle: iris && circle === iris ? iris : null, guide: box, checks: latest.current.checks, torch });
      stop();
    } finally { busy.current = false; }
  };
  captureRef.current = capture;

  /** Tap anywhere on the preview: focus there (if supported), then take the photo. */
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const tapCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = down.current; down.current = null;
    if ((e.target as HTMLElement).closest('button') || !start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12 || performance.now() - start.t > 800) return; // a scroll or long press, not a tap
    const rect = e.currentTarget.getBoundingClientRect();
    const caps = stream.current?.getVideoTracks()[0]?.getCapabilities?.() as ExtraCapabilities | undefined;
    if (caps?.pointsOfInterest) void constraint({ pointsOfInterest: [{ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }], focusMode: 'single-shot' });
    setTimeout(() => void capture(), caps?.pointsOfInterest ? 300 : 0);
  };

  const messages = {
    dark: L('Too dark – add light', 'আলো কম – আলো বাড়ান'), bright: L('Too bright – reduce light', 'আলো বেশি – আলো কমান'),
    blur: L('Blurry – hold still', 'ঝাপসা – ফোন স্থির রাখুন'), glare: L('Glare on pupil – avoid flash/direct light', 'মণিতে ঝলক – ফ্ল্যাশ বা সরাসরি আলো সরান'),
    haze: L('Clean the camera lens', 'লেন্স পরিষ্কার করুন'), closer: L('Move closer', 'ক্যামেরা কাছে আনুন'), back: L('Move back', 'ক্যামেরা দূরে নিন'), centre: L('Put the pupil in the centre box', 'মণি মাঝের ঘরে আনুন'), ready: L('Ready – tap to take photo', 'প্রস্তুত – ছবি তুলতে ট্যাপ করুন'),
  };
  const Arrow = Math.abs(checks?.offset_x ?? 0) > Math.abs(checks?.offset_y ?? 0) ? ((checks?.offset_x ?? 0) > 0 ? ArrowLeft : ArrowRight) : ((checks?.offset_y ?? 0) > 0 ? ArrowUp : ArrowDown);
  const cellX = SVG_W / 3, cellY = SVG_H / 3;

  return <div className="space-y-2">
    {active ? <>
      <p className="text-center text-sm font-semibold">{L('Put the pupil here – in the centre box', 'চোখের মণি এখানে রাখুন – মাঝের ঘরে')}</p>
      <div className="relative mx-auto touch-manipulation select-none overflow-hidden rounded-xl bg-camera" style={{ aspectRatio: '3 / 4', width: 'min(100%, calc(55svh * 0.75))' }} onPointerDown={e => { down.current = { x: e.clientX, y: e.clientY, t: performance.now() }; }} onPointerUp={tapCapture} onPointerCancel={() => { down.current = null; }} role="button" aria-label={L('Tap to take photo', 'ছবি তুলতে ট্যাপ করুন')}>
        <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="pointer-events-none absolute inset-0 h-full w-full">
          {[1, 2].map(n => <g key={n} strokeLinecap="round">
            <line x1={cellX * n} x2={cellX * n} y1={0} y2={SVG_H} stroke="rgba(0,0,0,.45)" strokeWidth={4} />
            <line x1={0} x2={SVG_W} y1={cellY * n} y2={cellY * n} stroke="rgba(0,0,0,.45)" strokeWidth={4} />
            <line x1={cellX * n} x2={cellX * n} y1={0} y2={SVG_H} stroke="#fff" strokeWidth={2} />
            <line x1={0} x2={SVG_W} y1={cellY * n} y2={cellY * n} stroke="#fff" strokeWidth={2} />
          </g>)}
          <rect x={cellX} y={cellY} width={cellX} height={cellY} fill="none" stroke="var(--primary)" strokeWidth={3} />
          <circle cx={SVG_W / 2} cy={SVG_H / 2} r={GUIDE_RADIUS * SVG_W} fill="none" stroke={checks?.ready ? 'var(--success)' : 'var(--warning)'} strokeWidth={2.5} />
          <circle cx={SVG_W / 2} cy={SVG_H / 2} r={2} fill="#fff" />
        </svg>
        {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}
        <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2 h-10 w-10" aria-label={L('Close camera', 'ক্যামেরা বন্ধ করুন')} onClick={stop}><X /></Button>
        {torchSupported && <Button type="button" variant={torch ? 'default' : 'secondary'} size="icon" className="absolute left-2 top-2 h-10 w-10" aria-label={L('Torch', 'টর্চ')} aria-pressed={torch} onClick={async () => { const next = !torch; await constraint({ torch: next }); setTorch(next); }}><Zap /></Button>}
      </div>
      <div aria-live="polite" className={cn('flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center text-sm font-semibold', checks?.ready ? 'border-success bg-success-soft text-success' : checks?.hint === 'dark' || checks?.hint === 'bright' || checks?.hint === 'glare' ? 'border-destructive bg-danger-soft text-destructive' : 'border-warning bg-warning-soft')}>
        {checks?.hint === 'centre' && <Arrow className="h-5 w-5 shrink-0" />}{checks ? messages[checks.hint] : L('Checking…', 'যাচাই হচ্ছে…')}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <Button type="button" className={cn('h-12 whitespace-normal text-base', checks?.ready && 'capture-ready')} onClick={() => void capture()}><Camera />{L('Take photo', 'ছবি তুলুন')}</Button>
        <label className="flex items-center gap-2 text-xs"><Switch checked={auto} onCheckedChange={v => { setAuto(v); autoRef.current = v; readyAt.current = null; }} />{L('Auto', 'স্বয়ংক্রিয়')}</label>
      </div>
    </> : <>
      <Button type="button" className="h-14 w-full text-base" onClick={failed ? () => fallback.current?.click() : open}><Camera />{opening ? L('Opening camera…', 'ক্যামেরা খুলছে…') : failed ? L('Use phone camera', 'ফোনের ক্যামেরা ব্যবহার করুন') : L('Open guided camera', 'নির্দেশিত ক্যামেরা খুলুন')}</Button>
      {failed && <p role="status" className="text-sm text-muted-foreground">{L('Live camera unavailable. Use the phone camera or gallery.', 'লাইভ ক্যামেরা চালু হয়নি। ফোনের ক্যামেরা বা গ্যালারি ব্যবহার করুন।')}</p>}
      <Button type="button" variant="outline" className="h-12 w-full" onClick={() => gallery.current?.click()}><ImagePlus />{L('Choose from gallery', 'গ্যালারি থেকে বেছে নিন')}</Button>
    </>}
    <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { stop(); onGallery(f); } e.target.value = ''; }} />
    <input ref={fallback} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { stop(); onGallery(f); } e.target.value = ''; }} />
  </div>;
}
