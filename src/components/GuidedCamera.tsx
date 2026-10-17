import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Zap, X, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLang } from '@/lib/i18n';
import { canvasToBlob, type Circle } from '@/lib/image';
import { checkPixels, guideBox, GUIDE_RADIUS, hintFor, readySince, shouldAutoCapture, type CaptureChecks, type GuideBox } from '@/lib/capture';
import { cn } from '@/lib/utils';

export type GuidedPhoto = { blob: Blob; circle: Circle; guide: GuideBox; checks: CaptureChecks | null; torch: boolean };
type ExtraCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; pointsOfInterest?: unknown };
export function GuidedCamera({ onCapture, onGallery }: { onCapture: (photo: GuidedPhoto) => void; onGallery: (file: File) => void }) {
  const { L } = useLang();
  const video = useRef<HTMLVideoElement>(null), gallery = useRef<HTMLInputElement>(null), fallback = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null), alive = useRef(true), busy = useRef(false), readyAt = useRef<number | null>(null);
  const latest = useRef<{ circle: Circle | null; checks: CaptureChecks | null }>({circle:null,checks:null});
  const autoRef = useRef(false), captureRef = useRef<() => Promise<void>>(async () => {});
  const [active,setActive] = useState(false), [failed,setFailed] = useState(false), [opening,setOpening] = useState(false);
  const [torchSupported,setTorchSupported] = useState(false), [torch,setTorch] = useState(false), [auto,setAuto] = useState(false);
  const [checks,setChecks] = useState<CaptureChecks | null>(null), [dimensions,setDimensions] = useState({w:1920,h:1080});
  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current=null; readyAt.current=null; latest.current={circle:null,checks:null}; setActive(false); setTorch(false); };
  useEffect(() => { alive.current=true; return () => { alive.current=false; stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  const constraint = async (values: Record<string, unknown>) => {
    const track=stream.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({advanced:[values as MediaTrackConstraintSet]}); } catch { /* device support is optional */ }
  };
  const open = async () => {
    if (opening) return;
    setOpening(true); setFailed(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
      if (!alive.current) { s.getTracks().forEach(t=>t.stop()); return; }
      stream.current=s;
      const track=s.getVideoTracks()[0];
      const caps=(track?.getCapabilities?.() ?? {}) as ExtraCapabilities;
      setTorchSupported(!!caps.torch); setChecks(null); setActive(true);
      if (caps.focusMode?.includes('continuous')) void constraint({focusMode:'continuous'});
    } catch { setFailed(true); } finally { if (alive.current) setOpening(false); }
  };
  useEffect(() => {
    if (!active || !video.current || !stream.current) return;
    const v=video.current; v.srcObject=stream.current; void v.play().catch(()=>setFailed(true));
    let cancelled=false;
    let detector: Awaited<ReturnType<typeof import('@/lib/iris').createIrisDetector>> | null=null;
    let findIris: typeof import('@/lib/iris').nearestIris | null=null;
    void import('@/lib/iris').then(async mod => { const d=await mod.createIrisDetector(); if(cancelled) d.close(); else {detector=d;findIris=mod.nearestIris;} }).catch(()=>{});
    const c=document.createElement('canvas'); c.width=256; c.height=128;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const tick=() => {
      if (!ctx || v.readyState<2 || !v.videoWidth || cancelled) return;
      const w=v.videoWidth,h=v.videoHeight,b=guideBox(w,h),now=performance.now();
      let iris: Circle | null=null;
      try { if(detector && findIris) iris=findIris(detector.detectForVideo(v,now).faceLandmarks[0] ?? [],h/w); } catch { detector?.close(); detector=null; }
      ctx.drawImage(v,b.x*w,b.y*h,b.width*w,b.height*h,0,0,256,128);
      const values={...checkPixels(ctx.getImageData(0,0,256,128).data,256,128,{cx:.5,cy:.5,r:GUIDE_RADIUS/b.width}),iris_found:!!iris,iris_ratio:iris ? iris.r/GUIDE_RADIUS : null,offset_x:iris ? iris.cx-.5 : null,offset_y:iris ? (iris.cy-.5)*h/w : null};
      const hint=hintFor(values), result={...values,hint,ready:hint==='ready'};
      latest.current={circle:iris,checks:result}; setChecks(result);
      readyAt.current=readySince(readyAt.current,result.ready,now);
      if(autoRef.current && shouldAutoCapture(readyAt.current,now)) void captureRef.current();
    };
    const timer=setInterval(tick,333);
    return () => { cancelled=true; clearInterval(timer); detector?.close(); };
  }, [active]);
  const capture=async () => {
    const v=video.current;
    if (!v || v.readyState<2 || busy.current) return;
    busy.current=true;
    try {
      const c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight;
      const ctx=c.getContext('2d'); if (!ctx) return; ctx.drawImage(v,0,0);
      const box=guideBox(c.width,c.height), small=document.createElement('canvas');small.width=256;small.height=128;
      const sc=small.getContext('2d',{willReadFrequently:true});
      let capturedChecks=latest.current.checks;
      if(sc){
        sc.drawImage(c,box.x*c.width,box.y*c.height,box.width*c.width,box.height*c.height,0,0,256,128);
        const iris=latest.current.circle;
        const values={...checkPixels(sc.getImageData(0,0,256,128).data,256,128,{cx:.5,cy:.5,r:GUIDE_RADIUS/box.width}),iris_found:!!iris,iris_ratio:iris?iris.r/GUIDE_RADIUS:null,offset_x:iris?iris.cx-.5:null,offset_y:iris?(iris.cy-.5)*c.height/c.width:null};
        const hint=hintFor(values);capturedChecks={...values,hint,ready:hint==='ready'};
      }
      const photo={blob:await canvasToBlob(c,'image/jpeg',.92),circle:latest.current.circle ?? {cx:.5,cy:.5,r:GUIDE_RADIUS},guide:box,checks:capturedChecks,torch};
      stop(); onCapture(photo);
    } finally { busy.current=false; }
  };
  captureRef.current=capture;
  const messages = {
    dark:L('Too dark – add light','আলো কম – আলো বাড়ান'), bright:L('Too bright – reduce light','আলো বেশি – আলো কমান'),
    blur:L('Blurry – hold still or tap to focus','ঝাপসা – ফোন স্থির রাখুন বা ফোকাস করতে ট্যাপ করুন'), glare:L('Glare on pupil – avoid flash/direct light','মণিতে ঝলক – ফ্ল্যাশ বা সরাসরি আলো সরান'),
    haze:L('Clean the camera lens','লেন্স পরিষ্কার করুন'), closer:L('Move closer','ক্যামেরা কাছে আনুন'), back:L('Move back','ক্যামেরা দূরে নিন'), centre:L('Centre the eye','চোখ বৃত্তের মাঝে আনুন'),ready:L('Ready','প্রস্তুত'),
  };
  const Arrow=Math.abs(checks?.offset_x ?? 0)>Math.abs(checks?.offset_y ?? 0) ? ((checks?.offset_x ?? 0)>0 ? ArrowLeft : ArrowRight) : ((checks?.offset_y ?? 0)>0 ? ArrowUp : ArrowDown);
  const b=guideBox(dimensions.w,dimensions.h);
  return <div className="space-y-3">
    {active ? <>
      <p className="text-center font-medium">{L('Keep the eye inside the box and the pupil in the circle','চোখটি বক্সের ভেতরে, মণি বৃত্তের মাঝে রাখুন')}</p>
      <div className="relative overflow-hidden rounded-lg bg-camera" style={{aspectRatio:`${dimensions.w}/${dimensions.h}`}}>
        <video ref={video} muted playsInline className="block h-full w-full" onLoadedMetadata={e=>setDimensions({w:e.currentTarget.videoWidth,h:e.currentTarget.videoHeight})} onClick={e=>{ const r=e.currentTarget.getBoundingClientRect(); const caps=stream.current?.getVideoTracks()[0]?.getCapabilities() as ExtraCapabilities | undefined; if(caps?.pointsOfInterest) void constraint({pointsOfInterest:[{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}],focusMode:'single-shot'}); }} />
        <svg viewBox={`0 0 ${dimensions.w} ${dimensions.h}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {[1,2].map(n=><g key={n} stroke="var(--camera-guide)" opacity=".45"><line x1={dimensions.w*n/3} x2={dimensions.w*n/3} y2={dimensions.h}/><line y1={dimensions.h*n/3} y2={dimensions.h*n/3} x2={dimensions.w}/></g>)}
          <rect x={b.x*dimensions.w} y={b.y*dimensions.h} width={b.width*dimensions.w} height={b.height*dimensions.h} fill="none" stroke="var(--camera-guide)" strokeWidth={dimensions.w/300}/>
          <circle cx={dimensions.w/2} cy={dimensions.h/2} r={GUIDE_RADIUS*dimensions.w} fill="none" stroke="var(--warning)" strokeWidth={dimensions.w/300}/>
        </svg>
        <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2 h-11 w-11" aria-label={L('Close camera','ক্যামেরা বন্ধ করুন')} onClick={stop}><X/></Button>
      </div>
      <div aria-live="polite" className={cn('flex min-h-16 items-center justify-center gap-2 rounded-lg border p-3 text-center text-base font-semibold',checks?.ready ? 'border-success bg-success-soft text-success' : checks?.hint==='dark'||checks?.hint==='bright'||checks?.hint==='glare' ? 'border-destructive bg-danger-soft text-destructive' : 'border-warning bg-warning-soft')}>
        {checks?.hint==='centre' && <Arrow className="h-6 w-6 shrink-0"/>}{checks ? messages[checks.hint] : L('Checking…','যাচাই হচ্ছে…')}
      </div>
      {!checks?.iris_found && <p className="text-center text-sm text-muted-foreground">{L('Keep the eye inside the box','চোখটি বক্সের ভেতরে রাখুন')}</p>}
      <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><Switch checked={auto} onCheckedChange={v=>{setAuto(v);autoRef.current=v;readyAt.current=null;}}/>{L('Auto-capture when ready','প্রস্তুত হলে স্বয়ংক্রিয় ছবি')}</label>
      {torchSupported && <Button type="button" variant={torch?'default':'outline'} size="icon" className="h-11 w-11" aria-label={L('Torch','টর্চ')} aria-pressed={torch} onClick={async()=>{const next=!torch; await constraint({torch:next});setTorch(next);}}><Zap/></Button>}</div>
      <Button type="button" className={cn('h-14 w-full whitespace-normal text-base',checks?.ready && 'capture-ready')} onClick={capture}><Camera/>{L('Capture photo','ছবি তুলুন')}</Button>
    </> : <>
      <Button type="button" className="h-14 w-full text-base" onClick={failed ? ()=>fallback.current?.click() : open}><Camera/>{opening ? L('Opening camera…','ক্যামেরা খুলছে…') : failed ? L('Use phone camera','ফোনের ক্যামেরা ব্যবহার করুন') : L('Open guided camera','নির্দেশিত ক্যামেরা খুলুন')}</Button>
      {failed && <p role="status" className="text-sm text-muted-foreground">{L('Live camera unavailable. Use the phone camera or gallery.','লাইভ ক্যামেরা চালু হয়নি। ফোনের ক্যামেরা বা গ্যালারি ব্যবহার করুন।')}</p>}
    </>}
    <Button type="button" variant="outline" className="h-12 w-full" onClick={()=>gallery.current?.click()}><ImagePlus/>{L('Choose from gallery','গ্যালারি থেকে বেছে নিন')}</Button>
    <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){stop();onGallery(f);}e.target.value='';}}/>
    <input ref={fallback} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){stop();onGallery(f);}e.target.value='';}}/>
  </div>;
}
