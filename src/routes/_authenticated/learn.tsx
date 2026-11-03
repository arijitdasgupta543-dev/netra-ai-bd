import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Choice } from "@/components/EyeCapture";
import { Slider } from "@/components/ui/slider";
import scene from "@/assets/hero.jpg";

export const Route = createFileRoute("/_authenticated/learn")({
  head: () => ({ meta: [{ title: "Patient education – Netra AI" }, { name: "description", content: "Show patients how cataract changes vision." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Learn />
    </RoleGate>
  ),
});

/**
 * Cataract vision simulation for counselling (approximate, not individual):
 * blur (scatter), lower contrast, yellow-brown tint (lens ageing), and glare around light.
 */
function cataractFilter(severity: number) {
  const s = Math.max(0, Math.min(1, severity));
  return `blur(${(s * 6).toFixed(1)}px) contrast(${(1 - 0.55 * s).toFixed(2)}) sepia(${(0.7 * s).toFixed(2)}) brightness(${(1 + 0.12 * s).toFixed(2)})`;
}

function Learn() {
  const { L } = useLang();
  const [sev, setSev] = useState(0.5);
  const [view, setView] = useState<"cataract" | "after">("cataract");
  const s = view === "after" ? 0 : sev;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle sub={L("Show this to the patient and family.", "রোগী ও পরিবারকে এটি দেখান।")}>{L("How cataract changes vision", "ছানিতে দৃষ্টি কেমন বদলায়")}</PageTitle>
      <Choice value={view} onChange={setView} options={[{ v: "cataract", label: L("With cataract", "ছানি থাকলে") }, { v: "after", label: L("After surgery", "অপারেশনের পরে") }]} />
      <div className="relative overflow-hidden rounded-2xl border">
        <img src={scene} alt="" className="block w-full" style={{ filter: cataractFilter(s), transition: "filter .3s" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 70% 18%, rgba(255,255,230,${(0.55 * s).toFixed(2)}) 0%, transparent 45%)` }} />
      </div>
      {view === "cataract" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground"><span>{L("Early", "প্রাথমিক")}</span><span>{L("Advanced", "অগ্রসর")}</span></div>
          <Slider min={0} max={1} step={0.05} value={[sev]} onValueChange={(v) => setSev(v[0] ?? sev)} />
        </div>
      )}
      <div className="space-y-2 rounded-xl bg-primary-soft p-4 text-sm">
        {view === "cataract" ? <>
          <p className="font-semibold">{L("Untreated cataract slowly gets worse:", "চিকিৎসা না করলে ছানি ধীরে ধীরে বাড়ে:")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{L("Everything looks blurred and faded", "সবকিছু ঝাপসা ও ফ্যাকাশে লাগে")}</li>
            <li>{L("Colours turn yellow-brown", "রং হলদেটে-বাদামি হয়ে যায়")}</li>
            <li>{L("Strong glare from lamps and sunlight", "বাতি ও রোদের আলোয় ঝলক লাগে")}</li>
            <li>{L("Faces, steps and roads become hard to see – falls and accidents increase", "মুখ, সিঁড়ি, রাস্তা দেখা কঠিন হয় – পড়ে যাওয়া ও দুর্ঘটনা বাড়ে")}</li>
          </ul>
        </> : <>
          <p className="font-semibold">{L("A short operation replaces the cloudy lens:", "ছোট একটি অপারেশনে ঘোলা লেন্স বদলে দেওয়া হয়:")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{L("Usually 20–30 minutes; often home the same day", "সাধারণত ২০–৩০ মিনিট; অনেক সময় একই দিনে বাড়ি")}</li>
            <li>{L("Low-cost or free at government hospitals and eye camps", "সরকারি হাসপাতাল ও চক্ষু শিবিরে কম খরচে বা বিনা খরচে")}</li>
            <li>{L("Most people see clearly again", "বেশিরভাগ মানুষ আবার পরিষ্কার দেখেন")}</li>
          </ul>
        </>}
      </div>
      <p className="text-xs text-muted-foreground">{L("Simulation is approximate; each person's vision differs.", "এটি আনুমানিক ছবি; প্রত্যেকের দৃষ্টি আলাদা।")}</p>
    </div>
  );
}
