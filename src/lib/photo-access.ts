import type { Role } from './auth';

export function storedPhotoPath(role: Role | null, fullRequested: boolean, original: string, roi: string | null | undefined, confirmed = true) {
  return role === 'admin' && fullRequested ? original : confirmed ? roi ?? null : null;
}