/**
 * Story 2.6 — the CI surface this repo has never been able to check.
 *
 * Nothing in `npm run gate` reads `.github/**`: Biome's `files.includes` covers
 * `src`, `supabase/functions`, `supabase/scripts` and `tests` only, and no
 * actionlint or yamllint exists here. So every cron line, alarm flag, permission
 * and secret reference Story 2.6 adds would otherwise be an advisory step that
 * cannot go red — the exact class of silent gap this story was created to end.
 *
 * This file parses the real YAML and pins the decided shape, so a later edit
 * that drops `--require-feed`, widens a permission, adds a fourth date
 * expression, or points a job at the linked project fails locally on `npm test`
 * instead of surprising the owner in April.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { BIRTH_NEEDED_PREFIX } from '../../supabase/scripts/pipeline/run.ts';

interface Step {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  shell?: string;
  'timeout-minutes'?: number;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface WorkflowDoc {
  name: string;
  /**
   * js-yaml 4 follows the YAML 1.2 core schema, where the bare `on:` key stays
   * the string "on" instead of resolving to `true` the way a YAML 1.1 reader
   * would. `docOf` asserts the key is present either way, so a parser swap
   * cannot silently read as "no triggers".
   */
  on: Triggers;
  concurrency?: { group: string; 'cancel-in-progress'?: boolean };
  permissions?: Record<string, string>;
  jobs: Record<string, { 'runs-on'?: string; 'timeout-minutes'?: number; steps: Step[] }>;
}

interface Triggers {
  schedule?: { cron: string }[];
  workflow_dispatch?: { inputs?: Record<string, { type?: string; default?: unknown; options?: string[] }> } | null;
  push?: { branches?: string[]; paths?: string[] };
  pull_request?: { paths?: string[] };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = (name: string) => join('.github', 'workflows', `${name}.yml`);
const INSEASON = workflow('pipeline-inseason');
const OFFSEASON = workflow('pipeline-offseason');
const REHEARSAL = workflow('migration-rehearsal');
const NIGHTLY = workflow('nightly-gate');
const KEEPALIVE = workflow('keepalive');
const CI = workflow('ci');
const ACTION = join('.github', 'actions', 'notify-failure', 'action.yml');

/** CRLF-normalized: `core.autocrlf=true` and no `*.yml` rule in .gitattributes. */
const textOf = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const docOf = (rel: string): WorkflowDoc => {
  const doc = load(textOf(rel)) as unknown as WorkflowDoc & Record<string, unknown>;
  expect(doc, `${rel} parses as a YAML mapping`).toBeTruthy();
  expect(doc.on ?? (doc as Record<string, unknown>).true, `${rel} declares its triggers`).toBeTruthy();
  return doc;
};
const triggersOf = (rel: string) => (docOf(rel).on ?? (docOf(rel) as unknown as Record<string, unknown>).true) as Triggers;
const stepsOf = (rel: string) => Object.values(docOf(rel).jobs).flatMap((job) => job.steps);
const cronsOf = (rel: string) => (triggersOf(rel).schedule ?? []).map((entry) => entry.cron);
const notifyStepOf = (rel: string) => stepsOf(rel).find((step) => (step.uses ?? '').includes('notify-failure'));

describe('the .github surface exists and parses', () => {
  it('the workflow set is the three shipped files plus Story 2.6 three', () => {
    expect(readdirSync(join(repoRoot, '.github', 'workflows')).sort()).toEqual([
      'ci.yml',
      'keepalive.yml',
      'migration-rehearsal.yml',
      'nightly-gate.yml',
      'pipeline-inseason.yml',
      'pipeline-offseason.yml',
    ]);
  });

  it('every workflow and the composite action parse', () => {
    for (const rel of readdirSync(join(repoRoot, '.github', 'workflows')).map((file) => workflow(file.replace(/\.yml$/, '')))) {
      expect(stepsOf(rel).length, `${rel} has steps`).toBeGreaterThan(0);
    }
    const action = load(textOf(ACTION)) as { name: string; description: string; runs: { using: string; steps: Step[] }; inputs: Record<string, { required?: boolean }> };
    expect(action.runs.using).toBe('composite');
    expect(Object.keys(action.inputs).sort()).toEqual(['body', 'title']);
  });
});

describe('pipeline-inseason.yml — the daily cadence (FR-21) and the alarm (CAP-6)', () => {
  it('carries the playoff bracket as three cron lines, in D-5 order, at 07:30 UTC', () => {
    // A cron day-of-month range cannot express mid-April through June in one
    // line; these three ARE the single date expression of the whole design.
    // Pin the exact list: a fourth line, or a minute that moves onto the
    // 07:00 keepalive, is a decision and not a typo to be fixed silently.
    // The pair sat at 09:00/09:30 until the owner's 2026-10-04 call moved it:
    // ESPN filters its scoreboard by US local date, so the run has to land
    // after the latest tip-off has become yesterday in America/New_York.
    // June ends on the 24th (owner call 2026-10-05, review #39): a one-date
    // source reads an empty feed every day after the Finals, so a June 30 end
    // filed a run of reds that would bury a real failure.
    expect(cronsOf(INSEASON)).toEqual(['30 7 16-30 4 *', '30 7 * 5 *', '30 7 1-24 6 *']);
  });

  it('declares the empty-feed alarm itself, so the runner stays date-blind', () => {
    const run = stepsOf(INSEASON).find((step) => step.name === 'Run the pipeline');
    expect(run?.run).toContain('--require-feed');
    expect(run?.run).toContain('supabase/scripts/pipeline/run.ts');
    // The flag comes from this file, never from a default: `schedule` always
    // alarms, a dispatch only when the operator asks it to.
    expect(run?.env?.WANT_REQUIRE_FEED).toBe("${{ github.event_name == 'schedule' || inputs.require_feed }}");
    // …and the bash has to READ that variable. Pinning only the env expression
    // would stay green if the script stopped consulting it — either by renaming
    // or by making the flag unconditional — and both edits silently move the
    // schedule-vs-dispatch rule back into the runner, which the design forbids.
    expect(run?.run).toContain('"$WANT_REQUIRE_FEED"');
    // …and compare it to the literal "true": a dispatch sends the string
    // "false", so a `-n` test would alarm on every hand dispatch.
    expect(run?.run).toContain('[ "$WANT_REQUIRE_FEED" = "true" ]');
  });

  it("the SCHEDULED run has a source too — the `|| 'espn'` fallback is the cron's only one", () => {
    // `inputs.source` exists only for `workflow_dispatch`. On a schedule it is
    // empty, so the effective adapter is whatever the fallback names. Every
    // other pin in this file reads the choice list or the `default:` key, and
    // both stay green while the fallback drifts to `nba_com` — the host Story
    // 2.6 measured as refusing every cloud (and, since Story 2.16, a retired name
    // that refuses the start). That drift is what this pins shut.
    const run = stepsOf(INSEASON).find((step) => step.name === 'Run the pipeline');
    expect(run?.env?.PIPELINE_SOURCE).toBe("${{ inputs.source || 'espn' }}");
    // …and the bash has to USE it, as the one and only source on the command
    // line: a hardcoded literal alongside the variable would win or lose by
    // accident depending on which step the operator edited.
    const bash = (run?.run ?? '').replace(/"/g, '');
    expect(bash).toContain('--source=$PIPELINE_SOURCE');
    expect(bash.match(/--source=\S+/g)).toEqual(['--source=$PIPELINE_SOURCE']);
  });

  it('offers the dispatch inputs that make the alarm provable before April', () => {
    const inputs = triggersOf(INSEASON).workflow_dispatch?.inputs ?? {};
    expect(Object.keys(inputs).sort()).toEqual(['dry_run', 'require_feed', 'source']);
    expect(inputs.dry_run).toMatchObject({ type: 'boolean', default: false });
    expect(inputs.require_feed).toMatchObject({ type: 'boolean', default: false });
    // `fantrax` is a deliberate option: it is the recognised-but-unimplemented
    // name whose refusal is the zero-write failure the alarm is tested with.
    // `nba_com` is NOT offered: a hosted runner cannot reach nba.com (Story
    // 2.6's egress evidence), so the option could only ever go red (Story 2.13
    // review, owner call 2026-10-05). [2026-10-06, Story 2.16: the source is
    // retired — off `port.ts`'s registry too — so the name now refuses the start
    // as an unrecognised adapter; it stays un-offered here all the same.]
    expect(inputs.source).toMatchObject({
      type: 'choice',
      options: ['espn', 'manual_csv', 'fantrax'],
      default: 'espn',
    });
  });

  it('the alarm carries its own repair for a Game 7 the one-date source missed', () => {
    // `espn` never re-asks a date, so a red run the morning after a Game 7
    // loses that game from the automated path (owner call 2026-10-05, review
    // #39). The issue body is where the operator reads the recovery.
    // [Story 2.18: the re-read of the previous date is for births only and
    // ignores Game 7s (owner decision, Story 2.18 review), so this holds.]
    const body = String(notifyStepOf(INSEASON)?.with?.body ?? '');
    expect(body).toContain('MISSED GAME 7 RECOVERY');
    expect(body).toContain('supabase/scripts/pipeline/data/series_manual.csv');
    expect(body).toContain('--source=manual_csv --dry-run');
  });

  it('never exposes the operator-only insights refresh', () => {
    // U10 makes --refresh-insights a deliberate human action; a workflow input
    // would turn it into an automatic one. Parsed shape, same reason as above.
    for (const rel of [INSEASON, OFFSEASON]) {
      expect(Object.keys(triggersOf(rel).workflow_dispatch?.inputs ?? {}), rel).not.toContain('refresh_insights');
      expect(stepsOf(rel).map((step) => step.run ?? '').join('\n'), rel).not.toContain('refresh-insights');
    }
  });
});

describe('pipeline-offseason.yml — the bracket edges (FR-20)', () => {
  it('fires at the two edges, both outside the alarm window', () => {
    expect(cronsOf(OFFSEASON)).toEqual(['30 7 12 4 *', '30 7 25 6 *']);
    // "Outside" is a relation between two files, so it is pinned as one: no
    // offseason date may fall on a day the inseason file fires with the flag.
    const inseasonJuneEnd = Number(/^30 7 1-(\d+) 6 \*$/.exec(cronsOf(INSEASON)[2] ?? '')?.[1]);
    expect(inseasonJuneEnd).toBeLessThan(25);
    expect(cronsOf(INSEASON)[0]).toBe('30 7 16-30 4 *');
  });

  it('passes no empty-feed alarm anywhere in its parsed shape', () => {
    // The absence IS the decision: an empty feed in mid-April or late June is
    // legitimate, and alarming on it would train the owner to ignore the alarm
    // that matters. Asserted on the job and its dispatch inputs, so a stray
    // input cannot reintroduce it — and not on the file text, because this
    // file's header comment names the flag to explain why it is absent. Prose
    // naming a forbidden thing is not the forbidden thing.
    expect(Object.keys(triggersOf(OFFSEASON).workflow_dispatch?.inputs ?? {})).toEqual(['dry_run']);
    const run = stepsOf(OFFSEASON).find((step) => step.name === 'Run the pipeline');
    expect(Object.keys(run?.env ?? {})).not.toContain('WANT_REQUIRE_FEED');
    expect(stepsOf(OFFSEASON).map((step) => step.run ?? '').join('\n')).not.toContain('require-feed');
    expect(run?.run).toContain('--source=espn');
  });

  it('runs the same idempotent command — initialization and finalization are one path', () => {
    const same = (rel: string) => stepsOf(rel).find((step) => step.name === 'Run the pipeline');
    expect(same(INSEASON)?.env?.SUPABASE_SERVICE_ROLE_KEY).toBe(same(OFFSEASON)?.env?.SUPABASE_SERVICE_ROLE_KEY);
    expect(same(OFFSEASON)?.run).toContain('supabase/scripts/pipeline/run.ts');
  });
});

describe('both pipeline workflows — the shared mechanics', () => {
  for (const rel of [INSEASON, OFFSEASON]) {
    it(`${rel}: one run at a time, so no two runs interleave a write`, () => {
      expect(docOf(rel).concurrency).toEqual({ group: 'pipeline-writes', 'cancel-in-progress': false });
    });

    it(`${rel}: the credential enters only as a secret reference, never on a command line`, () => {
      for (const step of stepsOf(rel)) {
        for (const [key, value] of Object.entries(step.env ?? {})) {
          if (/SERVICE_ROLE/.test(key)) expect(value, `${rel} step "${step.name}"`).toBe('${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
        }
      }
      expect(stepsOf(rel).some((step) => (step.env ?? {})['SUPABASE_SERVICE_ROLE_KEY'])).toBe(true);
      // Parsed run blocks, not file text: `--env-file` belongs in the prose that
      // explains why it is absent, and a comment naming a forbidden thing is not
      // the forbidden thing.
      expect(stepsOf(rel).map((step) => step.run ?? '').join('\n')).not.toContain('--env-file');
    });

    it(`${rel}: a missing secret is named before the runner can misreport it (CAP-4)`, () => {
      const guard = stepsOf(rel).find((step) => step.name === 'Refuse on a missing secret');
      expect(guard?.run).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(guard?.run).toContain('exit 1');
      // Presence is not the guarantee. The whole point of the guard is that it
      // runs BEFORE anything that could consume the credential, so the order is
      // pinned as a number: moving it below the pipeline step must go red.
      const names = stepsOf(rel).map((step) => step.name ?? step.uses ?? step.run ?? '');
      const indexOf = (label: string) => names.findIndex((name) => name.includes(label));
      const guardAt = indexOf('Refuse on a missing secret');
      expect(guardAt).toBeGreaterThanOrEqual(0);
      expect(guardAt).toBeLessThan(indexOf('npm ci'));
      expect(guardAt).toBeLessThan(indexOf('Run the pipeline'));
      expect(guardAt).toBeLessThan(indexOf('File a loud failure'));
    });

    it(`${rel}: every non-zero exit is heard (SM-4)`, () => {
      const notify = notifyStepOf(rel);
      expect(notify?.uses).toBe('./.github/actions/notify-failure');
      expect(notify?.if).toBe('failure()');
    });
  }
});

// Story 2.18 — a birth the run could not certify is an ALERT, not a failure: the
// runner prints `BIRTH NEEDED:` lines and keeps its exit code, and each pipeline
// workflow greps its own log for them and files a distinct issue. These pins are
// what keep that wire connected end to end: the runner's prefix constant, the
// grep, the tee that makes a log to grep, and pipefail so the tee does not
// swallow the runner's exit code (which would silence the failure issue).
describe('both pipeline workflows — the Story 2.18 birth-needed alert', () => {
  for (const rel of [INSEASON, OFFSEASON]) {
    const named = (name: string) => stepsOf(rel).find((step) => step.name === name);

    it(`${rel}: the run step keeps a log copy without losing the runner's exit code`, () => {
      const run = named('Run the pipeline')?.run ?? '';
      expect(run).toMatch(/^set -o pipefail$/m);
      expect(run).toMatch(/supabase\/scripts\/pipeline\/run\.ts .*2>&1 \| tee "\$RUNNER_TEMP\/pipeline\.log"$/m);
    });

    it(`${rel}: the alert step greps the runner's own prefix, on every outcome`, () => {
      const collect = named('Collect birth-needed alerts');
      expect(collect?.if).toBe('always()');
      expect((collect as Step & { id?: string })?.id).toBe('alerts');
      expect(BIRTH_NEEDED_PREFIX).toBe('BIRTH NEEDED:');
      const grepped = (collect?.run ?? '').match(/grep(?: -q)? '\^([^']+)'/g) ?? [];
      expect(grepped).toHaveLength(2);
      for (const call of grepped) expect(call).toContain(`'^${BIRTH_NEEDED_PREFIX}'`);
      expect(collect?.run).toContain('$RUNNER_TEMP/pipeline.log');
      expect(collect?.run).toContain('>> "$GITHUB_OUTPUT"');
      // The UTC date the issue title carries (review decision 2026-10-06).
      expect(collect?.run).toContain('echo "date=$(date -u +%F)"');
    });

    it(`${rel}: a found alert files its own DATED issue — distinct from the failure issue, one per day`, () => {
      const file = named('File a birth-needed alert');
      // Dated, not stable: on an open issue `notify-failure` comments only a
      // run link, so a stable title would bury a later day's series behind
      // "Still red". Each day's alert lines open an issue of their own.
      // `!inputs.dry_run`: a rehearsal dispatch writes nothing, so it files no
      // issue (owner decision 2026-10-07, Story 2.18 pass-2 review); on a
      // schedule event `inputs.dry_run` is null and the guard passes.
      expect(file).toMatchObject({
        if: "always() && steps.alerts.outputs.found == 'true' && !inputs.dry_run",
        uses: './.github/actions/notify-failure',
        with: { title: 'Pipeline birth needed ${{ steps.alerts.outputs.date }}' },
      });
      const body = String(file?.with?.body ?? '');
      expect(body).toContain('docs/PLAYOFF_RUNBOOK.md');
      expect(body).toContain('${{ steps.alerts.outputs.lines }}');
      expect(body).toMatch(/not a failed run/);
      expect(body).toMatch(/Each day's alerts open their own issue/);
      // The failure step stays the FIRST notify step and keeps its title, so
      // the alert can never be mistaken for it (or replace it).
      expect(notifyStepOf(rel)?.if).toBe('failure()');
      expect(String(notifyStepOf(rel)?.with?.title)).not.toMatch(/^Pipeline birth needed/);
      const names = stepsOf(rel).map((step) => step.name ?? '');
      const at = (name: string) => names.indexOf(name);
      expect(at('Run the pipeline')).toBeLessThan(at('File a loud failure'));
      expect(at('File a loud failure')).toBeLessThan(at('Collect birth-needed alerts'));
      expect(at('Collect birth-needed alerts')).toBeLessThan(at('File a birth-needed alert'));
    });
  }
});

describe('the three new jobs — the pins that are not pipeline-specific', () => {
  for (const rel of [INSEASON, OFFSEASON, REHEARSAL]) {
    it(`${rel}: no wider than reading the repo and filing an issue`, () => {
      expect(docOf(rel).permissions).toEqual({ contents: 'read', issues: 'write' });
    });

    it(`${rel}: Node pinned where native type stripping exists`, () => {
      // run.ts is executed as TypeScript by Node itself; ci.yml's floating
      // 22.x is not evidence a runner can do that.
      const setup = stepsOf(rel).find((step) => (step.uses ?? '').includes('setup-node'));
      expect(setup?.with?.['node-version']).toBe('24.x');
    });

    it(`${rel}: a stalled run fails instead of hanging the cadence`, () => {
      // `if: failure()` is only loud when the stall FAILS. Without a ceiling a
      // hung install, pull, or `gh` call sits in GitHub's 360-minute default,
      // files nothing, and (for the pair) blocks every later cron through the
      // shared `pipeline-writes` group. A job that hits its own
      // `timeout-minutes` is CANCELLED, and `failure()` is false then, so the
      // stall-prone steps carry their own ceilings (a timed-out step fails)
      // and the job ceiling is only a backstop above their sum.
      const job = docOf(rel).jobs[rel === REHEARSAL ? 'rehearse' : 'pipeline'];
      const jobCeiling = job?.['timeout-minutes'] ?? 0;
      expect(jobCeiling, `${rel} declares a job ceiling`).toBeGreaterThan(0);
      expect(jobCeiling, `${rel} job ceiling stays well under the 360-minute default`).toBeLessThanOrEqual(60);
      const stallProne = (job?.steps ?? []).filter((step) => /npm ci|run\.ts|rehearse-migration/.test(step.run ?? ''));
      expect(stallProne.length, `${rel} has stall-prone steps`).toBeGreaterThan(0);
      for (const step of stallProne) {
        expect(step['timeout-minutes'], `${rel}: "${step.name ?? step.run}" carries a step ceiling`).toBeGreaterThan(0);
      }
      const stepSum = stallProne.reduce((sum, step) => sum + (step['timeout-minutes'] ?? 0), 0);
      expect(stepSum, `${rel}: the step ceilings fire before the job ceiling cancels`).toBeLessThan(jobCeiling);
    });
  }

  it('nightly-gate.yml keeps the permission its alarm needs', () => {
    // The step moved into the shared action, so nothing in that file still
    // spells out why it needs to write issues — which is exactly how a later
    // cleanup would drop it and silence the nightly gate with a green suite.
    expect(docOf(NIGHTLY).permissions).toEqual({ contents: 'read', issues: 'write' });
  });
});

describe('migration-rehearsal.yml — the replay certification (CAP-5)', () => {
  it('triggers on exactly the paths that can expire the verdict (D-2 = B, widened by the owner 2026-10-03)', () => {
    const triggers = triggersOf(REHEARSAL);
    // The trigger set equals the rehearsal's input set: the two data files are
    // read by `scripts/rehearse-migration-00014.mjs` (`:347`, `:525`, `:573`),
    // so an edit to either can expire the verdict just as a migration can.
    // Story 6.10 adds aba_game7_venues.csv, read by the rehearsal's section 9.
    const expected = [
      'docs/NBASeriesResults.xlsx',
      'scripts/rehearse-migration-00014.mjs',
      'supabase/migrations/**',
      'supabase/scripts/pipeline/data/aba_game7_venues.csv',
      'supabase/scripts/pipeline/data/game7_venues_curated.csv',
      'supabase/scripts/pipeline/venueBackfill.ts',
    ];
    expect([...(triggers.push?.paths ?? [])].sort()).toEqual(expected);
    expect([...(triggers.pull_request?.paths ?? [])].sort()).toEqual(expected);
    expect(triggers.push?.branches).toEqual(['master']);
    // Infra reds must be re-runnable without inventing a commit to push.
    expect(triggers.workflow_dispatch).toBeDefined();
    expect(triggers.schedule).toBeUndefined();
  });

  it('runs the rehearsal, not a copy of its assertions', () => {
    expect(stepsOf(REHEARSAL).find((step) => step.name === 'Rehearse the migration replay order')?.run).toBe(
      'node scripts/rehearse-migration-00014.mjs',
    );
  });

  it('needs no secret at all, because it talks only to a throwaway container', () => {
    expect(textOf(REHEARSAL)).not.toContain('secrets.');
    expect(textOf(REHEARSAL)).not.toContain('npm ci');
  });

  it('files the same shape of alarm, under its own title', () => {
    expect(notifyStepOf(REHEARSAL)).toMatchObject({
      if: 'failure()',
      uses: './.github/actions/notify-failure',
      with: { title: 'Migration rehearsal failed' },
    });
  });
});

describe('notify-failure — one definition of loud (D-4 = B)', () => {
  const action = load(textOf(ACTION)) as unknown as {
    name: string;
    inputs: Record<string, { required?: boolean; description?: string }>;
    runs: { using: string; steps: Step[] };
  };

  it('both arguments are required, so no caller can file an untitled issue', () => {
    expect(action.inputs.title?.required).toBe(true);
    expect(action.inputs.body?.required).toBe(true);
  });

  it('owns the dedupe rule exactly once in the repo', () => {
    const bodies = [INSEASON, OFFSEASON, REHEARSAL, NIGHTLY].flatMap((rel) => stepsOf(rel).map((step) => step.run ?? ''));
    expect(bodies.join('\n')).not.toContain('gh issue');
    const run = action.runs.steps[0]?.run ?? '';
    expect(run).toContain('gh issue list');
    // Two create calls: the no-issue branch, and the fall-through when a
    // comment on the found issue fails (closed, locked, or transferred
    // between the lookup and the comment) — `bash -e` would otherwise end the
    // step with nothing filed.
    expect(run.match(/gh issue create/g)).toHaveLength(2);
    expect(run).toMatch(/gh issue comment [^\n]*\\\n\s*\|\| gh issue create/);
    expect(run.match(/gh issue comment/g)).toHaveLength(1);
    // Commenting rather than duplicating is what keeps a week-long breakage to
    // one issue, and the comment carries the new SHA so a fresh break is visible.
    expect(run).toContain('Still red:');
    expect(run).toContain('${GITHUB_SHA:0:7}');
    // The lookup is allowed to fail; the filing is not. The runner's bash is
    // `-e`, so an unguarded `gh issue list` that errors would abort the step
    // before the create branch and leave a broken cadence with a red check and
    // no issue — the one shape of silence SM-4 exists to end.
    expect(run.split('\n').find((line) => line.includes('gh issue list'))).toMatch(/gh issue list.*\|\| true\)?$/);
  });

  it('authenticates with the run token, not a secret', () => {
    expect(action.runs.steps[0]?.env?.GH_TOKEN).toBe('${{ github.token }}');
    expect(action.runs.steps[0]?.shell).toBe('bash');
  });

  it('nightly-gate keeps its trigger, its title, and nothing else of the step', () => {
    expect(cronsOf(NIGHTLY)).toEqual(['30 3 * * *']);
    expect(notifyStepOf(NIGHTLY)).toMatchObject({
      if: 'failure()',
      uses: './.github/actions/notify-failure',
      with: { title: 'Nightly gate is red' },
    });
  });
});

describe('the boundaries the AC and NFR-S1 set', () => {
  const githubTexts = [
    ...readdirSync(join(repoRoot, '.github', 'workflows')).map((file) => join('.github', 'workflows', file)),
    ACTION,
  ];

  it('keepalive.yml stays dumb about the pipeline; Story 2.13 moved its minute and nothing else', () => {
    // Story 2.6's AC forbade modifying this file, and this pinned the parts that
    // would have had to change for that to have happened. The owner's
    // 2026-10-04 call amended exactly one line of it — the cron, so the pair
    // keeps its order (D-5's only recorded reason for the 30-minute gap: the
    // pipeline must not be the job that wakes a sleeping PostgREST) — and the
    // dumbness guarantees below are the part the amendment did NOT touch. A
    // keepalive that learned about the pipeline would fail as a pair, not as
    // two independent alarms.
    expect(cronsOf(KEEPALIVE)).toEqual(['0 7 * * *']);
    expect(docOf(KEEPALIVE).permissions).toBeUndefined();
    const text = textOf(KEEPALIVE);
    expect(text).not.toContain('notify-failure');
    expect(text).not.toContain('SERVICE_ROLE');
    expect(text).not.toContain('run.ts');
  });

  it('ci.yml gained no cron and no pipeline step', () => {
    expect(triggersOf(CI).schedule).toBeUndefined();
    expect(textOf(CI)).not.toContain('notify-failure');
    expect(textOf(CI)).not.toContain('pipeline/run.ts');
  });

  it('no job in .github reaches production or applies a migration', () => {
    // `supabase/.temp/project-ref` IS production, and the CLI's apply commands
    // are the owner's. Asserted on the parsed command blocks so an explanatory
    // comment can still name the thing it forbids.
    const forbidden = [
      '--env-file',
      'project-ref',
      'db push',
      'db reset',
      'db start',
      'database migration',
      'supabase migration',
      'psql',
      'VITE_',
    ];
    const blocks = [
      // ci.yml is the pre-existing gate job; it is scanned by the tests above
      // for what Story 2.6 must not add to it, not for these needles.
      ...readdirSync(join(repoRoot, '.github', 'workflows'))
        .filter((file) => file !== 'ci.yml')
        .flatMap((file) => stepsOf(workflow(file.replace(/\.yml$/, ''))).map((step) => step.run ?? '')),
      // The composite action has no triggers and no jobs, so it is read directly.
      ...(load(textOf(ACTION)) as { runs: { steps: Step[] } }).runs.steps.map((step) => step.run ?? ''),
    ].join('\n');
    for (const needle of forbidden) {
      expect(blocks, `.github run block contains "${needle}"`).not.toContain(needle);
    }
    // DDL by shape, not by one spelling: the task list names DDL among the
    // negative invariants, and a `-c "ALTER …"` would carry none of the needles.
    expect(blocks).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\s+(TABLE|FUNCTION|POLICY|ROLE|SCHEMA|INDEX|VIEW|ON)\b/i);
  });

  it('nothing that looks like a key or a JWT is written into the CI surface', () => {
    // issue #1 was a service_role JWT committed to this repo. A JWT starts with
    // the base64 of `{"alg"`, i.e. "eyJ" — cheap, and it has caught real things.
    for (const rel of githubTexts) {
      const text = textOf(rel);
      expect(text, `${rel} carries an eyJ-prefixed token`).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}/);
      expect(text, `${rel} carries a publishable/secret-looking key value`).not.toMatch(/(service_role|anon)[": ]+[A-Za-z0-9._-]{20,}/);
    }
  });

  it('each failure title is declared once, and is the dedupe key', () => {
    const titles = [INSEASON, OFFSEASON, REHEARSAL, NIGHTLY].map((rel) => String(notifyStepOf(rel)?.with?.title));
    expect(titles).toEqual([
      'Pipeline inseason run failed',
      'Pipeline offseason run failed',
      'Migration rehearsal failed',
      'Nightly gate is red',
    ]);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
