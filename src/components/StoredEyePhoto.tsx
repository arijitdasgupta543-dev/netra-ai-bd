import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uploadPhoto } from '@/lib/storage';
import { loadImage, maskedPupil, canvasToBlob } from '@/lib/image';
import { CircleEditor } from './CircleEditor';
import { PupilFocus } from './PupilFocus';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { useSignedUrl } from '@/lib/storage';
import { ZoomImage } from './ZoomImage';
import { Button } from './ui/button';
import type { Circle } from '@/lib/image';
import { storedPhotoPath } from '@/lib/photo-access';

/** Never fetch a stored original unless an admin explicitly opens it. */
export function StoredEyePhoto({ id, original, roi, circle, confirmed }: { id: string; original: string; roi?: string | null | undefined; circle: Circle | null; confirmed: boolean }) {
  const { role } = useAuth();
  const { L } = useLang();
  const [full, setFull] = useState(false);
  const [draft, setDraft] = useState<Circle>(circle ?? {cx:.5,cy:.5,r:.065});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const showFull = role === 'admin' && full;
  const url = useSignedUrl(storedPhotoPath(role, full, original, roi, confirmed));
  const confirm = async () => {
    if(role !== 'admin' || !url.data || !showFull) return;
    setSaving(true);
    try {
      const img = await loadImage(url.data);
      const path = await uploadPhoto(`pupil-roi/${id}`,await canvasToBlob(maskedPupil(img,draft)));
      const result = await supabase.from('eye_images').update({circle_cx:draft.cx,circle_cy:draft.cy,circle_r:draft.r,pupil_roi_path:path,pupil_circle_confirmed:true}).eq('id',id);
      if(result.error) throw result.error;
      await qc.invalidateQueries(); setFull(false);
    } catch(error) {toast.error((error as Error).message);} finally {setSaving(false);}
  };
  return <div className="space-y-2">
    {showFull && url.data ? <>
      <p className="font-medium">{L('Place the circle on the pupil','মণির ওপর বৃত্ত বসান')}</p>
      <CircleEditor src={url.data} value={draft} onChange={setDraft}/><PupilFocus src={url.data} circle={draft}/>
      <Button className="min-h-12 w-full" disabled={saving} onClick={confirm}>{saving ? L('Saving…','সংরক্ষণ হচ্ছে…') : L('Circle is correct','বৃত্ত ঠিক আছে')}</Button>
    </> : confirmed && roi ? <ZoomImage src={url.data} circle={null}/> : <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted p-4 text-center text-muted-foreground">{L('Pupil circle pending admin confirmation','মণির বৃত্ত অ্যাডমিনের নিশ্চিত করার অপেক্ষায়')}</div>}
    {role === 'admin' && <Button type="button" variant="outline" size="sm" className="min-h-11 max-w-full whitespace-normal text-xs" aria-pressed={showFull} onClick={() => setFull(!full)}>{showFull ? L('Show pupil only','শুধু মণি দেখুন') : L('Show full photo (admin only)','পূর্ণ ছবি দেখুন (শুধু অ্যাডমিন)')}</Button>}
  </div>;
}