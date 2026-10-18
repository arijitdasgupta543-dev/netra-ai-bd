import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n";
import { useDashboardStats } from "@/lib/data";
import { diagnosisLabel, DIAGNOSES, sexLabel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard – Netra AI" }, { name: "description", content: "Data collection progress." }, { property: "og:title", content: "Dashboard – Netra AI" }, { property: "og:description", content: "Data collection progress." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Dashboard />
    </RoleGate>
  ),
});

function Dashboard() {
  const { L, T } = useLang();
  const { data, isLoading } = useDashboardStats();
  const s = useMemo(() => {
    const entries = (m: Record<string, number> | undefined) => Object.entries(m ?? {}).map(([name, value]) => ({ name, value: Number(value) }));
    const eyes = Number(data?.eyes ?? 0), reviewed = Number(data?.reviewed ?? 0);
    return {
      patients: Number(data?.patients ?? 0), eyes, reviewed, unreviewed: Math.max(0, eyes - reviewed), pass: Number(data?.pass ?? 0),
      labels: DIAGNOSES.map((d) => ({ name: d, value: Number(data?.labels?.[d] ?? 0) })),
      sex: entries(data?.sex),
      age: entries(data?.age).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      sites: entries(data?.sites),
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
      {isLoading && <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t.k}</p>
            <p className="mt-1 font-display text-3xl font-semibold text-primary">{t.v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Chart title={L("Consensus labels", "সম্মত লেবেল")} data={s.labels.map((x) => ({ ...x, name: T(diagnosisLabel[x.name as keyof typeof diagnosisLabel]).split(" (")[0] ?? x.name }))} />
        <Chart title={L("By sex", "লিঙ্গ অনুযায়ী")} data={s.sex.map((x) => { const sl = sexLabel[x.name]; return { ...x, name: sl ? L(sl.en, sl.bn) : x.name }; })} />
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
