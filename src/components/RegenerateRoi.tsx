import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { recordsKey, type PatientRow } from '@/lib/data';
import { BUCKET, uploadPhoto } from '@/lib/storage';
import { loadImage, maskedPupil, canvasToBlob } from '@/lib/image';
import { Button } from './ui/button';

export function RegenerateRoi({ records }: { records: PatientRow[] | undefined }) {
  const { role } = useAuth();
  const { L } = useLang();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  if (role !== 'admin') return null;
  const regenerate = async () => {
    const eyes = (records ?? []).flatMap(p => p.eye_images.map(e => ({p,e})));
    let done = 0;
    const missing: string[] = [];
    setProgress(`0 / ${eyes.length}`); setSkipped([]);
    try {
      for (const {p,e} of eyes) {
        if (e.circle_cx == null || e.circle_cy == null || e.circle_r == null || e.circle_r <= 0) { missing.push(`${p.study_id} (${e.eye === 'left' ? L('Left eye','বাম চোখ') : L('Right eye','ডান চোখ')})`); continue; }
        const {data,error} = await supabase.storage.from(BUCKET).download(e.storage_path);
        if (error || !data) throw error ?? new Error(L('Photo unavailable','ছবি পাওয়া যায়নি'));
        const url = URL.createObjectURL(data);
        try {
          const img = await loadImage(url);
          const path = await uploadPhoto(`pupil-roi/${p.study_id}`,await canvasToBlob(maskedPupil(img,{cx:e.circle_cx,cy:e.circle_cy,r:e.circle_r})));
          const update = await supabase.from('eye_images').update({pupil_roi_path:path}).eq('id',e.id);
          if (update.error) { await supabase.storage.from(BUCKET).remove([path]); throw update.error; }
          if (e.pupil_roi_path) await supabase.storage.from(BUCKET).remove([e.pupil_roi_path]);
          done++; setProgress(`${done} / ${eyes.length}`);
        } finally { URL.revokeObjectURL(url); }
      }
      toast.success(L(`${done} pupil images regenerated`,`${done}টি মণির ছবি পুনরায় তৈরি হয়েছে`));
    } catch (error) { toast.error(L('Regeneration stopped: ','পুনরায় তৈরি থেমেছে: ')+(error as Error).message); }
    finally { setSkipped(missing); setProgress(null); await qc.invalidateQueries({queryKey:recordsKey}); await qc.invalidateQueries({queryKey:['review-queue']}); }
  };
  return <div className="space-y-2">
    <Button variant="outline" className="min-h-12 w-full whitespace-normal" disabled={!records || progress != null} onClick={regenerate}><RefreshCw/>{progress != null ? L(`Regenerating ${progress}`,`পুনরায় তৈরি হচ্ছে ${progress}`) : L('Regenerate ROI images','মণির ROI ছবি পুনরায় তৈরি করুন')}</Button>
    {!!skipped.length && <p role="status" className="text-sm text-destructive">{L('Missing pupil circle; skipped: ','মণির বৃত্ত নেই; বাদ: ')}{skipped.join(', ')}</p>}
  </div>;
}