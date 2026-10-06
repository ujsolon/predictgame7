// Story 2.3 — the manual_csv adapter: long-format parsing, abbreviation
// resolution through the supplied lookup, and the row-naming failures the
// I/O matrix demands.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createManualCsvAdapter, ManualCsvError, parseManualCsv } from '../../supabase/scripts/pipeline/adapters/manualCsv.ts';
import { CANONICAL_ROUND_LABELS } from '../../supabase/scripts/pipeline/adapters/rounds.ts';
import { groupSourceRows, planPipeline } from '../../supabase/scripts/pipeline/plan.ts';
import { parseTeamsSeed } from '../../supabase/scripts/pipeline/venueBackfill.ts';

const TEAMS: Record<string, number> = { GSW: 10, CLE: 6, OKC: 21, DEN: 8 };
const lookup = (abbreviation: string): number | undefined => TEAMS[abbreviation];

const HEADER = 'year,round,game_number,home_team,away_team,home_score,away_score';

const EXAMPLE_CSV = readFileSync(
  new URL('../../supabase/scripts/pipeline/data/series_manual.example.csv', import.meta.url),
  'utf8',
);
const LIVE_CSV = readFileSync(
  new URL('../../supabase/scripts/pipeline/data/series_manual.csv', import.meta.url),
  'utf8',
);

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

const FINAL_ROWS = [
  '2016,NBA Finals,1,GSW,CLE,108,89',
  '2016,NBA Finals,2,GSW,CLE,118,98',
  '2016,NBA Finals,3,CLE,GSW,120,108',
  '2016,NBA Finals,4,CLE,GSW,137,116',
  '2016,NBA Finals,5,GSW,CLE,104,87',
  '2016,NBA Finals,6,CLE,GSW,115,103',
  '2016,NBA Finals,7,GSW,CLE,89,96',
];

describe('parseManualCsv — the shipped example file', () => {
  it('reads the worked example into two series: one completed seven-game, one live 3–3', () => {
    const { statuses, scores } = parseManualCsv(EXAMPLE_CSV, 'series_manual.example.csv', lookup);
    expect(statuses).toHaveLength(2);
    expect(scores).toHaveLength(13);

    const finals = statuses.find((s) => s.year === 2016);
    expect(finals).toBeDefined();
    // team_a = game 1's home team (AD-5 slot convention): GSW hosted games 1-2.
    expect(finals?.team_a_id).toBe(10);
    expect(finals?.team_b_id).toBe(6);
    // Game 7 row present: winner is CLE (96 at Golden State, 89 home).
    expect(finals?.winner_team_id).toBe(6);

    const live = statuses.find((s) => s.year === 2027);
    expect(live?.team_a_id).toBe(21); // OKC hosted game 1
    expect(live?.winner_team_id).toBeNull();
    const liveGames = scores.filter((g) => g.year === 2027);
    expect(liveGames.map((g) => g.game_number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('emits rows keyed by the ordered identity pair with resolved team ids', () => {
    const { statuses, scores } = parseManualCsv(csv(...FINAL_ROWS), 'x.csv', lookup);
    expect(statuses[0].round).toBe('NBA Finals');
    for (const game of scores) {
      expect([game.team_a_id, game.team_b_id]).toEqual([10, 6]);
    }
  });
});

/**
 * Story 2.17: the committed operator file must be VALID, not empty. Story
 * 2.3's original case required zero data rows, which reddened the gate (and
 * the master pre-push hook) for every push while a playoff 3–3 sat in the
 * file. Header-only is the offseason state (`series_manual.csv:17-21`), not a
 * requirement. Valid means: every row resolves against the real 59-team seed,
 * the rows pass the runner's own grouping and plan assertions against an
 * empty table (a certified 3–3, or a valid seven-game shape), and every round
 * is one of the canonical labels — so a typo reddens the gate before any
 * dispatch, never at the operator's dry-run.
 */
const SEED_LOOKUP = (() => {
  const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
  const seed = parseTeamsSeed(
    read('00005_release_1_data_model.sql') + read('00007_backfill_missing_historical_series.sql'),
    '00005 + 00007 teams seed',
  );
  return (abbreviation: string): number | undefined => seed.get(abbreviation);
})();

function assertValidOperatorCsv(text: string, name: string): void {
  const { statuses, scores } = parseManualCsv(text, name, SEED_LOOKUP);
  for (const status of statuses) {
    if (!CANONICAL_ROUND_LABELS.includes(status.round)) {
      throw new Error(`${name}: round "${status.round}" is not one of ${CANONICAL_ROUND_LABELS.join(', ')}`);
    }
  }
  planPipeline(groupSourceRows(statuses, scores), []);
}

describe('the committed operator file', () => {
  it('is valid: real team codes, a plan the runner accepts, canonical rounds (header-only is the offseason state)', () => {
    expect(() => assertValidOperatorCsv(LIVE_CSV, 'series_manual.csv')).not.toThrow();
  });

  // The check itself, against temporary text — never the live file.
  const pendingThreeThree = [
    '2027,First Round,1,NYK,BOS,108,101',
    '2027,First Round,2,NYK,BOS,97,104',
    '2027,First Round,3,BOS,NYK,112,99',
    '2027,First Round,4,BOS,NYK,95,102',
    '2027,First Round,5,NYK,BOS,110,103',
    '2027,First Round,6,BOS,NYK,106,100',
  ];

  it('accepts a header-only file and a valid six-row 3–3', () => {
    expect(() => assertValidOperatorCsv(HEADER, 'empty.csv')).not.toThrow();
    expect(() => assertValidOperatorCsv(csv(...pendingThreeThree), 'pending.csv')).not.toThrow();
  });

  it('accepts the normal mid-playoff file: one series pending, one carried through Game 7', () => {
    // The runbook's scenarios 2–4 leave seven-row series in the committed file
    // beside pending ones; a tightened check must not redden that state.
    const completed = [
      '2027,First Round,1,DEN,LAL,110,102',
      '2027,First Round,2,DEN,LAL,104,115',
      '2027,First Round,3,LAL,DEN,108,99',
      '2027,First Round,4,LAL,DEN,101,112',
      '2027,First Round,5,DEN,LAL,120,110',
      '2027,First Round,6,LAL,DEN,98,95',
      '2027,First Round,7,DEN,LAL,112,105',
    ];
    expect(() => assertValidOperatorCsv(csv(...pendingThreeThree, ...completed), 'mid-playoff.csv')).not.toThrow();
  });

  it('rejects an ESPN code where the teams table holds another (NY for NYK)', () => {
    const espnCode = pendingThreeThree.map((line) => line.replace('NYK', 'NY'));
    expect(() => assertValidOperatorCsv(csv(...espnCode), 'espn-code.csv')).toThrowError(/unknown team abbreviation "NY"/);
  });

  it('rejects a series the runner would refuse (a 4–2 split)', () => {
    const fourTwo = [...pendingThreeThree.slice(0, 5), '2027,First Round,6,BOS,NYK,99,106'];
    expect(() => assertValidOperatorCsv(csv(...fourTwo), 'four-two.csv')).toThrowError(/not a certified 3–3/);
  });

  it('rejects a non-canonical round label', () => {
    const typo = pendingThreeThree.map((line) => line.replace('First Round', 'First Rnd'));
    expect(() => assertValidOperatorCsv(csv(...typo), 'round-typo.csv')).toThrowError(/round "First Rnd" is not one of/);
  });
});

describe('parseManualCsv — failures name the offending row', () => {
  it('unknown team abbreviation: exits naming the abbreviation and the line', () => {
    expect(() => parseManualCsv(csv('2016,NBA Finals,1,ZZZ,CLE,100,90'), 'bad.csv', lookup)).toThrowError(
      /bad\.csv:2.*unknown team abbreviation "ZZZ"/s,
    );
    expect(() => parseManualCsv(csv('2016,NBA Finals,1,GSW,ZZZ,100,90'), 'bad.csv', lookup)).toThrowError(/ZZZ/);
  });

  it('a tie is rejected, naming the row', () => {
    expect(() => parseManualCsv(csv('2016,NBA Finals,1,GSW,CLE,100,100'), 'tie.csv', lookup)).toThrowError(
      /tie\.csv:2.*tie score 100-100/s,
    );
  });

  it('game numbers outside 1..7 and non-integer fields are rejected', () => {
    expect(() => parseManualCsv(csv('2016,NBA Finals,8,GSW,CLE,100,90'), 'g8.csv', lookup)).toThrowError(/outside 1\.\.7/);
    expect(() => parseManualCsv(csv('2016,NBA Finals,1,GSW,CLE,100,-5'), 'neg.csv', lookup)).toThrowError(/non-negative integer/);
  });

  it('a series without a game 1 row cannot fix its slots', () => {
    expect(() =>
      parseManualCsv(
        csv(
          '2016,NBA Finals,2,CLE,GSW,100,90',
          '2016,NBA Finals,3,CLE,GSW,95,110',
          '2016,NBA Finals,4,GSW,CLE,101,99',
          '2016,NBA Finals,5,GSW,CLE,88,104',
          '2016,NBA Finals,6,CLE,GSW,97,120',
          '2016,NBA Finals,1,GSW,CLE,108,89',
        ),
        'ordered.csv',
        lookup,
      ),
    ).not.toThrow(); // game 1 appears last in the file — slots still resolve
    expect(() => parseManualCsv(csv('2016,NBA Finals,2,CLE,GSW,100,90'), 'no-g1.csv', lookup)).toThrowError(/no game 1 row/);
  });

  it('duplicate games and clashing round labels within one series are rejected', () => {
    expect(() => parseManualCsv(csv(FINAL_ROWS[0], FINAL_ROWS[0]), 'dup.csv', lookup)).toThrowError(/duplicate game_number/);
    expect(() =>
      parseManualCsv(
        csv('2016,NBA Finals,1,GSW,CLE,108,89', '2016,Western Conference Finals,2,GSW,CLE,100,90'),
        'rounds.csv',
        lookup,
      ),
    ).toThrowError(/one round label per series/);
  });

  it('a malformed header, headerless file, or wrong column count is rejected', () => {
    expect(() => parseManualCsv('year,round,game_number\n2016,x,1', 'h.csv', lookup)).toThrowError(/expected 7 columns/);
    expect(() => parseManualCsv('# only comments\n', 'h0.csv', lookup)).toThrowError(/no header row/);
    expect(() => parseManualCsv(['season,round,game_number,home_team,away_team,home_score,away_score', ...FINAL_ROWS].join('\n'), 'hd.csv', lookup)).toThrowError(
      /header column "season"/,
    );
  });
});

describe('ManualCsvError', () => {
  it('is a distinct error class the entry point can report on', () => {
    try {
      parseManualCsv(csv('2016,NBA Finals,1,ZZZ,CLE,100,90'), 'x.csv', lookup);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ManualCsvError);
    }
  });
});

// Moved here from `nba-com.test.ts` by Story 2.16 (2026-10-06), unchanged: it
// pins this adapter's own Decision 8 guard, and was the only test reaching it.
describe('manual_csv adapter deps (Decision 8)', () => {
  it('createManualCsvAdapter without a csvPath fails loudly instead of reading undefined', () => {
    expect(() =>
      createManualCsvAdapter({
        readFile: () => 'unused',
        teamIdByAbbreviation: () => undefined,
      }),
    ).toThrow(/received no csvPath/);
  });
});
