import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLang } from "@/lib/i18n";
import { useDashboardStats } from "@/lib/data";
import { diagnosisLabel, DIAGNOSES, sexLabel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { reasonLabel, statusLabel, typeLabel, type ReferralReason, type ReferralStatus, type ReferralType } from "@/lib/referral";

type RefStats = { by_status: Record<string, number>; by_reason: Record<string, number>; by_type: Record<string, number>; median_hours_to_doctor: number | null; completion_rate: number | null };
function ReferralStats() {
  const { L, T } = useLang();
  const { role } = useAuth();
  const q = useQuery({ queryKey: ["records", "referral-stats"], enabled: role === "admin" || role === "doctor", queryFn: async () => { const { data, error } = await supabase.rpc("referral_stats"); if (error) throw error; return data as unknown as RefStats; } });
  if (!q.data) return null;
  const e = (m: Record<string, number>, lab: (k: string) => string) => Object.entries(m).map(([k, v]) => ({ name: lab(k), value: Number(v) }));
  const d = q.data;
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{L("Referrals", "রেফারাল")}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{L("Median hours to doctor decision", "ডাক্তারের সিদ্ধান্তে মধ্যমা সময় (ঘণ্টা)")}</p><p className="mt-1 font-display text-3xl font-semibold text-primary">{d.median_hours_to_doctor == null ? "–" : d.median_hours_to_doctor.toFixed(1)}</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{L("Reached hospital (of known outcomes)", "হাসপাতালে গেছেন (জানা ফলাফলের মধ্যে)")}</p><p className="mt-1 font-display text-3xl font-semibold text-primary">{d.completion_rate == null ? "–" : `${Math.round(d.completion_rate * 100)}%`}</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Chart title={L("By status", "অবস্থা অনুযায়ী")} data={e(d.by_status, (k) => T(statusLabel[k as ReferralStatus]))} />
        <Chart title={L("By reason", "কারণ অনুযায়ী")} data={e(d.by_reason, (k) => T(reasonLabel[k as ReferralReason]))} />
        <Chart title={L("By type", "ধরন অনুযায়ী")} data={e(d.by_type, (k) => T(typeLabel[k as ReferralType]))} />
      </div>
    </div>
  );
}

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
      <ReferralStats />
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
