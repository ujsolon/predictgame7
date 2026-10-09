// Story 6.9 — the ABA Game 7 venue curation file (curated, not yet applied; its
// consumer is Story 6.10's re-key). Pins the file's shape against the applied
// curated CSV so a later edit cannot silently drop, add, reorder or mis-key a row.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dataRow = (line: string) => line.trim() !== '' && !line.startsWith('#');
const read = (name: string) =>
  readFileSync(new URL(`../../supabase/scripts/pipeline/data/${name}`, import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(dataRow);

const [abaHeader, ...abaLines] = read('aba_game7_venues.csv');
const rows = abaLines.map((line) => {
  const [year, team_a, team_b, game7_home_team, source, cross_check, note, ...extra] = line.split(',');
  return { year, team_a, team_b, game7_home_team, source, cross_check, note, extra };
});
const curatedAbaKeys = read('game7_venues_curated.csv')
  .slice(1)
  .map((line) => line.split(','))
  .filter((cols) => cols[3] === 'ABA')
  .map((cols) => cols.slice(0, 3).join(','));

// The six ABA series whose winner (stored team_a) played Game 7 on the road.
const SWAP_SET = ['1971,UTS,IND', '1972,IND,UTS', '1972,NYN,VAS', '1973,IND,KEN', '1973,KEN,CAC', '1975,IND,DEN'];

describe('aba_game7_venues.csv (Story 6.9)', () => {
  it('has the agreed header and exactly 7 fields per row', () => {
    expect(abaHeader).toBe('year,team_a,team_b,game7_home_team,source,cross_check,note');
    for (const row of rows) {
      expect(row.note, `${row.year},${row.team_a},${row.team_b}`).toBeDefined();
      expect(row.extra).toEqual([]);
    }
  });

  it('covers exactly the 18 ABA rows of game7_venues_curated.csv, keyed and ordered the same', () => {
    expect(rows).toHaveLength(18);
    expect(curatedAbaKeys).toHaveLength(18);
    expect(rows.map((r) => `${r.year},${r.team_a},${r.team_b}`)).toEqual(curatedAbaKeys);
  });

  it('names one of the two teams as the Game 7 host on every settled row', () => {
    for (const row of rows) {
      if (row.game7_home_team === '') continue;
      expect([row.team_a, row.team_b]).toContain(row.game7_home_team);
    }
  });

  it('pins the six rows where the Game 7 host is not team_a (the 6.10 swap set)', () => {
    const swaps = rows
      .filter((r) => r.game7_home_team !== '' && r.game7_home_team !== r.team_a)
      .map((r) => `${r.year},${r.team_a},${r.team_b}`);
    expect(swaps).toEqual(SWAP_SET);
  });

  it('cites both sources by https URL', () => {
    for (const row of rows) {
      expect(row.source).toMatch(/^https:\/\//);
      expect(row.cross_check).toMatch(/^https:\/\//);
    }
  });

  it('allows a non-blank note only as an info: remark or on an unsettled row', () => {
    for (const row of rows) {
      if (row.note === '') continue;
      const unsettled = row.game7_home_team === '' || /^(single-source|conflict |neutral)/.test(row.note);
      expect(row.note.startsWith('info:') || unsettled, `${row.year},${row.team_a},${row.team_b}: ${row.note}`).toBe(
        true,
      );
    }
  });
});
