import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { DIAGNOSES, diagnosisLabel, eyeLabel, sexLabel, type Diagnosis } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { StoredEyePhoto } from "@/components/StoredEyePhoto";
import { Choice } from "@/components/EyeCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({ meta: [{ title: "Doctor review – Netra AI" }, { name: "description", content: "Label eye photos independently." }, { property: "og:title", content: "Doctor review – Netra AI" }, { property: "og:description", content: "Label eye photos independently." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <RoleGate roles={["admin", "doctor"]}>
      <ReviewQueue />
    </RoleGate>
  ),
});

type QueueItem = {
  id: string;
  eye: string;
  storage_path: string;
  pupil_roi_path: string | null;
  pupil_circle_confirmed: boolean;
  circle_cx: number | null;
  circle_cy: number | null;
  circle_r: number | null;
  patients: { study_id: string; age: number | null; sex: string | null } | null;
  reviews: { doctor_id: string }[];
};

function ReviewQueue() {
  const { L, T } = useLang();
  const { userId } = useAuth();
  const q = useQuery({
    queryKey: ["review-queue", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eye_images")
        .select("id, eye, storage_path, pupil_roi_path, pupil_circle_confirmed, circle_cx, circle_cy, circle_r, patients(study_id, age, sex), reviews(doctor_id)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as QueueItem[];
    },
  });
  const pending = useMemo(() => (q.data ?? []).filter((i) => !i.reviews.some((r) => r.doctor_id === userId)), [q.data, userId]);
  const item = pending[0];

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle sub={L(`${pending.length} photos waiting for your review`, `${pending.length}টি ছবি আপনার মূল্যায়নের অপেক্ষায়`)}>
        {L("Doctor review", "ডাক্তারের মূল্যায়ন")}
      </PageTitle>
      {q.isLoading && <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>}
      {!q.isLoading && !item && <div className="rounded-xl border bg-success-soft p-6 text-center">{L("All caught up — nothing to review.", "সব শেষ — মূল্যায়নের কিছু নেই।")}</div>}
      {item && <ReviewForm key={item.id} item={item} />}
    </div>
  );
}

function ReviewForm({ item }: { item: QueueItem }) {
  const { L, T } = useLang();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [otherText, setOtherText] = useState("");
  const [confidence, setConfidence] = useState<number>(3);
  const [referral, setReferral] = useState<"yes" | "no" | "">("");
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const circle = item.circle_r != null && item.circle_cx != null && item.circle_cy != null ? { cx: item.circle_cx, cy: item.circle_cy, r: item.circle_r } : null;
  const p = item.patients;

  const submit = async () => {
    if (!diagnosis || !referral || !userId || !item.pupil_circle_confirmed) return;
    setBusy(true);
    const { error } = await supabase.from("reviews").insert({
      eye_image_id: item.id,
      doctor_id: userId,
      diagnosis,
      other_text: diagnosis === "other" ? otherText : null,
      confidence,
      referral: referral === "yes",
      comments: comments || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(L("Review saved", "মূল্যায়ন সংরক্ষিত"));
    qc.invalidateQueries();
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-secondary px-3 py-1 font-mono">{p?.study_id}</span>
        <span className="rounded-full bg-secondary px-3 py-1">{T(eyeLabel[item.eye])}</span>
        <span className="rounded-full bg-secondary px-3 py-1">{L("Age", "বয়স")} {p?.age ?? "?"}</span>
        {p?.sex && <span className="rounded-full bg-secondary px-3 py-1">{T(sexLabel[p.sex])}</span>}
      </div>
      <StoredEyePhoto id={item.id} original={item.storage_path} roi={item.pupil_roi_path} circle={circle} confirmed={item.pupil_circle_confirmed}/>

      <div className="space-y-2">
        <Label className="text-base">{L("Diagnosis", "রোগ নির্ণয়")}</Label>
        <div className="grid gap-2">
          {DIAGNOSES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDiagnosis(d)}
              className={cn("min-h-12 rounded-xl border px-4 text-left font-medium", diagnosis === d ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
            >
              {T(diagnosisLabel[d])}
            </button>
          ))}
        </div>
        {diagnosis === "other" && <Input className="h-12" placeholder={L("Which disease?", "কোন রোগ?")} value={otherText} onChange={(e) => setOtherText(e.target.value)} />}
      </div>

      <div className="space-y-2">
        <Label className="text-base">{L("Confidence (1–5)", "আত্মবিশ্বাস (১–৫)")}</Label>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setConfidence(n)} className={cn("h-12 rounded-xl border text-lg font-semibold", confidence === n ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{n}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-base">{L("Referral recommended?", "রেফার করা উচিত?")}</Label>
        <Choice value={referral} onChange={setReferral} options={[{ v: "yes", label: L("Yes", "হ্যাঁ") }, { v: "no", label: L("No", "না") }]} />
      </div>

      <div className="space-y-2">
        <Label className="text-base">{L("Comments", "মন্তব্য")}</Label>
        <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>

      <Button className="h-14 w-full text-base" disabled={busy || !diagnosis || !referral || !item.pupil_circle_confirmed} onClick={submit}>
        {L("Save & next", "সংরক্ষণ ও পরবর্তী")}
      </Button>
    </div>
  );
}
