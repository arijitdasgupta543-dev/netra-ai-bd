import simd from '@/assets/mediapipe/vision_wasm_internal.wasm.asset.json';
import nosimd from '@/assets/mediapipe/vision_wasm_nosimd_internal.wasm.asset.json';
import type { Circle } from './image';
import { GUIDE_RADIUS, MAX_INITIAL_RADIUS } from './capture';
export async function createIrisDetector() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const supported = await FilesetResolver.isSimdSupported();
  return FaceLandmarker.createFromOptions({ wasmLoaderPath: `/mediapipe/wasm/vision_wasm_${supported ? '' : 'nosimd_'}internal.js`, wasmBinaryPath: supported ? simd.url : nosimd.url }, { baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1 });
}
export function nearestIris(landmarks: { x: number; y: number }[], aspect: number): Circle | null {
  const circles = [468,473].flatMap(index => {
    const centre = landmarks[index];
    const ring = landmarks.slice(index+1,index+5);
    if (!centre || ring.length !== 4) return [];
    const r = Math.max(...ring.map(p => Math.hypot(p.x-centre.x,(p.y-centre.y)*aspect)));
    const radii = ring.map(p => Math.hypot(p.x-centre.x,(p.y-centre.y)*aspect));
    const min = Math.min(...radii);
    const valid = [centre,...ring].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    return valid && r >= GUIDE_RADIUS*.35 && r <= MAX_INITIAL_RADIUS && min/r > .55 && Math.hypot(centre.x-.5,(centre.y-.5)*aspect) <= GUIDE_RADIUS ? [{cx:centre.x,cy:centre.y,r}] : [];
  });
  return circles.sort((a,b) => Math.hypot(a.cx-.5,(a.cy-.5)*aspect)-Math.hypot(b.cx-.5,(b.cy-.5)*aspect))[0] ?? null;
}
