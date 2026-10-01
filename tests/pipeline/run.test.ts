// Story 2.3 — the runner end-to-end against a fake sink: no network is
// touched, and the fake records every call so "zero writes" is an assertion,
// not a hope. The fake also applies each operation to its in-memory rows, so
// re-runs and the derived phases of results are proven the way Story 2.2's
// read path sees them.
import { describe, expect, it } from 'vitest';
import { deriveSeriesPhase, type SeriesPhaseInput } from '../../src/lib/series-phase.ts';
import { runPipeline } from '../../supabase/scripts/pipeline/run.ts';
import type { CurrentSeriesRow, PlannedBirth, PlannedCompletion } from '../../supabase/scripts/pipeline/plan.ts';
import type { PipelineSink, TeamRow } from '../../supabase/scripts/pipeline/writer.ts';

const TEAMS: TeamRow[] = [
  { id: 10, abbreviation: 'GSW' },
  { id: 6, abbreviation: 'CLE' },
  { id: 21, abbreviation: 'OKC' },
  { id: 8, abbreviation: 'DEN' },
];

const VALID_ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'never-print-this' };

/**
 * The runner's end-to-end fixture, self-contained: `supabase/scripts/pipeline/
 * data/series_manual.csv` is live operator data that the owner edits before
 * every apply run (Story 2.6's cadence), so no test may pin values to it.
 */
const FIXTURE_CSV = [
  'year,round,game_number,home_team,away_team,home_score,away_score',
  '2016,NBA Finals,1,GSW,CLE,108,89',
  '2016,NBA Finals,2,GSW,CLE,118,98',
  '2016,NBA Finals,3,CLE,GSW,120,108',
  '2016,NBA Finals,4,CLE,GSW,137,116',
  '2016,NBA Finals,5,GSW,CLE,104,87',
  '2016,NBA Finals,6,CLE,GSW,115,103',
  '2016,NBA Finals,7,GSW,CLE,89,96',
  '2027,Western Conference First Round,1,OKC,DEN,110,102',
  '2027,Western Conference First Round,2,OKC,DEN,104,115',
  '2027,Western Conference First Round,3,DEN,OKC,108,99',
  '2027,Western Conference First Round,4,DEN,OKC,101,112',
  '2027,Western Conference First Round,5,OKC,DEN,120,110',
  '2027,Western Conference First Round,6,DEN,OKC,98,95',
].join('\n');

const fixture = () => FIXTURE_CSV;

function sameStoredGame(stored: CurrentSeriesRow['scores'][number], incoming: PlannedCompletion['game']): boolean {
  return (
    stored.home_team_id === incoming.home_team_id &&
    stored.away_team_id === incoming.away_team_id &&
    stored.home_score === incoming.home_score &&
    stored.away_score === incoming.away_score
  );
}

class FakeSink implements PipelineSink {
  teams = TEAMS;
  current: CurrentSeriesRow[] = [];
  births: PlannedBirth[] = [];
  completions: PlannedCompletion[] = [];
  failNextBirth: Error | null = null;

  async readTeams(): Promise<TeamRow[]> {
    return this.teams;
  }

  async readCurrent(): Promise<CurrentSeriesRow[]> {
    return this.current.map((row) => ({ ...row, scores: [...row.scores] }));
  }

  async birth(birthOp: PlannedBirth): Promise<string> {
    if (this.failNextBirth) throw this.failNextBirth;
    // Enforce 00015's birth rules here too: an end-to-end test must never be
    // able to certify a write the production RPC would reject.
    const numbers = birthOp.scores.map((score) => score.game_number);
    const coversOneToSix = numbers.length === 6 && [1, 2, 3, 4, 5, 6].every((n) => numbers.includes(n));
    const decided = birthOp.scores.every(
      (score) => score.home_score !== score.away_score && score.home_score >= 0 && score.away_score >= 0,
    );
    const teamAWins = birthOp.scores.filter((score) => score.winner_team_id === birthOp.team_a_id).length;
    if (!coversOneToSix || !decided || teamAWins !== 3) {
      throw new Error(
        `pipeline_birth_series: not a certified 3-3 for (${birthOp.year}, ${birthOp.team_a_id}/${birthOp.team_b_id}) ` +
          `— games {${numbers.join(',')}}, team_a ${teamAWins} win(s)`,
      );
    }
    this.births.push(birthOp);
    const id = `fake-series-${this.births.length}`;
    this.current.push({
      id,
      year: birthOp.year,
      team_a_id: birthOp.team_a_id,
      team_b_id: birthOp.team_b_id,
      winner_team_id: null,
      scores: birthOp.scores.map((score) => ({
        game_number: score.game_number,
        home_team_id: score.home_team_id,
        away_team_id: score.away_team_id,
        home_score: score.home_score,
        away_score: score.away_score,
      })),
    });
    return id;
  }

  async complete(completion: PlannedCompletion): Promise<void> {
    this.completions.push(completion);
    const row = this.current.find((candidate) => candidate.id === completion.series_id);
    if (!row) throw new Error(`fake sink: completion for unknown series ${completion.series_id}`);
    const stored = row.scores.find((score) => score.game_number === completion.game.game_number);
    if (stored && !sameStoredGame(stored, completion.game)) {
      throw new Error(
        `pipeline_complete_series: series ${completion.series_id} already holds a different game ${completion.game.game_number}; ` +
          'the runner never rewrites archived games',
      );
    }
    if (stored) {
      Object.assign(stored, {
        home_team_id: completion.game.home_team_id,
        away_team_id: completion.game.away_team_id,
        home_score: completion.game.home_score,
        away_score: completion.game.away_score,
      });
    } else {
      row.scores.push({
        game_number: completion.game.game_number,
        home_team_id: completion.game.home_team_id,
        away_team_id: completion.game.away_team_id,
        home_score: completion.game.home_score,
        away_score: completion.game.away_score,
      });
    }
    row.winner_team_id = completion.winner_team_id;
  }
}

function envWith(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { ...VALID_ENV, ...extra };
}

function capture(): { lines: string[]; log: (line: string) => void } {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe('runPipeline — apply, idempotency, dry-run', () => {
  it('runs the worked fixture from an empty table: two births, one completion, and the results derive pending/archive', async () => {
    const sink = new FakeSink();
    const out = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--source=manual_csv'],
      createSink: () => sink,
      readFile: fixture,
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(2);
    expect(sink.completions).toHaveLength(1); // the 2016 followup — the fixture's live 3-3 stays pending
    expect(sink.current).toHaveLength(2);

    const finals = sink.current.find((row) => row.year === 2016);
    const live = sink.current.find((row) => row.year === 2027);
    // AC: the birthed live series derives `pending` through the shipped helper.
    const phaseOf = (row?: CurrentSeriesRow) =>
      deriveSeriesPhase({
        winner_team_id: row?.winner_team_id ?? null,
        series_game_scores: (row?.scores ?? []).map((s) => ({ game_number: s.game_number })),
      } as SeriesPhaseInput);
    expect(phaseOf(live)).toBe('pending');
    // The 2016 birth carried exactly six rows; only the completion added the seventh.
    expect(sink.births.find((b) => b.year === 2016)?.scores).toHaveLength(6);
    expect(phaseOf(finals)).toBe('archive');
    expect(out.lines.some((line) => line.startsWith('BIRTH'))).toBe(true);
    // The 2016 row is written as birth-then-completion because the CSV
    // supplies it already finished; the live 3-3 is a bare birth.
    expect(out.lines.join('\n')).toMatch(/immediately followed by the completion/);
  });

  it('re-running identical input plans nothing and issues zero writes', async () => {
    const sink = new FakeSink();
    expect(await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture })).toBe(0);
    const birthsAfterRunOne = sink.births.length;
    const completionsAfterRunOne = sink.completions.length;
    const out = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture, log: out.log });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(birthsAfterRunOne);
    expect(sink.completions).toHaveLength(completionsAfterRunOne);
    expect(out.lines.some((line) => line.startsWith('SKIP'))).toBe(true);
    expect(out.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 2 skip\(s\)/);
  });

  it('--dry-run prints the plan and the sink records zero write calls', async () => {
    const sink = new FakeSink();
    const out = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--dry-run'],
      createSink: () => sink,
      readFile: fixture,
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
    expect(sink.current).toHaveLength(0);
    const text = out.lines.join('\n');
    expect(text).toMatch(/BIRTH/);
    expect(text).toMatch(/plan: 2 birth\(s\), 0 completion\(s\), 0 skip\(s\)/);
    // 6 + 7 (the 2016 birth plus its follow-up game 7) + 6 = 13 score rows.
    expect(text).toMatch(/\(13 score row\(s\) planned\)/);
    expect(text).toMatch(/dry-run: 0 rows written/);
  });

  it('the committed operator file on its own plans zero writes — the offseason default is safe', async () => {
    const sink = new FakeSink();
    const out = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, log: out.log });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
    expect(out.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 0 skip\(s\)/);
  });

  it('an unrecognised flag refuses the run instead of silently applying writes', async () => {
    const sink = new FakeSink();
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--dry-run=true'],
      createSink: () => sink,
      readFile: fixture,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/unrecognised flag "--dry-run=true"/);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
  });

  it('--source= overrides SERIES_SOURCE, so a scheduled run cannot fall back to the floor silently', async () => {
    const sink = new FakeSink();
    const errors = capture();
    const code = await runPipeline({
      env: envWith({ SERIES_SOURCE: 'manual_csv' }),
      argv: ['--source=fantrax'],
      createSink: () => sink,
      readFile: fixture,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/SERIES_SOURCE="fantrax" is a recognised adapter but is not implemented/);
    expect(sink.births).toHaveLength(0);
  });

  it('an empty SERIES_SOURCE means unset: the manual_csv floor is used', async () => {
    const sink = new FakeSink();
    const out = capture();
    const code = await runPipeline({
      env: envWith({ SERIES_SOURCE: '' }),
      argv: ['--dry-run'],
      createSink: () => sink,
      readFile: fixture,
      log: out.log,
    });
    expect(code).toBe(0);
    expect(out.lines.join('\n')).toMatch(/pipeline adapter=manual_csv/);
  });

  it('a finished series that went 4-2 through six is refused before a single write', async () => {
    // The rule `pipeline_birth_series` asserts; the plan asserts it first, so
    // the run cannot fail mid-apply after earlier operations have landed.
    const sink = new FakeSink();
    const errors = capture();
    const skewed = FIXTURE_CSV.replace(
      '2016,NBA Finals,6,CLE,GSW,115,103',
      '2016,NBA Finals,6,CLE,GSW,98,115',
    );
    const code = await runPipeline({
      env: envWith(),
      argv: [],
      createSink: () => sink,
      readFile: () => skewed,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/went 4-2 through six/);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
  });

  it('a rejected write exits non-zero with the sink error surfaced', async () => {
    const sink = new FakeSink();
    sink.failNextBirth = new Error('pipeline_birth_series failed: not a certified 3-3');
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: [],
      createSink: () => sink,
      readFile: fixture,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/not a certified 3-3/);
  });
});

describe('runPipeline — refusal rows of the matrix', () => {
  it('SERIES_SOURCE naming an unimplemented adapter refuses the start and never falls back', async () => {
    // Story 2.4 implemented `nba_com`, so `fantrax` carries the recognised-
    // but-unimplemented slot — with its rejection recorded, not a silence.
    let sinkBuilt = false;
    const errors = capture();
    const code = await runPipeline({
      env: envWith({ SERIES_SOURCE: 'fantrax' }),
      argv: [],
      createSink: () => {
        sinkBuilt = true;
        return new FakeSink();
      },
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toMatch(/fantrax.*is a recognised adapter but is not implemented/s);
    expect(text).toMatch(/rejected by the Story 2\.1 spike/);
    expect(sinkBuilt).toBe(false);
  });

  it('nba_com is now implemented: selection passes and the CSV-only floor stays default', async () => {
    // The registry flip itself — no refusal at selection; the run proceeds to
    // the env check with `nba_com` accepted (Story 2.4, Decision 7).
    const errors = capture();
    const code = await runPipeline({
      env: {},
      argv: ['--source=nba_com'],
      createSink: () => new FakeSink(),
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).not.toMatch(/not implemented/);
    expect(text).toMatch(/SUPABASE_URL/);
  });

  it('an unknown adapter name is rejected against the registry', async () => {
    const errors = capture();
    const code = await runPipeline({
      env: envWith({ SERIES_SOURCE: 'quantum_feed' }),
      argv: [],
      createSink: () => new FakeSink(),
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/not a recognised adapter/);
  });

  it('a missing service-role variable refuses the start, naming the variable — not any value', async () => {
    const errors = capture();
    const code = await runPipeline({
      env: { SUPABASE_URL: VALID_ENV.SUPABASE_URL },
      argv: [],
      createSink: () => new FakeSink(),
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(text).not.toMatch(/never-print-this/);
  });

  it('a missing SUPABASE_URL likewise refuses the start', async () => {
    const errors = capture();
    const code = await runPipeline({
      env: { SUPABASE_SERVICE_ROLE_KEY: VALID_ENV.SUPABASE_SERVICE_ROLE_KEY },
      argv: [],
      createSink: () => new FakeSink(),
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/SUPABASE_URL/);
  });

  it('the runner reads the service-role env names, never an anon key or a VITE_* name', async () => {
    const errors = capture();
    const code = await runPipeline({
      env: { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key', SERIES_SOURCE: 'manual_csv' },
      argv: [],
      createSink: () => new FakeSink(),
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/SUPABASE_URL/);
  });

  it('an unknown team abbreviation in the CSV fails the plan naming the abbreviation and the row', async () => {
    const sink = new FakeSink();
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--csv=weird.csv'],
      createSink: () => sink,
      readFile: () => 'year,round,game_number,home_team,away_team,home_score,away_score\n2030,NBA Finals,1,XYZ,ABC,100,90\n',
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toMatch(/unknown team abbreviation "XYZ"/);
    expect(text).toMatch(/weird\.csv:2/);
    expect(sink.births).toHaveLength(0);
  });

  it('a slot-swapped row on the table exits non-zero having written nothing', async () => {
    const sink = new FakeSink();
    // The fixture says 2016 GSW(10) vs CLE(6); the table holds (2016, 6, 10).
    sink.current.push({
      id: 'swapped-row',
      year: 2016,
      team_a_id: 6,
      team_b_id: 10,
      winner_team_id: null,
      scores: [],
    });
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: [],
      createSink: () => sink,
      readFile: fixture,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/identity assertion failed/);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
  });
});
