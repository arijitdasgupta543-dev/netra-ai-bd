import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { useSignedUrl } from '@/lib/storage';
import { ZoomImage } from './ZoomImage';
import { Button } from './ui/button';
import type { Circle } from '@/lib/image';
import { storedPhotoPath } from '@/lib/photo-access';

/** Never fetch a stored original unless an admin explicitly opens it. */
export function StoredEyePhoto({ original, roi, circle }: { original: string; roi?: string | null | undefined; circle: Circle | null }) {
  const { role } = useAuth();
  const { L } = useLang();
  const [full, setFull] = useState(false);
  const showFull = role === 'admin' && full;
  const url = useSignedUrl(storedPhotoPath(role, full, original, roi));
  return <div className="space-y-2">
    {showFull || roi ? <ZoomImage src={url.data} circle={showFull ? circle : null}/> : <div className="flex aspect-square items-center justify-center rounded-lg bg-camera p-4 text-center text-muted-foreground">{L('Pupil image pending admin regeneration','মণির ছবি অ্যাডমিনের পুনরায় তৈরির অপেক্ষায়')}</div>}
    {role === 'admin' && <Button type="button" variant="outline" size="sm" className="min-h-11 max-w-full whitespace-normal text-xs" aria-pressed={showFull} onClick={() => setFull(!full)}>{showFull ? L('Show pupil only','শুধু মণি দেখুন') : L('Show full photo (admin only)','পূর্ণ ছবি দেখুন (শুধু অ্যাডমিন)')}</Button>}
  </div>;
}