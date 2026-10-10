import { describe, expect, it } from 'vitest';

import { parseSeriesYear, seriesPath, seriesSlug, slugify, teamSlug } from '@/lib/series-slug';

const team = (full_name: string, nickname?: string | null) => ({ full_name, nickname });

// The five flagships as stored since `00020` (home-court team = `team_a`).
const FLAGSHIPS: [year: number, a: ReturnType<typeof team>, b: ReturnType<typeof team>, path: string][] = [
  [2013, team('Miami Heat', 'Heat'), team('San Antonio Spurs', 'Spurs'), '/series/2013/heat-spurs'],
  [2016, team('Golden State Warriors', 'Warriors'), team('Cleveland Cavaliers', 'Cavaliers'), '/series/2016/warriors-cavaliers'],
  [2019, team('Toronto Raptors', 'Raptors'), team('Philadelphia 76ers', '76ers'), '/series/2019/raptors-76ers'],
  [2025, team('Oklahoma City Thunder', 'Thunder'), team('Indiana Pacers', 'Pacers'), '/series/2025/thunder-pacers'],
  [2026, team('Oklahoma City Thunder', 'Thunder'), team('San Antonio Spurs', 'Spurs'), '/series/2026/thunder-spurs'],
];

describe('series slugs (Story 6.1, owner decision 1a)', () => {
  it('is {home}-{away} in stored order for the five flagships, with no round and no alias', () => {
    for (const [year, a, b, path] of FLAGSHIPS) {
      expect(seriesPath({ year, team_a: a, team_b: b })).toBe(path);
      expect(seriesPath({ year, team_a: a, team_b: b }, 'result')).toBe(`${path}/result`);
    }
  });

  it('never re-sorts the pair: the reversed stored order is a different slug', () => {
    const a = team('Cleveland Cavaliers', 'Cavaliers');
    const b = team('Golden State Warriors', 'Warriors');
    expect(seriesSlug({ year: 2016, team_a: b, team_b: a })).toBe('warriors-cavaliers');
    expect(seriesSlug({ year: 2016, team_a: a, team_b: b })).toBe('cavaliers-warriors');
  });

  it('lowercase ASCII, one hyphen per run of non-alphanumerics', () => {
    expect(teamSlug(team('Philadelphia 76ers', '76ers'))).toBe('76ers');
    expect(teamSlug(team('Portland Trail Blazers', 'Trail Blazers'))).toBe('trail-blazers');
    expect(teamSlug(team('Seattle SuperSonics', 'SuperSonics'))).toBe('supersonics');
    expect(slugify('  St. Louis -- Hawks!  ')).toBe('st-louis-hawks');
    expect(slugify('Montréal Royaux')).toBe('montreal-royaux');
  });

  it('falls back to full_name when the nickname is missing or blank', () => {
    expect(teamSlug(team('Pittsburgh Pipers', null))).toBe('pittsburgh-pipers');
    expect(teamSlug(team('Pittsburgh Pipers', '   '))).toBe('pittsburgh-pipers');
    expect(teamSlug({ full_name: 'Miami Heat' })).toBe('miami-heat');
  });

  it('has no slug without both team embeds, or for a name with no ASCII letter or digit', () => {
    expect(seriesSlug({ year: 2016 })).toBeNull();
    expect(seriesPath({ year: 2016, team_a: team('Miami Heat', 'Heat') })).toBeNull();
    expect(seriesSlug({ year: 2016, team_a: team('—', '—'), team_b: team('Miami Heat', 'Heat') })).toBeNull();
  });

  it('parses a 4-digit year segment and nothing else', () => {
    expect(parseSeriesYear('1968')).toBe(1968);
    for (const bad of ['68', '19680', '1968a', '', null, undefined, '06715a85-ec33-46a4-8383-d058055eefe6']) {
      expect(parseSeriesYear(bad)).toBeNull();
    }
  });
});
