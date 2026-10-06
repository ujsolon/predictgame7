// Story 2.3 — the runner end-to-end against a fake sink: no network is
// touched, and the fake records every call so "zero writes" is an assertion,
// not a hope. The fake also applies each operation to its in-memory rows, so
// re-runs and the derived phases of results are proven the way Story 2.2's
// read path sees them.
import { describe, expect, it } from 'vitest';
import { deriveSeriesPhase, type SeriesPhaseInput } from '../../src/lib/series-phase.ts';
import { runPipeline, SUPPORTED_FLAGS } from '../../supabase/scripts/pipeline/run.ts';
import { ADAPTER_REGISTRY, adapterHasRunReport, createAdapterSource } from '../../supabase/scripts/pipeline/port.ts';
import type { CurrentSeriesRow, PlannedBirth, PlannedCompletion } from '../../supabase/scripts/pipeline/plan.ts';
import type { InsightsRefreshCensus, PipelineSink, TeamRow } from '../../supabase/scripts/pipeline/writer.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Story 2.13 grows `TeamRow.espn_code`. Only `CLE` and `DEN` are filled, because
 * those two agreements are MEASURED (`payload-contract.md` "Team codes"). `GSW`
 * and `OKC` stay NULL rather than carrying a code this table does not need — the
 * full 30-franchise seed is `00018`'s and `espn-adapter.test.ts` audits it, and a
 * fixture code nobody read is the silent-mismatch failure finding 5 warns about.
 * This table serves the `manual_csv` cases and, since Story 2.16, the runner
 * cases that ride the `espn` feed: those use only `CLE` and `DEN`, the two
 * measured codes, so the `espn` resolver here never needs a code this table
 * leaves NULL. The adapter's own suite injects the table that holds the rest.
 */
const TEAMS: TeamRow[] = [
  { id: 10, abbreviation: 'GSW', espn_code: null },
  { id: 6, abbreviation: 'CLE', espn_code: 'CLE' },
  { id: 21, abbreviation: 'OKC', espn_code: null },
  { id: 8, abbreviation: 'DEN', espn_code: 'DEN' },
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
  /** Story 2.5: every sink method logs its name, so "never called" is an assertion on evidence that can fail (elicitation P6). */
  calls: string[] = [];
  refreshes: InsightsRefreshCensus[] = [];
  failNextRefresh: Error | null = null;
  /**
   * Story 2.14: fail the Nth call (1-based) of a write, so a test can let earlier
   * writes land first. `failNextBirth` fails the very first birth and cannot.
   */
  failBirthOn: { call: number; error: Error } | null = null;
  failCompleteOn: { call: number; error: Error } | null = null;
  /** A fixed census so the report line has a deterministic source to pin against. */
  refreshCensus: InsightsRefreshCensus = {
    total_game_sevens: 160,
    home_team_wins: 117,
    game_6_winners_won: 59,
    average_margin: 9.46,
  };

  async readTeams(): Promise<TeamRow[]> {
    this.calls.push('readTeams');
    return this.teams;
  }

  async readCurrent(): Promise<CurrentSeriesRow[]> {
    this.calls.push('readCurrent');
    return this.current.map((row) => ({ ...row, scores: [...row.scores] }));
  }

  async birth(birthOp: PlannedBirth): Promise<string> {
    this.calls.push('birth');
    if (this.failNextBirth) throw this.failNextBirth;
    if (this.failBirthOn && this.calls.filter((call) => call === 'birth').length === this.failBirthOn.call) {
      throw this.failBirthOn.error;
    }
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
    this.calls.push('complete');
    if (this.failCompleteOn && this.calls.filter((call) => call === 'complete').length === this.failCompleteOn.call) {
      throw this.failCompleteOn.error;
    }
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

  async refreshInsights(): Promise<InsightsRefreshCensus> {
    this.calls.push('refreshInsights');
    if (this.failNextRefresh) throw this.failNextRefresh;
    this.refreshes.push(this.refreshCensus);
    return this.refreshCensus;
  }
}

function envWith(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { ...VALID_ENV, ...extra };
}

function capture(): { lines: string[]; log: (line: string) => void } {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

/**
 * Story 2.16: the runner cases that used to ride the retired feed adapter now
 * ride `espn`, the scheduled source. One measured-shape scoreboard event
 * (`payload-contract.md`: `state`/`description`, `notes[0].headline`,
 * `competitors[].homeAway`/`score`/`team.abbreviation`) between two codes
 * `TEAMS` resolves. The decoy fields and the edge rows of the shape belong to
 * `espn-adapter.test.ts`; these cases are about the runner, not the parse.
 */
function espnEvent(headline: string, home = 'CLE', away = 'DEN'): Record<string, unknown> {
  const side = (code: string, homeAway: 'home' | 'away', score: number) => ({ homeAway, score, team: { abbreviation: code } });
  return {
    date: '2027-05-01T23:00Z',
    status: { type: { state: 'post', description: 'Final' } },
    competitions: [{ notes: [{ headline }], competitors: [side(home, 'home', 110), side(away, 'away', 100)] }],
  };
}
const espnBody = (events: Record<string, unknown>[] = []) => ({ events });
const stubFeed = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
/**
 * Story 2.13: the retry backoff wait is injected as a no-op. A body the adapter
 * cannot read is retried by design (three attempts, `[1000, 4000]` ms), and a
 * suite that waits on the real timers both costs five seconds per such case and
 * can pass by accident on a slow assertion. No test here depends on how long a
 * run waits — only on what it finally exits with.
 */
const noWait = async () => {};
/** A fixed run instant inside the playoff window; `espn` derives its one date from it. */
const runNow = () => new Date(Date.UTC(2027, 4, 2, 7, 30));
/** A file read is how a silent `manual_csv` fallback would show itself; these seams make it a red. */
const readFileMustNotRun = () => {
  throw new Error('test seam violated: a feed run read a file (a manual_csv fallback?)');
};

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
    // `fantrax` carries the recognised-but-unimplemented slot — with its
    // rejection recorded, not a silence.
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

  // Story 2.16 (2026-10-06): the stats.nba.com adapter is retired and its name
  // is an unrecognised adapter. These are the matrix's "retired source by flag"
  // and "retired source by env" rows: the start refuses before any credential
  // is read or sink opened, and — the env row's point — never falls back to the
  // manual_csv floor, which would read a file and plan from it while looking
  // healthy. The egress evidence that retired it stays in the docs, not here.
  it.each([
    ['by flag', ['--source=nba_com'], {}],
    ['by env', [], { SERIES_SOURCE: 'nba_com' }],
  ] as [string, string[], Record<string, string>][])(
    'the retired nba_com source refuses the start %s as an unrecognised adapter, never a fallback',
    async (_label, argv, env) => {
      let sinksOpened = 0;
      let filesRead = 0;
      const errors = capture();
      const code = await runPipeline({
        env: envWith(env),
        argv,
        createSink: () => {
          sinksOpened += 1;
          return new FakeSink();
        },
        readFile: () => {
          filesRead += 1;
          return FIXTURE_CSV;
        },
        fetch: () => {
          throw new Error('test seam violated: a retired source reached a feed');
        },
        logError: errors.log,
      });
      expect(code).toBe(2);
      const text = errors.lines.join('\n');
      expect(text).toMatch(/SERIES_SOURCE="nba_com" is not a recognised adapter\. Known adapters: espn, fantrax, manual_csv\./);
      expect(sinksOpened).toBe(0);
      expect(filesRead).toBe(0);
    },
  );

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

// Story 2.5 — the insights-cache refresh: the frozen trigger's rule is that
// only a run which filled a winner refreshes; U10's operator flag runs only
// the refresh. Every "did not run" claim below is asserted on the FakeSink
// call log (elicitation P6), never on an unasserted absence.
describe('runPipeline — Story 2.5 insights cache refresh', () => {
  /** The fixture minus the finished 2016 series: one bare birth at 3–3, no winner filled. */
  const pendingOnlyCsv = () => FIXTURE_CSV.split('\n').filter((line) => !line.startsWith('2016,')).join('\n');

  /** The adapter seam that must never be touched (U10's frozen I/O row). */
  const fetchMustNotRun = () => {
    throw new Error('test seam violated: the refresh path fetched an adapter feed');
  };

  it('a run that filled a winner refreshes exactly once, after every write', async () => {
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
    // The trigger's true branch really ran: the fixture's 2016 birth carries
    // its Game 7 follow-up, so a winner is filled.
    expect(sink.completions).toHaveLength(1);
    const refreshIndex = sink.calls.indexOf('refreshInsights');
    expect(refreshIndex).toBeGreaterThan(-1);
    expect(sink.calls.filter((call) => call === 'refreshInsights')).toHaveLength(1);
    // "after the write phase, never before": every write call precedes it,
    // and it is the very last sink action of the run.
    expect(sink.calls.slice(refreshIndex + 1)).toEqual([]);
    const writeCalls = sink.calls.filter((call) => call === 'birth' || call === 'complete');
    expect(writeCalls.length).toBeGreaterThan(0);
    expect(sink.calls.slice(0, refreshIndex)).toEqual(expect.arrayContaining(['birth', 'complete']));
    // The census line prints what the RPC returned — the report names the
    // population the server counted, not anything the client re-derived.
    expect(out.lines.join('\n')).toMatch(
      /insights cache refreshed: 3 keys rewritten over 160 NBA\/BAA Game 7\(s\) — home wins 117, game-6 winners won 59, average margin 9\.46/,
    );
  });

  it('the trigger\'s other disjunct — a completion with NO birth follow-up anywhere — refreshes too', async () => {
    // The frozen rule is `plan.completions.length > 0 || births.some(followup)`.
    // Every other fixture in this file reaches a winner through a birth that
    // carries its own Game 7, so deleting the completions disjunct left the
    // whole suite green. Here the 3–3 series is ALREADY on the table and the
    // CSV only supplies its Game 7: one completion, zero births, so this is the
    // only shape in which that disjunct is the live half of the trigger.
    const sink = new FakeSink();
    sink.current.push({
      id: 'pending-2027',
      year: 2027,
      team_a_id: 21, // OKC — game 1's home team, AD-5's slot convention
      team_b_id: 8, // DEN
      winner_team_id: null,
      scores: [
        { game_number: 1, home_team_id: 21, away_team_id: 8, home_score: 110, away_score: 102 },
        { game_number: 2, home_team_id: 21, away_team_id: 8, home_score: 104, away_score: 115 },
        { game_number: 3, home_team_id: 8, away_team_id: 21, home_score: 108, away_score: 99 },
        { game_number: 4, home_team_id: 8, away_team_id: 21, home_score: 101, away_score: 112 },
        { game_number: 5, home_team_id: 21, away_team_id: 8, home_score: 120, away_score: 110 },
        { game_number: 6, home_team_id: 8, away_team_id: 21, home_score: 98, away_score: 95 },
      ],
    });
    // The fixture's live 3–3 series plus its Game 7, and no finished 2016 row.
    const completesPending = () =>
      `${FIXTURE_CSV.split('\n')
        .filter((line) => !line.startsWith('2016,'))
        .join('\n')}\n2027,Western Conference First Round,7,OKC,DEN,112,105`;
    const out = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: [],
      createSink: () => sink,
      readFile: completesPending,
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(1);
    expect(out.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 1 completion\(s\), 0 skip\(s\)/);
    // Refresh fired, and it fired after the completion landed — the last sink
    // action of the run.
    expect(sink.calls).toEqual(['readTeams', 'readCurrent', 'complete', 'refreshInsights']);
    expect(sink.refreshes).toHaveLength(1);
    expect(out.lines.join('\n')).toMatch(/insights cache refreshed: 3 keys rewritten over 160 NBA\/BAA Game 7\(s\)/);
  });

  it('a run that filled no winner does not refresh at all (frozen trigger)', async () => {
    const sink = new FakeSink();
    const out = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: [],
      createSink: () => sink,
      readFile: pendingOnlyCsv,
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(1); // the bare 3–3 birth — no followup, no winner
    expect(sink.completions).toHaveLength(0);
    expect(sink.calls).not.toContain('refreshInsights');
    expect(sink.refreshes).toHaveLength(0);
    // The refresh line is only printed on the branch that refreshed — an
    // unconditional line here would be a false report about a run that did
    // nothing (Design Notes: "What the run's print can honestly say").
    expect(out.lines.join('\n')).not.toMatch(/insights cache refreshed/);
  });

  it('the idempotent second run (all skips) refreshes nothing', async () => {
    const sink = new FakeSink();
    expect(await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture })).toBe(0);
    expect(sink.calls.filter((call) => call === 'refreshInsights')).toHaveLength(1);
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture });
    expect(code).toBe(0);
    // Nothing was filled on the replay, so the trigger stays closed: still
    // exactly one refresh across both runs.
    expect(sink.calls.filter((call) => call === 'refreshInsights')).toHaveLength(1);
  });

  it('--dry-run issues zero writes, refresh included', async () => {
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
    expect(sink.calls).not.toContain('refreshInsights');
    expect(out.lines.join('\n')).not.toMatch(/insights cache refreshed/);
    expect(out.lines.join('\n')).toMatch(/dry-run: 0 rows written/);
  });

  it('a refresh failure after landed writes exits 2 naming the step — success cannot be reported', async () => {
    const sink = new FakeSink();
    sink.failNextRefresh = new Error('pipeline_refresh_insights_cache failed: connection reset');
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: [],
      createSink: () => sink,
      readFile: fixture,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/pipeline_refresh_insights_cache failed/);
    // The series writes stayed landed (a PostgREST client cannot roll them
    // back) — the frozen matrix row's state, asserted, not assumed.
    expect(sink.births).toHaveLength(2);
    expect(sink.completions).toHaveLength(1);
    // The trigger is one-shot, so the message must carry the recovery: a
    // re-run of the same input plans skips and does not refresh.
    expect(errors.lines.join('\n')).toMatch(/a re-run will NOT retry this refresh; recover with .*--refresh-insights/);
    const rerun = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture });
    expect(rerun).toBe(0);
    expect(sink.refreshes).toHaveLength(0);
  });

  it('U10: --refresh-insights is recognised, refreshes, and touches nothing else', async () => {
    const sink = new FakeSink();
    const out = capture();
    let readFileCalled = false;
    const code = await runPipeline({
      env: envWith(),
      argv: ['--refresh-insights'],
      createSink: () => sink,
      readFile: () => {
        readFileCalled = true;
        return fixture();
      },
      // The adapter fetch seam throws if invoked (elicitation P6): "no
      // adapter fetched" is asserted on evidence that can fail.
      fetch: fetchMustNotRun,
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.calls).toEqual(['refreshInsights']);
    expect(sink.calls).not.toContain('readTeams');
    expect(sink.calls).not.toContain('readCurrent');
    expect(sink.calls).not.toContain('birth');
    expect(sink.calls).not.toContain('complete');
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
    expect(readFileCalled).toBe(false);
    expect(out.lines.join('\n')).toMatch(/insights cache refreshed: 3 keys rewritten over 160 NBA\/BAA Game 7\(s\)/);
    // No adapter rows were read, so no plan or write lines printed either.
    expect(out.lines.join('\n')).not.toMatch(/BIRTH|COMPLETE|SKIP|plan:/);
  });

  it('U10: the flag bypasses adapter selection — it works with the default, with --source=espn, and with an unimplemented SERIES_SOURCE alike', async () => {
    // The third case is the one that pins the bypass: the short-circuit needs
    // only the sink, so a `SERIES_SOURCE` naming a recognised-but-unimplemented
    // adapter cannot refuse an adapter-free refresh (and cannot reach
    // `assertAdapterImplemented`, which validates a selection this path never
    // makes).
    for (const [argv, env] of [
      [['--refresh-insights'], envWith()],
      [['--refresh-insights', '--source=espn'], envWith()],
      [['--refresh-insights'], envWith({ SERIES_SOURCE: 'fantrax' })],
    ] as [string[], Record<string, string | undefined>][]) {
      const sink = new FakeSink();
      const errors = capture();
      const code = await runPipeline({
        env,
        argv,
        createSink: () => sink,
        fetch: fetchMustNotRun,
        logError: errors.log,
      });
      expect(code).toBe(0);
      expect(errors.lines.join('')).toBe('');
      expect(sink.calls).toEqual(['refreshInsights']);
    }
  });

  it('U10: --refresh-insights refuses a scoping flag instead of silently discarding it', async () => {
    // `--csv=` parses fine on this path and narrows nothing: the refresh reads
    // no source file. Silently dropping it is the exact mistake the
    // ADAPTER_FLAGS block refuses for a mismatched adapter, so it is refused by
    // name — and asserted refused on the sink's call log too, because a refusal
    // that still refreshed would pass a message-only check. (Story 2.16 removed
    // the `--season=` row with the flag; a retired flag on this path is an
    // unrecognised flag, pinned in the Story 2.16 block below.)
    for (const [name, flag, env] of [
      ['csv', '--csv=operator.csv', envWith({ SERIES_SOURCE: 'manual_csv' })],
    ] as [string, string, Record<string, string | undefined>][]) {
      const sink = new FakeSink();
      const errors = capture();
      const code = await runPipeline({
        env,
        argv: ['--refresh-insights', flag],
        createSink: () => sink,
        readFile: () => {
          throw new Error('test seam violated: a refused flag still read a file');
        },
        fetch: fetchMustNotRun,
        logError: errors.log,
      });
      expect(code).toBe(2);
      expect(errors.lines.join('\n')).toMatch(new RegExp(`--refresh-insights cannot be combined with --${name}=`));
      expect(errors.lines.join('\n')).toMatch(/selects no adapter/);
      expect(sink.calls).not.toContain('refreshInsights');
      expect(sink.refreshes).toHaveLength(0);
    }
  });

  it('U10: --refresh-insights with --dry-run is refused by validation before any credential or client', async () => {
    let sinkBuilt = false;
    const errors = capture();
    // No credentials in env at all: if the refusal did not come first, the
    // run would fail on SUPABASE_URL instead of on the flag conflict — the
    // message below is what proves the refusal sits ahead of the secrets.
    const code = await runPipeline({
      env: {},
      argv: ['--refresh-insights', '--dry-run'],
      createSink: () => {
        sinkBuilt = true;
        return new FakeSink();
      },
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toMatch(/--refresh-insights cannot be combined with --dry-run/);
    expect(text).toMatch(/dry-run promises zero writes/);
    expect(text).not.toMatch(/SUPABASE_URL|SERVICE_ROLE/);
    expect(sinkBuilt).toBe(false);
  });

  it('a typo of the operator flag still refuses the run (the allowlist literal stays closed)', async () => {
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--refresh-insight'],
      createSink: () => new FakeSink(),
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/unrecognised flag "--refresh-insight"/);
    expect(errors.lines.join('\n')).toMatch(/--refresh-insights/);
  });

  it('matrix "Run aborts before writes": a plan abort never reaches the refresh', async () => {
    // The abort is Story 2.4's slot-swap identity assertion, which fires while
    // planning, before any write. The refresh must not run off a run that
    // failed: its trigger is a winner this run filled, and it filled none.
    const sink = new FakeSink();
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
    expect(sink.calls).not.toContain('refreshInsights');
    expect(sink.refreshes).toHaveLength(0);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
  });

  it('matrix "Flag refresh fails": a failing operator refresh exits 2 and stays the only call', async () => {
    // The I/O row's point: the absence of series writes is the state, not a
    // mitigating factor — a refresh that failed must not report success just
    // because nothing else was at risk.
    const sink = new FakeSink();
    sink.failNextRefresh = new Error('pipeline_refresh_insights_cache failed: connection reset');
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--refresh-insights'],
      createSink: () => sink,
      fetch: fetchMustNotRun,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(sink.calls).toEqual(['refreshInsights']);
    expect(sink.refreshes).toHaveLength(0);
    expect(errors.lines.join('\n')).toMatch(/pipeline_refresh_insights_cache failed/);
  });
});

// Story 2.6 — `--require-feed`: the empty-feed alarm. The asymmetry the flag
// exists to keep is that an empty PLAN is legitimate (a day with no completed
// games) while an empty FEED inside the playoff window is the anomaly, and the
// runner must stay date-blind — so the flag is the only thing that decides
// which case a run is in. Every "did not write" claim below is asserted on the
// FakeSink call log, the way Story 2.5's rows are.
describe('runPipeline — Story 2.6 --require-feed', () => {
  // Story 2.16 (2026-10-06): this block was built on the retired feed adapter's
  // `resultSets` body and now rides `espn`, the scheduled source. Its red,
  // green and one-series cases were deleted rather than re-pointed, because
  // `espn-adapter.test.ts` already holds their twins: "a rest day under
  // --require-feed is red naming the adapter, and green without the flag" (the
  // red and green halves) and "a feed whose every game is excluded is still a
  // non-zero feed: the alarm passes" (the one-series case). The dry-run alarm
  // below had no twin, so it was re-parented onto `espn` here.
  /** The manual_csv floor with no data rows at all — the floor's own "empty feed". */
  const headerOnlyCsv = () => 'year,round,game_number,home_team,away_team,home_score,away_score';

  const runOver = async (
    sink: FakeSink,
    argv: string[],
    opts: { body?: unknown; readFile?: () => string } = {},
  ) => {
    const out = capture();
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv,
      createSink: () => sink,
      fetch: stubFeed(opts.body ?? espnBody()),
      sleep: noWait,
      now: runNow,
      readFile: opts.readFile ?? headerOnlyCsv,
      log: out.log,
      logError: errors.log,
    });
    return { code, lines: out.lines.join('\n'), errors: errors.lines.join('\n') };
  };

  it('the flag refuses manual_csv before any client is built — with or without --source=', async () => {
    // `createSink` throwing is the credential-free evidence: the refusal must
    // reach the operator before `requiredEnv` runs, which is what makes this
    // path dispatchable and testable with no database to talk to.
    let sinkBuilds = 0;
    const buildMustNotRun = () => {
      sinkBuilds += 1;
      throw new Error('test seam violated: the run opened a sink before refusing the flag');
    };
    for (const argv of [['--source=manual_csv', '--require-feed'], ['--require-feed']]) {
      const errors = capture();
      const code = await runPipeline({
        env: {},
        argv,
        createSink: buildMustNotRun,
        readFile: fixture,
        logError: errors.log,
      });
      expect(code).toBe(2);
      expect(errors.lines.join('\n')).toMatch(
        /--require-feed does not apply to adapter "manual_csv" — the empty-feed alarm reads the adapter's run report/,
      );
    }
    expect(sinkBuilds).toBe(0);
  });

  it('the flag refuses the operator refresh, which reads the archive and fetches no feed', async () => {
    let sinkBuilds = 0;
    const errors = capture();
    const code = await runPipeline({
      env: {},
      argv: ['--require-feed', '--refresh-insights'],
      createSink: () => {
        sinkBuilds += 1;
        throw new Error('test seam violated: the flag/refresh conflict built a client');
      },
      fetch: () => {
        throw new Error('test seam violated: the refresh path fetched a feed');
      },
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/--require-feed cannot be combined with --refresh-insights/);
    expect(sinkBuilds).toBe(0);
  });

  it('the alarm is a refusal, not a write: it is red under --dry-run too', async () => {
    // This is what gives the alarm a zero-write red in October instead of
    // April: dispatch the inseason workflow with dry_run and require_feed both
    // set and the schedule's own failure path is exercised without a bracket.
    // Re-parented onto `espn` by Story 2.16: it is the scheduled source, and the
    // workflow's dispatch inputs are exactly `--source=espn --require-feed
    // --dry-run`. The report lines and the date the adapter derived print
    // BEFORE the red, so the Actions log diagnoses without a local repro.
    const sink = new FakeSink();
    const run = await runOver(sink, ['--source=espn', '--require-feed', '--dry-run']);
    expect(run.code).toBe(2);
    expect(run.errors).toMatch(/--require-feed: espn returned 0 series/);
    expect(run.lines).toMatch(/^espn: 0 series in feed \(dates=20270501\)/m);
    expect(run.lines).not.toMatch(/dry-run: 0 rows written/);
    // [Story 2.18: `readCurrent` now runs before the adapter is built (the
    // stored-pair check the espn backfill needs), so it precedes the red. Still
    // zero writes.]
    expect(sink.calls).toEqual(['readTeams', 'readCurrent']);
  });

  it('a near-miss typo of the flag is still refused, and the supported list names it', async () => {
    const sink = new FakeSink();
    const run = await runOver(sink, ['--requirefeed', '--source=espn']);
    expect(run.code).toBe(2);
    expect(run.errors).toMatch(/unrecognised flag "--requirefeed"/);
    expect(run.errors).toMatch(/--require-feed/);
    expect(sink.calls).toEqual([]);
  });

  // A per-test budget, not a global `testTimeout`: this case awaits one full
  // `runPipeline` run per implemented adapter in sequence (three when this was
  // measured, two since Story 2.16), and its own work is milliseconds (measured
  // 53-77ms), but the default 5s is a WALL-CLOCK budget that a contended machine
  // can blow without the test doing anything — a `npm run gate` under a loaded
  // pool starved it to 6520ms and killed the push, while every sibling in the
  // file stayed under 100ms. Raising the global ceiling would hide a real hang
  // everywhere to fix a measurement artifact here; running the suite with
  // `--no-file-parallelism` removes the contention at the cost of turning a
  // 13-second signal into minutes. Neither is worth it while one test is affected.
  it('no adapter can satisfy --require-feed vacuously', async () => {
    // The failure this pins is silent: if `hasRunReport` ever said true for an
    // adapter whose source declares no `describeRun`, the report block would
    // skip the check and a zero-row run would exit 0 while looking alarmed.
    // So the behavioural guard runs against every implemented adapter with its
    // own zero-row source.
    const implemented = Object.entries(ADAPTER_REGISTRY).filter(([, entry]) => entry.implemented);
    expect(implemented.map(([name]) => name).sort()).toEqual(['espn', 'manual_csv']);
    // Each adapter's OWN empty feed, so the red this pins is the empty-feed
    // alarm rather than an accidental shape error: `manual_csv` reads a header
    // only (`opts.readFile` above), and `espn` an `events` array with no games.
    const emptyBodyByAdapter: Record<string, unknown> = {
      espn: espnBody(),
    };
    for (const [name] of implemented) {
      const sink = new FakeSink();
      const run = await runOver(sink, [`--source=${name}`, '--require-feed'], { body: emptyBodyByAdapter[name] });
      expect(run.code, `--require-feed must never pass vacuously for ${name}`).toBe(2);
      // The red must be the alarm (or, for an adapter with no report, the
      // up-front refusal) — a shape error would also exit 2 and prove nothing.
      expect(run.errors).toMatch(
        adapterHasRunReport(name) ? new RegExp(`--require-feed: ${name} returned 0 series`) : /--require-feed does not apply/,
      );
      expect(sink.calls).not.toContain('birth');
      expect(sink.calls).not.toContain('complete');
    }
  }, 30_000);

  it('the registry declaration agrees with each adapter own members', async () => {
    for (const [name, entry] of Object.entries(ADAPTER_REGISTRY)) {
      if (!entry.implemented) continue;
      const source = createAdapterSource(name, {
        csvPath: 'whatever.csv',
        readFile: headerOnlyCsv,
        teamIdByAbbreviation: () => undefined,
        fetch: stubFeed(espnBody()),
        now: runNow,
      });
      expect(adapterHasRunReport(name), `ADAPTER_REGISTRY.hasRunReport drifted for ${name}`).toBe(source.describeRun !== undefined);
    }
    expect(adapterHasRunReport('fantrax')).toBe(false);
    expect(adapterHasRunReport('not_an_adapter')).toBe(false);
  });
});

// Story 2.14 — the Epic 2 retro's write-path findings (W3, W1), both observed by
// execution against an in-memory sink before this story existed.
describe('runPipeline — Story 2.14 runner hardening', () => {
  /** A stored pending 3–3 for (a, b) — team_a home in 1, 2, 5 — and the CSV lines that agree with it plus game 7. */
  function pendingPair(id: string, a: TeamRow, b: TeamRow): { row: CurrentSeriesRow; csv: string[] } {
    const games: [number, TeamRow, TeamRow, number, number][] = [
      [1, a, b, 110, 102],
      [2, a, b, 104, 115],
      [3, b, a, 108, 99],
      [4, b, a, 101, 112],
      [5, a, b, 120, 110],
      [6, b, a, 98, 95],
    ];
    return {
      row: {
        id,
        year: 2027,
        team_a_id: a.id,
        team_b_id: b.id,
        winner_team_id: null,
        scores: games.map(([game_number, home, away, home_score, away_score]) => ({
          game_number,
          home_team_id: home.id,
          away_team_id: away.id,
          home_score,
          away_score,
        })),
      },
      csv: [
        ...games.map(([n, home, away, hs, as]) => `2027,First Round,${n},${home.abbreviation},${away.abbreviation},${hs},${as}`),
        `2027,First Round,7,${a.abbreviation},${b.abbreviation},112,105`,
      ],
    };
  }

  const [GSW, CLE, OKC, DEN] = TEAMS;

  /** Two stored pending series whose Game 7s both arrive in one run: two completions, in CSV order. */
  function twoGameSevens(sink: FakeSink): () => string {
    const first = pendingPair('pending-okc-den', OKC, DEN);
    const second = pendingPair('pending-gsw-cle', GSW, CLE);
    sink.current.push(first.row, second.row);
    const csv = ['year,round,game_number,home_team,away_team,home_score,away_score', ...first.csv, ...second.csv].join('\n');
    return () => csv;
  }

  it.each([
    ['-dry-run', 'single dash'],
    ['dry-run', 'positional, no dash'],
    ['—dry-run', 'em-dash pasted from a doc'],
    ['', 'empty string'],
    ['--', 'bare double dash'],
    ['--source=', 'value flag with no value'],
    ['--source= espn', 'value starting with whitespace'],
  ])('refuses %j (%s) with exit 2, names it, and never opens a sink', async (token) => {
    let sinksOpened = 0;
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--source=manual_csv', token],
      createSink: () => {
        sinksOpened += 1;
        return new FakeSink();
      },
      readFile: fixture,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toContain(`unrecognised flag "${token}"`);
    expect(sinksOpened).toBe(0);
  });

  it('the help text is generated from the one supported-flag list', async () => {
    const errors = capture();
    expect(await runPipeline({ env: envWith(), argv: ['-n'], createSink: () => new FakeSink(), logError: errors.log })).toBe(2);
    const text = errors.lines.join('\n');
    expect(SUPPORTED_FLAGS.length).toBeGreaterThan(0);
    for (const flag of SUPPORTED_FLAGS) {
      expect(text).toContain(flag.usage);
      if (flag.note) expect(text).toContain(flag.note);
    }
  });

  it('a completion rejected after another landed: refreshes over the landed winner, then exits 2 naming the failure', async () => {
    const sink = new FakeSink();
    const readFile = twoGameSevens(sink);
    sink.failCompleteOn = { call: 2, error: new Error('pipeline_complete_series failed: simulated rejection') };
    const out = capture();
    const errors = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile, log: out.log, logError: errors.log });
    expect(code).toBe(2);
    expect(sink.completions.map((c) => c.series_id)).toEqual(['pending-okc-den']);
    expect(sink.calls).toEqual(['readTeams', 'readCurrent', 'complete', 'complete', 'refreshInsights']);
    expect(out.lines.join('\n')).toMatch(/insights cache refreshed: 3 keys rewritten over 160/);
    const message = errors.lines.join('\n');
    expect(message).toMatch(/pipeline_complete_series failed: simulated rejection/);
    expect(message).toMatch(/1 winner\(s\) landed in this run before that failure; the insights cache was refreshed/);
  });

  it('the same failure when the refresh fails too: exit 2 carrying the --refresh-insights recovery', async () => {
    const sink = new FakeSink();
    const readFile = twoGameSevens(sink);
    sink.failCompleteOn = { call: 2, error: new Error('pipeline_complete_series failed: simulated rejection') };
    sink.failNextRefresh = new Error('pipeline_refresh_insights_cache failed: connection reset');
    const out = capture();
    const errors = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile, log: out.log, logError: errors.log });
    expect(code).toBe(2);
    expect(sink.completions.map((c) => c.series_id)).toEqual(['pending-okc-den']);
    expect(sink.calls).toEqual(['readTeams', 'readCurrent', 'complete', 'complete', 'refreshInsights']);
    expect(out.lines.join('\n')).not.toMatch(/insights cache refreshed/);
    const message = errors.lines.join('\n');
    expect(message).not.toMatch(/the insights cache was refreshed/);
    expect(message).toMatch(/pipeline_complete_series failed: simulated rejection/);
    expect(message).toMatch(/pipeline_refresh_insights_cache failed: connection reset/);
    expect(message).toMatch(/a re-run will NOT retry this refresh; recover with .*--refresh-insights/);
  });

  it('a birth rejected after a birth-with-follow-up landed a winner refreshes too', async () => {
    // The fixture writes the finished 2016 series first (birth + follow-up =
    // one winner), then the live 2027 birth — which is the one that fails.
    const sink = new FakeSink();
    sink.failBirthOn = { call: 2, error: new Error('pipeline_birth_series failed: simulated rejection') };
    const errors = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture, logError: errors.log });
    expect(code).toBe(2);
    expect(sink.calls).toEqual(['readTeams', 'readCurrent', 'birth', 'complete', 'birth', 'refreshInsights']);
    expect(errors.lines.join('\n')).toMatch(/pipeline_birth_series failed: simulated rejection — 1 winner\(s\) landed/);
  });

  it('a follow-up completion rejected after an earlier follow-up landed a winner refreshes too', async () => {
    // Both CSV series arrive finished, so each birth carries a follow-up: the
    // 2016 one lands a winner, the 2027 one is the follow-up that fails.
    const sink = new FakeSink();
    sink.failCompleteOn = { call: 2, error: new Error('pipeline_complete_series failed: simulated rejection') };
    const bothFinished = () => `${FIXTURE_CSV}\n2027,Western Conference First Round,7,OKC,DEN,112,105`;
    const errors = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: bothFinished, logError: errors.log });
    expect(code).toBe(2);
    expect(sink.calls).toEqual(['readTeams', 'readCurrent', 'birth', 'complete', 'birth', 'complete', 'refreshInsights']);
    expect(sink.completions).toHaveLength(1);
    expect(errors.lines.join('\n')).toMatch(
      /simulated rejection — 1 winner\(s\) landed in this run before that failure; the insights cache was refreshed/,
    );
  });

  it('a failure before any winner landed is unchanged: no refresh, the bare error', async () => {
    // The first write is the 2016 birth's follow-up completion failing: the
    // birth landed, but no winner did.
    const sink = new FakeSink();
    sink.failCompleteOn = { call: 1, error: new Error('pipeline_complete_series failed: simulated rejection') };
    const errors = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture, logError: errors.log });
    expect(code).toBe(2);
    expect(sink.calls).not.toContain('refreshInsights');
    expect(errors.lines).toEqual(['pipeline failed: pipeline_complete_series failed: simulated rejection']);
  });

  it('the operator usage header names every implemented adapter (retro W4)', () => {
    // W4 is a comment, so there is no runtime to exercise — the pin is the source
    // text, the shape `insights-refresh.test.ts` and `workflows.test.ts` already
    // use. The expected names come from `ADAPTER_REGISTRY` because that is the
    // live list: an adapter added without a usage line reds here, which is the
    // only gate that can see the omission this story was raised for.
    const runnerSource = readFileSync(
      fileURLToPath(new URL('../../supabase/scripts/pipeline/run.ts', import.meta.url)),
      'utf8',
    );
    const implemented = Object.keys(ADAPTER_REGISTRY).filter((name) => ADAPTER_REGISTRY[name].implemented);
    expect(implemented.length).toBeGreaterThan(0);
    for (const name of implemented) {
      expect(runnerSource).toContain(`run.ts --source=${name} --dry-run`);
    }
    // W4's own fact, which the loop above cannot state: the header says WHICH of
    // these the schedule runs.
    expect(runnerSource).toMatch(/--source=espn --dry-run\s+\(the scheduled source\)/);
  });
});

// Story 2.16 — the runner guarantees the retired feed adapter's suite was the
// only one to pin. Each is about the RUNNER, not about a feed, so each lands
// here on the scheduled `espn` source (or on `manual_csv` where the guarantee is
// the floor's); the spec's Implementation Notes name the original each replaces
// and the mutation that turns it red. The retired `--season=` flag's refusal
// pin sits here too; the retired source's refusal pins sit with the other
// refusal rows above.
describe('runPipeline — Story 2.16 runner guarantees re-parented from the retired adapter suite', () => {
  const runEspn = async (
    argv: string[],
    opts: { env?: Record<string, string | undefined>; fetch?: Parameters<typeof runPipeline>[0]['fetch']; body?: unknown } = {},
  ) => {
    const sink = new FakeSink();
    const out = capture();
    const errors = capture();
    const code = await runPipeline({
      env: opts.env ?? envWith(),
      argv,
      createSink: () => sink,
      fetch: opts.fetch ?? stubFeed(opts.body ?? espnBody()),
      sleep: noWait,
      now: runNow,
      readFile: readFileMustNotRun,
      log: out.log,
      logError: errors.log,
    });
    return { code, sink, lines: out.lines, errors: errors.lines.join('\n') };
  };

  it('exclusion notes reach stdout through the runner, after the report and before the plan', async () => {
    const run = await runEspn(['--source=espn'], { body: espnBody([espnEvent('West 1st Round - Game 2')]) });
    expect(run.code).toBe(0);
    const noteIndex = run.lines.findIndex((line) => /^espn: excluded .*game 2 of 7/.test(line));
    const countsIndex = run.lines.findIndex((line) => line.startsWith('espn: 1 series in feed'));
    const planIndex = run.lines.findIndex((line) => line.startsWith('plan:'));
    expect(noteIndex).toBeGreaterThan(countsIndex);
    expect(countsIndex).toBeGreaterThanOrEqual(0);
    expect(planIndex).toBeGreaterThan(noteIndex);
  });

  it('a feed that fails every attempt exits 2 through the runner, naming URL + status, writing nothing, no fallback', async () => {
    const urls: string[] = [];
    const failing = async (url: string) => {
      urls.push(url);
      return { ok: false, status: 503, json: async () => undefined };
    };
    const run = await runEspn(['--source=espn'], { fetch: failing });
    expect(run.code).toBe(2);
    expect(urls).toHaveLength(3);
    expect(run.errors).toContain(urls[0]);
    expect(run.errors).toMatch(/failed after 3 attempt\(s\): HTTP 503/);
    expect(run.errors).toMatch(/no manual_csv fallback was taken/);
    // `readFile` throws in this harness, so a manual_csv fallback could not run
    // silently either: the only sink calls are the two reads that precede the
    // feed. [Story 2.18: `readCurrent` moved ahead of the adapter.]
    expect(run.sink.calls).toEqual(['readTeams', 'readCurrent']);
  });

  it('feed shape drift aborts the run through the runner: exit 2, the drift named, zero writes', async () => {
    const run = await runEspn(['--source=espn'], { body: { leagues: [] } });
    expect(run.code).toBe(2);
    // The drift's own wording, reached after the full retry budget — not merely any message naming `events`.
    expect(run.errors).toMatch(/failed after 3 attempt\(s\): response body carries no `events` array — not the scoreboard shape/);
    expect(run.errors).toMatch(/no manual_csv fallback was taken/);
    // [Story 2.18: `readCurrent` moved ahead of the adapter; still no write.]
    expect(run.sink.calls).toEqual(['readTeams', 'readCurrent']);
  });

  it('SERIES_SOURCE selects a feed adapter end to end, not just past the registry check', async () => {
    const run = await runEspn([], { env: envWith({ SERIES_SOURCE: 'espn' }), body: espnBody([espnEvent('West 1st Round - Game 2')]) });
    expect(run.code).toBe(0);
    const text = run.lines.join('\n');
    expect(text).toMatch(/^espn: 1 series in feed/m);
    expect(text).toMatch(/pipeline adapter=espn/);
  });

  it('a duplicate --csv= refuses the run instead of silently taking the first value', async () => {
    let sinksOpened = 0;
    let filesRead = 0;
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: ['--source=manual_csv', '--csv=first.csv', '--csv=second.csv'],
      createSink: () => {
        sinksOpened += 1;
        return new FakeSink();
      },
      readFile: () => {
        filesRead += 1;
        return FIXTURE_CSV;
      },
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/duplicate --csv= flag \(2 given: first\.csv, second\.csv\)/);
    expect(sinksOpened).toBe(0);
    expect(filesRead).toBe(0);
  });

  // The matrix's "retired flag" row: `--season=` retired with its only adapter,
  // so it is no longer a flag every adapter rejects but a token outside
  // `SUPPORTED_FLAGS`, refused before any sink, file or feed is touched —
  // whatever source the run names, and on the refresh path too.
  it.each([
    ['no source', []],
    ['manual_csv', ['--source=manual_csv']],
    ['espn', ['--source=espn']],
    ['the operator refresh', ['--refresh-insights']],
  ] as [string, string[]][])('--season=2025-26 with %s is refused as an unrecognised flag, naming the token', async (_label, argv) => {
    let sinksOpened = 0;
    const errors = capture();
    const code = await runPipeline({
      env: envWith(),
      argv: [...argv, '--season=2025-26'],
      createSink: () => {
        sinksOpened += 1;
        return new FakeSink();
      },
      readFile: readFileMustNotRun,
      fetch: () => {
        throw new Error('test seam violated: a refused flag reached a feed');
      },
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toContain('unrecognised flag "--season=2025-26"');
    expect(text).not.toMatch(/--season=<YYYY-YY>/);
    expect(sinksOpened).toBe(0);
  });

  it('manual_csv still works, still defaults, and reports nothing extra', async () => {
    const sink = new FakeSink();
    const out = capture();
    const code = await runPipeline({ env: envWith(), argv: [], createSink: () => sink, readFile: fixture, log: out.log });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(2);
    const text = out.lines.join('\n');
    expect(text).toMatch(/pipeline adapter=manual_csv/);
    expect(text).not.toMatch(/series in feed/);
    expect(text).not.toMatch(/depth histogram/);
    expect(text).not.toMatch(/excluded/);
  });
});
