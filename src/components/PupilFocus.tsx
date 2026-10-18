import { useEffect, useRef } from 'react';
import { loadImage, maskedPupil, type Circle } from '@/lib/image';
import { useLang } from '@/lib/i18n';

/** Tight pupil-only preview: no pixels outside the selected circle are visible. */
export function PupilFocus({ src, circle }: { src: string; circle: Circle }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { L } = useLang();
  useEffect(() => {
    let cancelled=false;
    void loadImage(src).then(img=> {
      const c=canvas.current; if(cancelled || !c) return;
      const roi=maskedPupil(img,circle); c.width=roi.width; c.height=roi.height;
      const ctx=c.getContext('2d'); if(!ctx) return; ctx.drawImage(roi,0,0);
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[src,circle.cx,circle.cy,circle.r]);
  return <canvas ref={canvas} aria-label={L('Pupil only','শুধু মণি')} className="block aspect-square h-auto w-full rounded-lg border bg-camera"/>;
}