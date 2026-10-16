import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import JSZip from "jszip";
import { Download, FileSpreadsheet, FolderArchive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useProfiles, useRecords } from "@/lib/data";
import { buildCsv } from "@/lib/export";
import { BUCKET } from "@/lib/storage";
import { canvasToBlob, cropPupil, downloadBlob, loadImage } from "@/lib/image";
import { folderFor } from "@/lib/labels";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({ meta: [{ title: "Export – Netra AI" }, { name: "description", content: "Export labelled data for model training." }] }),
  component: () => (
    <RoleGate roles={["admin"]}>
      <ExportPage />
    </RoleGate>
  ),
});

function ExportPage() {
  const { L } = useLang();
  const records = useRecords();
  const profiles = useProfiles();
  const [progress, setProgress] = useState<number | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const csv = () => buildCsv(records.data ?? [], profiles.data ?? {});

  const buildZip = async () => {
    const patients = records.data ?? [];
    const eyes = patients.flatMap((p) => p.eye_images.map((e) => ({ p, e })));
    const z = new JSZip();
    z.file("netra_labels.csv", csv());
    setZip(null);
    setProgress(0);
    try {
      for (let i = 0; i < eyes.length; i++) {
        const { p, e } = eyes[i];
        const folder = folderFor(e.reviews.map((r) => r.diagnosis));
        const name = `${p.study_id}_${e.eye}.jpg`;
        const { data, error } = await supabase.storage.from(BUCKET).download(e.storage_path);
        if (error || !data) throw error ?? new Error("download failed");
        z.file(`images/${folder}/${name}`, data);
        if (e.circle_r != null) {
          const url = URL.createObjectURL(data);
          const img = await loadImage(url);
          const crop = cropPupil(img, { cx: e.circle_cx!, cy: e.circle_cy!, r: e.circle_r }, 224);
          z.file(`cropped_224/${folder}/${name}`, await canvasToBlob(crop));
          URL.revokeObjectURL(url);
        }
        setProgress(((i + 1) / eyes.length) * 100);
      }
      setZip(await z.generateAsync({ type: "blob", compression: "STORE" }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const nEyes = (records.data ?? []).reduce((n, p) => n + p.eye_images.length, 0);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageTitle sub={L(`${nEyes} eye photos available`, `${nEyes}টি চোখের ছবি আছে`)}>{L("Export for training", "প্রশিক্ষণের জন্য এক্সপোর্ট")}</PageTitle>

      <div className="rounded-2xl border bg-card p-5">
        <p className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-5 w-5 text-primary" /> CSV</p>
        <p className="mt-1 text-sm text-muted-foreground">{L("One row per eye photo with capture settings, quality scores, every doctor's label and the consensus.", "প্রতিটি চোখের ছবির জন্য এক সারি — ছবি তোলার তথ্য, মান, প্রত্যেক ডাক্তারের লেবেল ও সম্মত মত।")}</p>
        <Button className="mt-4 h-12 w-full" disabled={!records.data} onClick={() => downloadBlob(new Blob([csv()], { type: "text/csv;charset=utf-8" }), `netra_labels_${stamp}.csv`)}>
          <Download className="h-4 w-4" /> {L("Download CSV", "CSV ডাউনলোড")}
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="flex items-center gap-2 font-semibold"><FolderArchive className="h-5 w-5 text-primary" /> ZIP</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {L("images/<label>/ and cropped_224/<label>/ (normal, cataract, other, ungradable, unlabelled) plus the CSV.", "images/<লেবেল>/ ও cropped_224/<লেবেল>/ ফোল্ডার এবং CSV।")}
        </p>
        {progress != null && <Progress value={progress} className="mt-4" />}
        {!zip ? (
          <Button className="mt-4 h-12 w-full" variant="outline" disabled={progress != null || !records.data} onClick={buildZip}>
            {progress != null ? L("Preparing…", "প্রস্তুত হচ্ছে…") : L("Prepare ZIP", "ZIP প্রস্তুত করুন")}
          </Button>
        ) : (
          <Button className="mt-4 h-12 w-full" onClick={() => downloadBlob(zip, `netra_dataset_${stamp}.zip`)}>
            <Download className="h-4 w-4" /> {L("Download ZIP", "ZIP ডাউনলোড")} ({(zip.size / 1e6).toFixed(1)} MB)
          </Button>
        )}
      </div>
    </div>
  );
}
