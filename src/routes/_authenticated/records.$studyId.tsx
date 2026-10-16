import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useProfiles, useRecords, recordsKey, type EyeRow } from "@/lib/data";
import { BUCKET, useSignedUrl } from "@/lib/storage";
import { diagnosisLabel, eyeLabel, majority, sexLabel } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { QualityBadge } from "@/components/QualityBadge";
import { ZoomImage } from "@/components/ZoomImage";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/records/$studyId")({
  head: ({ params }) => ({ meta: [{ title: `${params.studyId} – Netra AI` }, { name: "description", content: "Screening record detail." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Detail />
    </RoleGate>
  ),
});

function Detail() {
  const { studyId } = Route.useParams();
  const { L } = useLang();
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useRecords();
  const p = data?.find((x) => x.study_id === studyId);
  const consentUrl = useSignedUrl(p?.consent_photo_path);

  if (isLoading) return <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>;
  if (!p) return <p>{L("Record not found", "রেকর্ড পাওয়া যায়নি")}</p>;

  const remove = async () => {
    const paths = [...p.eye_images.map((e) => e.storage_path), ...(p.consent_photo_path ? [p.consent_photo_path] : [])];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("patients").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: recordsKey });
    toast.success(L("Record deleted", "রেকর্ড মুছে ফেলা হয়েছে"));
    navigate({ to: "/records" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle sub={`${p.screening_date} · ${p.sites?.name ?? ""}`}>
        <span className="font-mono">{p.study_id}</span>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 text-sm sm:grid-cols-4">
        <Info k={L("Age", "বয়স")} v={String(p.age ?? "–")} />
        <Info k={L("Sex", "লিঙ্গ")} v={p.sex ? L(sexLabel[p.sex].en, sexLabel[p.sex].bn) : "–"} />
        <Info k={L("Area", "এলাকা")} v={p.area ?? "–"} />
        <Info k={L("Consent", "সম্মতি")} v={p.consent_type === "written" ? L("Written", "লিখিত") : L("Verbal", "মৌখিক")} />
      </div>
      {consentUrl.data && (
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">{L("Consent form photo", "সম্মতিপত্রের ছবি")}</summary>
          <img src={consentUrl.data} alt="" className="mt-3 rounded-lg" />
        </details>
      )}
      {p.eye_images.sort((a, b) => a.eye.localeCompare(b.eye)).map((e) => <EyeBlock key={e.id} e={e} />)}

      {role === "admin" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="h-12 w-full">{L("Delete record", "রেকর্ড মুছুন")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{L("Delete this record?", "এই রেকর্ড মুছবেন?")}</AlertDialogTitle>
              <AlertDialogDescription>{L("Photos and reviews will be permanently removed.", "ছবি ও মূল্যায়ন স্থায়ীভাবে মুছে যাবে।")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{L("Cancel", "বাতিল")}</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>{L("Delete", "মুছুন")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function EyeBlock({ e }: { e: EyeRow }) {
  const { L } = useLang();
  const url = useSignedUrl(e.storage_path);
  const profiles = useProfiles();
  const cons = majority(e.reviews.map((r) => r.diagnosis));
  const circle = e.circle_r != null ? { cx: e.circle_cx!, cy: e.circle_cy!, r: e.circle_r } : null;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{L(eyeLabel[e.eye].en, eyeLabel[e.eye].bn)}</h2>
        <QualityBadge status={e.quality_status} />
      </div>
      <ZoomImage src={url.data} circle={circle} />
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>{L("Flash", "ফ্ল্যাশ")}: {e.flash_used ? L("Yes", "হ্যাঁ") : L("No", "না")}</span>
        <span>{L("Lighting", "আলো")}: {e.lighting}</span>
        <span>{L("Phone", "ফোন")}: {e.phone_model}</span>
        <span>{L("Sharpness", "তীক্ষ্ণতা")}: {e.blur_score?.toFixed(0)}</span>
        <span>{L("Brightness", "উজ্জ্বলতা")}: {e.brightness?.toFixed(0)}</span>
        <span>{L("Glare", "প্রতিফলন")}: {e.glare_fraction != null ? (e.glare_fraction * 100).toFixed(1) + "%" : "–"}</span>
        {e.visual_acuity && <span>{L("Acuity", "দৃষ্টিশক্তি")}: {e.visual_acuity}</span>}
      </div>
      {e.notes && <p className="text-sm">{e.notes}</p>}
      <div className="border-t pt-3">
        <p className="text-sm font-semibold">
          {L("Doctor reviews", "ডাক্তারের মূল্যায়ন")} ({e.reviews.length})
          {cons && <span className="ml-2 text-primary">· {L("Consensus", "সম্মত মত")}: {L(diagnosisLabel[cons].en, diagnosisLabel[cons].bn)}</span>}
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {e.reviews.map((r) => (
            <li key={r.id} className="rounded-lg bg-muted p-2">
              <span className="font-medium">{L(diagnosisLabel[r.diagnosis].en, diagnosisLabel[r.diagnosis].bn)}</span>
              {r.other_text && ` (${r.other_text})`} · {L("conf.", "আস্থা")} {r.confidence} · {r.referral ? L("refer", "রেফার") : L("no referral", "রেফার নয়")}
              <span className="block text-xs text-muted-foreground">{profiles.data?.[r.doctor_id] ?? r.doctor_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString()}</span>
              {r.comments && <span className="block text-xs">{r.comments}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return <div><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium">{v}</p></div>;
}
