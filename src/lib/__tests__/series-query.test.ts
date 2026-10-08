// Story 4.5 · the two series projections: every reader selects `is_featured`;
// only the series pages (and the prerender) embed `series_content`.
import { describe, expect, it } from 'vitest';
import { SERIES_PAGE_SELECT, SERIES_SELECT } from '@/lib/series-query';

const EMBED = 'series_content(series_id, part, headline, body_md, videos, updated_at)';

describe('series projections (Story 4.5)', () => {
  it('SERIES_SELECT carries is_featured and no editorial content', () => {
    expect(SERIES_SELECT).toMatch(/\bis_featured\b/);
    expect(SERIES_SELECT).not.toContain('series_content');
  });

  it('SERIES_PAGE_SELECT is SERIES_SELECT plus the exact series_content embed', () => {
    expect(SERIES_PAGE_SELECT).toMatch(/\bis_featured\b/);
    expect(SERIES_PAGE_SELECT).toContain(EMBED);
    expect(SERIES_PAGE_SELECT.split('series_content(')).toHaveLength(2);
    expect(SERIES_PAGE_SELECT.replace(`,\n  ${EMBED}`, '').trim()).toBe(SERIES_SELECT.trim());
  });
});
