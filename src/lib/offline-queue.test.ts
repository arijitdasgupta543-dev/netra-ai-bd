import { describe, expect, it } from 'vitest';
import { isNetworkError } from './offline-queue';
import { safeSearch } from './data';
describe('offline save helpers', () => {
  it('recognises network failures but not permission errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('new row violates row-level security policy'))).toBe(false);
  });
  it('strips characters that would break the server search filter', () => {
    expect(safeSearch(' NETRA-0001 ')).toBe('NETRA-0001');
    expect(safeSearch('a,b(c)*%')).toBe('a b c');
  });
});
