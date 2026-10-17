import simd from '@/assets/mediapipe/vision_wasm_internal.wasm.asset.json';
import nosimd from '@/assets/mediapipe/vision_wasm_nosimd_internal.wasm.asset.json';
import type { Circle } from './image';
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
    return r > 0 ? [{cx:centre.x,cy:centre.y,r}] : [];
  });
  return circles.sort((a,b) => Math.hypot(a.cx-.5,(a.cy-.5)*aspect)-Math.hypot(b.cx-.5,(b.cy-.5)*aspect))[0] ?? null;
}
