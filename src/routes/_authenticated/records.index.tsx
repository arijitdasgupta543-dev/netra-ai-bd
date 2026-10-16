import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useRecords } from "@/lib/data";
import { useSignedUrls } from "@/lib/storage";
import { diagnosisLabel, eyeLabel, majority, sexLabel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { QualityBadge } from "@/components/QualityBadge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/records/")({
  head: () => ({ meta: [{ title: "Records – Netra AI" }, { name: "description", content: "All screening records." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Records />
    </RoleGate>
  ),
});

function Records() {
  const { L, T } = useLang();
  const { data, isLoading } = useRecords();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((p) => !s || [p.study_id, p.area, p.sites?.name, p.sex].some((v) => v?.toLowerCase().includes(s)));
  }, [data, q]);
  const paths = rows.flatMap((p) => p.eye_images.map((e) => e.storage_path));
  const urls = useSignedUrls(paths);

  return (
    <div>
      <PageTitle sub={L(`${rows.length} patients`, `${rows.length} জন রোগী`)}>{L("Records", "রেকর্ড")}</PageTitle>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-12 pl-9" placeholder={L("Search Study ID, area, site…", "স্টাডি আইডি, এলাকা, সাইট খুঁজুন…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading && <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>}
      <div className="space-y-3">
        {rows.map((p) => (
          <Link key={p.id} to="/records/$studyId" params={{ studyId: p.study_id }} className="block rounded-2xl border bg-card p-4 transition-shadow hover:shadow-soft">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-lg font-semibold">{p.study_id}</span>
              <span className="text-xs text-muted-foreground">{p.screening_date} · {p.sites?.name}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {p.age ?? "?"} {L("yrs", "বছর")} · {p.sex ? T(sexLabel[p.sex]) : "–"} {p.area && `· ${p.area}`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {p.eye_images.sort((a, b) => a.eye.localeCompare(b.eye)).map((e) => {
                const cons = majority(e.reviews.map((r) => r.diagnosis));
                return (
                  <div key={e.id} className="flex gap-2">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {urls.data?.[e.storage_path] && <img src={urls.data[e.storage_path]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 space-y-1 text-xs">
                      <p className="font-medium">{T(eyeLabel[e.eye])}</p>
                      <QualityBadge status={e.quality_status} />
                      <p className="text-muted-foreground">{e.reviews.length} {L("reviews", "মূল্যায়ন")}</p>
                      {cons && <p className="truncate font-medium text-primary">{T(diagnosisLabel[cons])}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
