import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n";
import { useRecords } from "@/lib/data";
import { ageGroup, diagnosisLabel, DIAGNOSES, majority, sexLabel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – Netra AI" }, { name: "description", content: "Data collection progress." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Dashboard />
    </RoleGate>
  ),
});

function Dashboard() {
  const { L } = useLang();
  const { data = [] } = useRecords();
  const s = useMemo(() => {
    const eyes = data.flatMap((p) => p.eye_images.map((e) => ({ ...e, site: p.sites?.name ?? "?" })));
    const reviewed = eyes.filter((e) => e.reviews.length > 0).length;
    const labels = DIAGNOSES.map((d) => ({ name: d, value: eyes.filter((e) => majority(e.reviews.map((r) => r.diagnosis)) === d).length }));
    const pass = eyes.length ? eyes.filter((e) => e.quality_status === "good").length / eyes.length : 0;
    const count = <T,>(arr: T[], key: (x: T) => string) => {
      const m = new Map<string, number>();
      arr.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1));
      return [...m.entries()].map(([name, value]) => ({ name, value }));
    };
    return {
      patients: data.length, eyes: eyes.length, reviewed, unreviewed: eyes.length - reviewed, labels, pass,
      sex: count(data, (p) => p.sex ?? "?"),
      age: count(data, (p) => ageGroup(p.age)).sort((a, b) => a.name.localeCompare(b.name)),
      sites: count(eyes, (e) => e.site),
    };
  }, [data]);

  const tiles = [
    { k: L("Patients", "রোগী"), v: s.patients },
    { k: L("Eye photos", "চোখের ছবি"), v: s.eyes },
    { k: L("Reviewed", "মূল্যায়িত"), v: s.reviewed },
    { k: L("Unreviewed", "অমূল্যায়িত"), v: s.unreviewed },
    { k: L("Quality pass rate", "মান উত্তীর্ণ হার"), v: `${Math.round(s.pass * 100)}%` },
  ];

  return (
    <div className="space-y-6">
      <PageTitle>{L("Dashboard", "ড্যাশবোর্ড")}</PageTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t.k}</p>
            <p className="mt-1 font-display text-3xl font-semibold text-primary">{t.v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Chart title={L("Consensus labels", "সম্মত লেবেল")} data={s.labels.map((x) => ({ ...x, name: L(diagnosisLabel[x.name as keyof typeof diagnosisLabel].en, diagnosisLabel[x.name as keyof typeof diagnosisLabel].bn).split(" (")[0] }))} />
        <Chart title={L("By sex", "লিঙ্গ অনুযায়ী")} data={s.sex.map((x) => ({ ...x, name: sexLabel[x.name] ? L(sexLabel[x.name].en, sexLabel[x.name].bn) : x.name }))} />
        <Chart title={L("By age group", "বয়স অনুযায়ী")} data={s.age} />
        <Chart title={L("Photos per site", "সাইট অনুযায়ী ছবি")} data={s.sites} />
      </div>
    </div>
  );
}

function Chart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 font-semibold">{title}</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
