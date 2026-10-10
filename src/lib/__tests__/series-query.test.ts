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

// Story 6.2: Predict's detailed-result title link and Home's "Read the series"
// link build their slug from each team's `nickname` (`series-slug.ts`), read
// through this projection. Without it the slug silently falls back to the
// full name and every in-app link 404s against the prerendered slug pages.
describe('series projection team embeds carry nickname (Story 6.2)', () => {
  const embed = (alias: string) => new RegExp(`${alias}:${alias}_id\(([^)]*)\)`).exec(SERIES_SELECT)?.[1] ?? '';

  it.each(['team_a', 'team_b'])('the %s embed selects nickname', (alias) => {
    const columns = embed(alias).split(',').map((c) => c.trim());
    expect(columns).toContain('nickname');
  });
});
