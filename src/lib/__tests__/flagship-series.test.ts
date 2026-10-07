import { describe, expect, it } from 'vitest';
import { FLAGSHIP_SERIES_IDS, isFlagship } from '@/lib/flagship-series';

describe('isFlagship (Story 4.3)', () => {
  it('matches every pinned id, case-insensitively', () => {
    expect(FLAGSHIP_SERIES_IDS).toHaveLength(5);
    for (const id of FLAGSHIP_SERIES_IDS) {
      expect(isFlagship(id)).toBe(true);
      expect(isFlagship(id.toUpperCase())).toBe(true);
    }
  });

  it('rejects a non-flagship uuid, a malformed id and nothing', () => {
    expect(isFlagship('3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f')).toBe(false);
    expect(isFlagship('abc')).toBe(false);
    expect(isFlagship(undefined)).toBe(false);
  });
});
