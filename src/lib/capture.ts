import type { Circle } from './image';

export type GuideBox = { x: number; y: number; width: number; height: number };
export type CaptureChecks = { brightness: number; blur: number; glare: number; contrast: number; iris_found: boolean; iris_ratio: number | null; offset_x: number | null; offset_y: number | null; ready: boolean; hint: Hint };
export type Hint = 'dark' | 'bright' | 'blur' | 'glare' | 'haze' | 'closer' | 'back' | 'centre' | 'ready';
export const GUIDE_RADIUS = 0.065;
export function guideBox(width: number, height: number): GuideBox {
  const w = Math.min(0.6, height / width * 1.5);
  const h = w * width / (2 * height);
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}
export function pupilCropGeometry(width: number, height: number, circle: Circle, size: number) {
  const side = 2.5 * circle.r * width;
  return { side, sx: circle.cx * width - side / 2, sy: circle.cy * height - side / 2, size, radius: size / 2.5 };
}
export function hintFor(v: Omit<CaptureChecks, 'ready' | 'hint'>): Hint {
  if (v.brightness < 50) return 'dark';
  if (v.brightness > 210) return 'bright';
  if (v.glare > 0.05) return 'glare';
  if (v.contrast < 15) return 'haze';
  if (v.blur < 30) return 'blur';
  if (v.iris_found && v.iris_ratio != null) {
    if (v.iris_ratio < 0.65) return 'closer';
    if (v.iris_ratio > 1.45) return 'back';
    if (Math.hypot(v.offset_x ?? 0, v.offset_y ?? 0) > GUIDE_RADIUS * 0.6) return 'centre';
  }
  return 'ready';
}
export function readySince(previous: number | null, ready: boolean, now: number) { return ready ? previous ?? now : null; }
export function shouldAutoCapture(since: number | null, now: number) { return since != null && now - since >= 1000; }
export function validModelUrl(value: string) {
  if (value === '/model/model.json') return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !/\s/.test(value); } catch { return false; }
}
export function checkPixels(data: Uint8ClampedArray, width: number, height: number, target: Circle): Omit<CaptureChecks, 'ready' | 'hint' | 'iris_found' | 'iris_ratio' | 'offset_x' | 'offset_y'> {
  const gray = new Float32Array(width * height);
  let sum = 0, squares = 0, white = 0, inside = 0;
  for (let i = 0; i < gray.length; i++) {
    const red = data[4*i] ?? 0, green = data[4*i+1] ?? 0, blue = data[4*i+2] ?? 0;
    const g = .299 * red + .587 * green + .114 * blue;
    gray[i] = g; sum += g; squares += g*g;
    if (Math.hypot(i % width - target.cx * width, Math.floor(i/width) - target.cy * height) <= target.r * width) { inside++; if (red > 240 && green > 240 && blue > 240) white++; }
  }
  let n = 0, mean = 0, m2 = 0;
  for (let y=1; y<height-1; y++) for (let x=1; x<width-1; x++) {
    const i=y*width+x;
    const lap=(gray[i-1] ?? 0)+(gray[i+1] ?? 0)+(gray[i-width] ?? 0)+(gray[i+width] ?? 0)-4*(gray[i] ?? 0);
    n++; const d=lap-mean; mean+=d/n; m2+=d*(lap-mean);
  }
  const brightness = sum / Math.max(1, gray.length);
  return { brightness, contrast: Math.sqrt(Math.max(0, squares / Math.max(1, gray.length) - brightness*brightness)), blur: n>1 ? m2/(n-1) : 0, glare: inside ? white/inside : 0 };
}