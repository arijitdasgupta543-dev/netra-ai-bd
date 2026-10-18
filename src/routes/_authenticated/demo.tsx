import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cropPupil, loadImage, type Circle } from "@/lib/image";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { CircleEditor } from "@/components/CircleEditor";
import { GuidedCamera } from "@/components/GuidedCamera";
import { PupilFocus } from '@/components/PupilFocus';
import { ModelSettings, useModelUrl } from '@/components/ModelSettings';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { circleConfirmed } from '@/lib/capture';

export const Route = createFileRoute("/_authenticated/demo")({
  head: () => ({ meta: [{ title: "AI research demo – Netra AI" }, { name: "description", content: "Research demo, not a diagnosis." }, { property: "og:title", content: "AI research demo – Netra AI" }, { property: "og:description", content: "Research demo, not a diagnosis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Demo />
    </RoleGate>
  ),
});

function Demo() {
  const { L } = useLang();
  const modelSetting = useModelUrl();
  const [url, setUrl] = useState<string | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [prob, setProb] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "missing" | "error">("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const run = async () => {
    if (!url || !circle || !circleConfirmed(circle, confirmed)) return;
    setStatus("running");
    setProb(null);
    try {
      if (!modelSetting.data || modelSetting.error) throw new Error(L('Model setting unavailable.','মডেল সেটিং পাওয়া যায়নি।'));
      const MODEL_URL = modelSetting.data;
      const res = await fetch(MODEL_URL, { cache: "no-cache" });
      const text = res.ok ? await res.text() : "";
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      if (!json) return setStatus("missing");

      const tf = await import("@tensorflow/tfjs");
      const isGraph = typeof json === "object" && json !== null && (json as { format?: string }).format === "graph-model";
      const model = isGraph ? await tf.loadGraphModel(MODEL_URL) : await tf.loadLayersModel(MODEL_URL);
      const img = await loadImage(url);
      const canvas = cropPupil(img, circle, 224);
      const input = tf.tidy(() => tf.browser.fromPixels(canvas, 3).toFloat().expandDims(0)); // [1,224,224,3], 0–255
      const out = model.predict(input) as import("@tensorflow/tfjs").Tensor;
      const v = (await out.data())[0];
      tf.dispose([input, out]);
      model.dispose();
      setProb(v ?? null);
      setStatus("idle");
    } catch (e) {
      setErr((e as Error).message);
      setStatus("error");
    }
  };

  const reset = () => { setUrl(null); setCircle(null); setProb(null); setStatus("idle"); setConfirmed(false); };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageTitle>{L("AI research demo", "এআই গবেষণা ডেমো")}</PageTitle>
      <div className="flex gap-3 rounded-2xl border-2 border-warning bg-warning-soft p-4">
        <AlertTriangle className="h-6 w-6 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-semibold">{L("Research demo – NOT a diagnosis.", "গবেষণা ডেমো – রোগ নির্ণয় নয়।")}</p>
          <p>{L("Model trained on internet images; not yet validated on patients. Photos here are not saved.", "মডেলটি ইন্টারনেটের ছবিতে প্রশিক্ষিত; রোগীদের উপর এখনো যাচাই হয়নি। এখানের ছবি সংরক্ষণ হয় না।")}</p>
        </div>
      </div>

      {!url ? (
        <GuidedCamera onGallery={f => {setUrl(URL.createObjectURL(f));setCircle({cx:.5,cy:.5,r:.065});}} onCapture={photo => {setUrl(URL.createObjectURL(photo.blob));setCircle(photo.circle);}} />
      ) : (
        <>
          {!confirmed && <>
            <p className="font-medium">{L('Place the circle on the pupil','মণির ওপর বৃত্ত বসান')}</p>
            <CircleEditor src={url} value={circle} onChange={(c) => { setCircle(c); setProb(null); setConfirmed(false); }} />
          </>}
          {circle && <PupilFocus src={url} circle={circle}/>}
          <Button variant={confirmed ? 'outline' : 'default'} className="min-h-12 w-full whitespace-normal" disabled={!circle || status === 'running'} onClick={() => {setConfirmed(!confirmed);setProb(null);}}>{confirmed ? L('Adjust circle','বৃত্ত ঠিক করুন') : L('Circle is correct','বৃত্ত ঠিক আছে')}</Button>
          <div className="flex gap-2">
            <Button variant="outline" className="h-12" onClick={reset}><RefreshCw className="h-4 w-4" /> {L("New photo", "নতুন ছবি")}</Button>
            <Button className="h-12 flex-1 text-base" disabled={!circle || !confirmed || status === "running" || !modelSetting.data || !!modelSetting.error} onClick={run}>
              {status === "running" ? L("Running…", "চলছে…") : L("Run model", "মডেল চালান")}
            </Button>
          </div>
        </>
      )}

      {status === "missing" && (
        <div className="rounded-xl border bg-muted p-4 text-sm">{L("Model not installed yet.", "মডেল এখনো ইনস্টল করা হয়নি।")}</div>
      )}
      {status === "error" && <div className="rounded-xl border bg-danger-soft p-4 text-sm">{L("Model error: ", "মডেল ত্রুটি: ")}{err}</div>}
      {prob != null && <ResultBar p={prob} />}
      <ModelSettings/>
    </div>
  );
}

function ResultBar({ p }: { p: number }) {
  const { L } = useLang();
  const band = p < 0.3 ? "low" : p >= 0.7 ? "high" : "mid";
  const text = {
    low: L("No sign detected", "কোনো লক্ষণ পাওয়া যায়নি"),
    mid: L("Uncertain – see doctor", "অনিশ্চিত – ডাক্তার দেখান"),
    high: L("Possible cataract – refer", "সম্ভাব্য ছানি – রেফার করুন"),
  }[band];
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="relative h-6 overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0 w-[30%] bg-success-soft" />
        <div className="absolute inset-y-0 left-[30%] w-[40%] bg-warning-soft" />
        <div className="absolute inset-y-0 left-[70%] right-0 bg-danger-soft" />
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-foreground" style={{ left: `${p * 100}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>0</span><span>0.30</span><span>0.70</span><span>1</span></div>
      <p className={cn("text-lg font-semibold", band === "low" && "text-success", band === "high" && "text-destructive")}>{text}</p>
      <p className="text-sm text-muted-foreground">{L("Model output", "মডেলের ফল")}: {p.toFixed(3)}</p>
    </div>
  );
}
