import { useEffect, useRef } from 'react';
import { loadImage, type Circle } from '@/lib/image';
import { useLang } from '@/lib/i18n';

/** Spotlight preserves the full frame and leaves only the selected pupil sharp. */
export function PupilFocus({ src, circle }: { src: string; circle: Circle }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { L } = useLang();
  useEffect(() => {
    let cancelled=false;
    void loadImage(src).then(img=> {
      const c=canvas.current; if(cancelled || !c) return;
      const scale=Math.min(1,1200/img.naturalWidth); c.width=Math.round(img.naturalWidth*scale); c.height=Math.round(img.naturalHeight*scale);
      const ctx=c.getContext('2d'); if(!ctx) return;
      ctx.filter='blur(8px)'; ctx.drawImage(img,0,0,c.width,c.height); ctx.filter='none';
      ctx.fillStyle=getComputedStyle(c).getPropertyValue('--pupil-shade');ctx.fillRect(0,0,c.width,c.height);
      ctx.save();ctx.beginPath();ctx.arc(circle.cx*c.width,circle.cy*c.height,circle.r*c.width,0,Math.PI*2);ctx.clip();ctx.drawImage(img,0,0,c.width,c.height);ctx.restore();
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[src,circle.cx,circle.cy,circle.r]);
  return <canvas ref={canvas} aria-label={L('Pupil focus','মণির ফোকাস')} className="block h-auto w-full rounded-lg border"/>;
}