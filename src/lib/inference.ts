import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cropPupil, loadImage, type Circle } from "./image";

/**
 * On-device screening model (TF.js). The active row of `model_runs` gives the URL and the
 * threshold chosen on validation data; without one we fall back to the research setting with
 * an uncalibrated 0.5 threshold. The model is cached in memory so a second eye or patient
 * does not download it again.
 */
export type ActiveModel = { id: string | null; version: string; url: string; threshold: number; reviewThreshold: number | null; calibrated: boolean };

/** Two-tier decision, mirrored by the database trigger predictions_band (the database value is authoritative). */
export type Band = "refer" | "review" | "negative";
export function bandOf(score: number, m: Pick<ActiveModel, "threshold" | "reviewThreshold">): Band {
  if (score >= m.threshold) return "refer";
  if (m.reviewThreshold != null && score >= m.reviewThreshold) return "review";
  return "negative";
}

export function useActiveModel() {
  return useQuery({
    queryKey: ["active-model"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ActiveModel> => {
      const run = await supabase.from("model_runs").select("id, version, model_url, threshold, review_threshold").eq("active", true).maybeSingle();
      if (!run.error && run.data) return { id: run.data.id, version: run.data.version, url: run.data.model_url, threshold: run.data.threshold, reviewThreshold: run.data.review_threshold ?? null, calibrated: true };
      const s = await supabase.from("settings").select("model_url").eq("key", "research_model").maybeSingle();
      return { id: null, version: "research-setting", url: s.data?.model_url ?? "/model/model.json", threshold: 0.5, reviewThreshold: null, calibrated: false };
    },
  });
}

type TF = typeof import("@tensorflow/tfjs");
type AnyModel = { predict: (x: unknown) => unknown; dispose: () => void };
const cache = new Map<string, Promise<{ tf: TF; model: AnyModel } | null>>();

/**
 * WebGL uses the phone's GPU. Where it is missing (many low-cost phones, some web views) TF.js would fall back to its
 * plain-JavaScript CPU backend, which measured ~30x slower than the WebAssembly (SIMD) backend in our benchmark
 * (median 7.6 s vs 0.25 s per eye at 6x CPU throttling). Prefer WebGL, then WASM, then CPU.
 */
let backendReady: Promise<string> | null = null;
export function ensureFastBackend(tf: TF): Promise<string> {
  if (!backendReady) {
    backendReady = (async () => {
      try { if (await tf.setBackend("webgl")) { await tf.ready(); return "webgl"; } } catch { /* no WebGL */ }
      try {
        const wasm = await import("@tensorflow/tfjs-backend-wasm");
        wasm.setWasmPaths("/tfjs/");
        if (await tf.setBackend("wasm")) { await tf.ready(); return "wasm"; }
      } catch { /* no WebAssembly */ }
      await tf.setBackend("cpu"); await tf.ready(); return "cpu";
    })();
  }
  return backendReady;
}

/** Loads (once) a layers- or graph-model. Resolves null when no model is installed at the URL. */
export function loadModel(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return null;
      let json: { format?: string } | null = null;
      try { json = JSON.parse(await res.text()); } catch { return null; }
      if (!json) return null;
      const tf = await import("@tensorflow/tfjs");
      await ensureFastBackend(tf);
      const model = (json.format === "graph-model" ? await tf.loadGraphModel(url) : await tf.loadLayersModel(url)) as unknown as AnyModel;
      return { tf, model };
    })().catch((e) => { cache.delete(url); throw e; });
    cache.set(url, p);
  }
  return p;
}

/** Score in [0,1] for one confirmed pupil circle; null when the model is not installed. */
export async function scorePupil(url: string, src: string, circle: Circle): Promise<{ score: number; ms: number } | null> {
  const t0 = performance.now();
  const m = await loadModel(url);
  if (!m) return null;
  const img = await loadImage(src);
  const canvas = cropPupil(img, circle, 224);
  const { tf, model } = m;
  const input = tf.tidy(() => tf.browser.fromPixels(canvas, 3).toFloat().expandDims(0)); // [1,224,224,3], 0–255
  const out = model.predict(input) as import("@tensorflow/tfjs").Tensor;
  const v = (await out.data())[0] ?? 0;
  tf.dispose([input, out]);
  return { score: Math.min(1, Math.max(0, v)), ms: Math.round(performance.now() - t0) };
}
