import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useRecordsPage, PAGE_SIZE } from "@/lib/data";
import { useSignedUrls } from "@/lib/storage";
import { diagnosisLabel, eyeLabel, majority, sexLabel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { QualityBadge } from "@/components/QualityBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/records/")({
  head: () => ({ meta: [{ title: "Records – Netra AI" }, { name: "description", content: "All screening records." }, { property: "og:title", content: "Records – Netra AI" }, { property: "og:description", content: "All screening records." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Records />
    </RoleGate>
  ),
});

function Records() {
  const { L, T } = useLang();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  // wait until typing stops before asking the server
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);
  const { data, isLoading, isFetching } = useRecordsPage(page, search);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shown = (e: (typeof rows)[number]["eye_images"][number]) => (e.pupil_circle_confirmed ? e.thumb_path ?? e.pupil_roi_path : null);
  const paths = rows.flatMap((p) => p.eye_images.flatMap((e) => { const s = shown(e); return s ? [s] : []; }));
  const urls = useSignedUrls(paths);

  return (
    <div>
      <PageTitle sub={L(`${total} patients`, `${total} জন রোগী`)}>{L("Records", "রেকর্ড")}</PageTitle>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-12 pl-9" placeholder={L("Search Study ID or area…", "স্টাডি আইডি বা এলাকা খুঁজুন…")} value={q} onChange={(e) => setQ(e.target.value)} />
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
              {[...p.eye_images].sort((a, b) => a.eye.localeCompare(b.eye)).map((e) => {
                const cons = majority(e.reviews.map((r) => r.diagnosis));
                return (
                  <div key={e.id} className="flex gap-2">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {(() => { const s = shown(e); return s && urls.data?.[s] ? <img src={urls.data[s]} alt="" loading="lazy" decoding="async" width={64} height={64} className="h-full w-full object-cover" /> : null; })()}
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
      {total > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="outline" className="h-11" disabled={page === 0 || isFetching} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" />{L("Previous", "আগের")}</Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {pages}</span>
          <Button variant="outline" className="h-11" disabled={page + 1 >= pages || isFetching} onClick={() => setPage(page + 1)}>{L("Next", "পরের")}<ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
