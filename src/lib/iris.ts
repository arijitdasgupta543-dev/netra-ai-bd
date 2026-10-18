import simd from '@/assets/mediapipe/vision_wasm_internal.wasm.asset.json';
import nosimd from '@/assets/mediapipe/vision_wasm_nosimd_internal.wasm.asset.json';
import type { Circle } from './image';
import { GUIDE_RADIUS, MAX_INITIAL_RADIUS } from './capture';

type Detector = Awaited<ReturnType<typeof makeDetector>>;
let shared: Promise<Detector> | null = null;

async function makeDetector() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const supported = await FilesetResolver.isSimdSupported();
  return FaceLandmarker.createFromOptions({ wasmLoaderPath: `/mediapipe/wasm/vision_wasm_${supported ? '' : 'nosimd_'}internal.js`, wasmBinaryPath: supported ? simd.url : nosimd.url }, { baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1 });
}

/** One detector per page session: the ~8 MB model/wasm is downloaded and compiled only once. */
export function createIrisDetector(): Promise<Detector> {
  if (!shared) shared = makeDetector().catch(e => { shared = null; throw e; });
  return shared;
}

let lastTs = 0;
/** Monotonic timestamps are required by MediaPipe VIDEO mode. */
export function nextTimestamp(now = performance.now()) { lastTs = Math.max(now, lastTs + 1); return lastTs; }

export function nearestIris(landmarks: { x: number; y: number }[], aspect: number, requireCentre = true): Circle | null {
  const circles = [468,473].flatMap(index => {
    const centre = landmarks[index];
    const ring = landmarks.slice(index+1,index+5);
    if (!centre || ring.length !== 4) return [];
    const radii = ring.map(p => Math.hypot(p.x-centre.x,(p.y-centre.y)*aspect));
    const r = Math.max(...radii), min = Math.min(...radii);
    const valid = [centre,...ring].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    const sizeOk = requireCentre ? r >= GUIDE_RADIUS*.35 && r <= MAX_INITIAL_RADIUS : r >= 0.01 && r <= 0.3;
    const placeOk = !requireCentre || Math.hypot(centre.x-.5,(centre.y-.5)*aspect) <= GUIDE_RADIUS;
    return valid && sizeOk && min/r > .55 && placeOk ? [{cx:centre.x,cy:centre.y,r}] : [];
  });
  return circles.sort((a,b) => Math.hypot(a.cx-.5,(a.cy-.5)*aspect)-Math.hypot(b.cx-.5,(b.cy-.5)*aspect))[0] ?? null;
}

/** Automatic pupil circle for a still photo (camera or gallery). Returns null when not confident. */
export async function detectIrisInImage(img: HTMLImageElement): Promise<Circle | null> {
  try {
    const detector = await createIrisDetector();
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    const result = detector.detectForVideo(c, nextTimestamp());
    return nearestIris(result.faceLandmarks[0] ?? [], c.height / c.width, false);
  } catch { return null; }
}
