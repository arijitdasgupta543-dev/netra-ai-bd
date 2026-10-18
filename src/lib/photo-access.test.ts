import { describe, expect, it } from 'vitest';
import { storedPhotoPath } from './photo-access';

describe('stored eye photo access', () => {
  it('defaults admins to pupil-only and requires explicit original selection', () => {
    expect(storedPhotoPath('admin',false,'eyes/full.jpg','pupil-roi/tight.jpg')).toBe('pupil-roi/tight.jpg');
    expect(storedPhotoPath('admin',true,'eyes/full.jpg','pupil-roi/tight.jpg')).toBe('eyes/full.jpg');
  });
  it('never selects originals for doctors', () => {
    expect(storedPhotoPath('doctor',true,'eyes/full.jpg','pupil-roi/tight.jpg')).toBe('pupil-roi/tight.jpg');
  });
  it('never selects originals for health workers', () => {
    expect(storedPhotoPath('health_worker',true,'eyes/full.jpg','pupil-roi/tight.jpg')).toBe('pupil-roi/tight.jpg');
  });
  it('fails closed instead of showing originals when the ROI is missing', () => {
    expect(storedPhotoPath('doctor',false,'eyes/full.jpg',null)).toBeNull();
    expect(storedPhotoPath('admin',false,'eyes/full.jpg',undefined)).toBeNull();
  });
});