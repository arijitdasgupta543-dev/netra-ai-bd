import { pupilCropGeometry } from './capture';
export type Circle = { cx: number; cy: number; r: number }; // cx, cy: fraction of width/height; r: fraction of width

export type QualityStatus = "good" | "fair" | "poor";
export type Quality = {
  blur: number;
  brightness: number;
  glare: number;
  status: QualityStatus;
  advice: { en: string; bn: string; level: QualityStatus }[];
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Downscale a photo to max side and return a JPEG blob (saves rural bandwidth). */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.9): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await canvasToBlob(c, "image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const rank: Record<QualityStatus, number> = { good: 0, fair: 1, poor: 2 };

export function analyseQuality(img: HTMLImageElement, circle: Circle | null): Quality {
  const W = 512;
  const scale = W / img.naturalWidth;
  const H = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const gray = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) {
    const g = 0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0);
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / (W * H);

  // Variance of Laplacian (inside circle region if given, else whole image)
  const cx = circle ? circle.cx * W : W / 2;
  const cy = circle ? circle.cy * H : H / 2;
  const rr = circle ? circle.r * W : Math.max(W, H);
  let n = 0, mean = 0, m2 = 0, glareCount = 0, inside = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rr * rr * 1.5) continue;
      const i = y * W + x;
      const lap = (gray[i - 1] ?? 0) + (gray[i + 1] ?? 0) + (gray[i - W] ?? 0) + (gray[i + W] ?? 0) - 4 * (gray[i] ?? 0);
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
      if (dx * dx + dy * dy <= rr * rr) {
        inside++;
        if ((data[i * 4] ?? 0) > 240 && (data[i * 4 + 1] ?? 0) > 240 && (data[i * 4 + 2] ?? 0) > 240) glareCount++;
      }
    }
  }
  const blur = n > 1 ? m2 / (n - 1) : 0;
  const glare = inside > 0 ? glareCount / inside : 0;

  const advice: Quality["advice"] = [];
  if (blur < 30) advice.push({ level: "poor", en: "Blurry – hold steady and retake", bn: "ঝাপসা – স্থির রেখে আবার তুলুন" });
  else if (blur < 80) advice.push({ level: "fair", en: "Slightly blurry – tap to focus", bn: "একটু ঝাপসা – ফোকাস করতে ট্যাপ করুন" });
  if (brightness < 50) advice.push({ level: "poor", en: "Too dark – add light and retake", bn: "খুব অন্ধকার – আলো বাড়িয়ে আবার তুলুন" });
  else if (brightness < 70) advice.push({ level: "fair", en: "A bit dark", bn: "একটু অন্ধকার" });
  else if (brightness > 210) advice.push({ level: "poor", en: "Too bright – reduce light and retake", bn: "খুব উজ্জ্বল – আলো কমিয়ে আবার তুলুন" });
  else if (brightness > 190) advice.push({ level: "fair", en: "A bit bright", bn: "একটু বেশি উজ্জ্বল" });
  if (glare > 0.05) advice.push({ level: "poor", en: "Strong glare on pupil – retake without flash", bn: "মণিতে প্রতিফলন – ফ্ল্যাশ ছাড়া আবার তুলুন" });
  else if (glare > 0.02) advice.push({ level: "fair", en: "Some glare on pupil", bn: "মণিতে কিছু প্রতিফলন" });

  const status = advice.reduce<QualityStatus>((s, a) => (rank[a.level] > rank[s] ? a.level : s), "good");
  return { blur, brightness, glare, status, advice };
}

/** Square crop of side 2.5×r centred on the circle, resized to `size`. */
export function cropPupil(img: HTMLImageElement, circle: Circle, size = 224): HTMLCanvasElement {
  const W = img.naturalWidth, H = img.naturalHeight;
  const { side, sx, sy } = pupilCropGeometry(W, H, circle, size);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = "image/jpeg", q = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => b ? resolve(b) : reject(new Error('Could not encode photo')), type, q));
}

/** Training ROI only; inference must continue using the unmasked cropPupil. */
export function maskedPupil(img: HTMLImageElement, circle: Circle): HTMLCanvasElement {
  const crop = cropPupil(img, circle, 448);
  const c = document.createElement('canvas'); c.width = 448; c.height = 448;
  const ctx = c.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 448, 448);
  ctx.save(); ctx.beginPath(); ctx.arc(224,224,448/2.5,0,Math.PI*2); ctx.clip(); ctx.drawImage(crop,0,0); ctx.restore();
  return c;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
