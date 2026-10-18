import type { Role } from './auth';

export function storedPhotoPath(role: Role | null, fullRequested: boolean, original: string, roi: string | null | undefined) {
  return role === 'admin' && fullRequested ? original : roi ?? null;
}