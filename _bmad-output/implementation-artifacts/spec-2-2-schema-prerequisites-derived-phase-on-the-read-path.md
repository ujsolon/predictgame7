---
title: 'Story 2.2 — Schema prerequisites + derived phase on the read path'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '66be551'
story: '2-2-schema-prerequisites-derived-phase-on-the-read-path'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-30.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-0-gate-the-server-side-edge-function-type-check-and-input-validation.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `series.status` carries no information — all 178 live rows read `'historical'` — yet
seven client branches still decide a series' phase from it, and `series` has no uniqueness guard the
Epic 2 pipeline can upsert against. Its only identity index (`00007:41-42`, five columns ending in
`status`) cannot survive the column's removal, and the `(year, round)` shape it was built around
collides on 19 groups of the live table.

**Approach:** one subtractive migration plus one shared derivation. `00014` adds
`UNIQUE (year, team_a_id, team_b_id)`, drops `idx_series_identity`, and drops `status` with its
CHECK and its `DEFAULT 'historical'` (owner decision 2026-09-29). Then every consumer of a series'
phase reads one helper over `winner_team_id` + `series_game_scores`, and a row that reconciles to
neither shape is excluded and reported instead of guessed into a group.

## Decisions

1. **No identity enforcement in the database beyond the pair.** The `team_a` = game-1-home
   convention holds in 178/178 rows but is not id-ordering (`team_a_id > team_b_id` in 80), so the
   slot-swapped half of the guard is Story 2.3's pre-commit assertion, not a constraint or trigger.
2. **`round` ships with no CHECK.** Its 17 era spellings stay as archived; Story 2.4's adapter owns
   the canonical display value.
3. **The agent never applies 00014.** It is committed and rehearsed off-production; the owner runs
   the production apply and is handed the exact command.
4. **The rehearsal is agent-driven against a disposable Docker Postgres** (owner call 2026-09-30).
   A committed script replays 00001–00014 in order with `psql`, after pre-creating the `anon` and
   `authenticated` roles the RLS migrations require, and exits non-zero on any miss. No
   `supabase/config.toml` is written and no Supabase CLI db command runs from this checkout, because
   `.temp/project-ref` is production.
   **What it can prove, measured 2026-09-30:** replay correctness and enforcement — every statement
   applies in order (`00007:57`'s `ON CONFLICT … status` target resolves before the column goes),
   a duplicate `(year, team_a_id, team_b_id)` insert is rejected, the slot-swapped insert is
   accepted. What it **cannot** prove is the archive total: migrations seed only 16 `game_sevens`
   rows (`00001:102`) and the 178-row archive is loaded out of band, so "satisfiable by all 178
   existing rows" is carried by the live pre-flight measurement, not by replay.
5. **A non-reconciling row is reported on the existing exception channel** (owner call 2026-09-30):
   `console.error` plus `posthog.captureException`, mirroring `PredictPage.tsx:156-158`. No new event
   name, and nothing fan-visible.

## Boundaries & Constraints

**Always:**
- Phase derives from `winner_team_id` + `series_game_scores` only — never from dates or
  `created_at` (AD-4) — and through one shared helper, not an inline expression.
- The UNIQUE, the `idx_series_identity` drop, and the `status`/CHECK/default drop all land in the
  same migration; the new constraint is satisfiable by all 178 existing rows.
- `docs/CURRENT_DATA_MODEL.md` updates in the same commit as the migration file.
- `npm run gate` green, and `scripts/spike-2-1/audit-unique-key.mjs` re-run as pre-flight.

**Never:**
- Never run `supabase db push`/`db reset`/`db start`, and never point `psql` at the linked project:
  `supabase/.temp/project-ref` is **production** and gitignored, and there is no
  `supabase/config.toml`. Decision 4's container is a local throwaway, reachable only by its own
  published port. A live `DROP COLUMN` is not reversible.
- No DB trigger, view, or generated column enforcing the derivation (AD-4 §4.2(b)).
- Never change the `series_source` analytics values (`current|historical|custom`) or add an event
  name (addendum §A.1).
- No pipeline runner (2.3), no automated adapter (2.4), no insights refresh (2.5), no workflow
  (2.6), no change to `getRoundImportance`.
- `supabase/functions/**` and `scripts/probe-predict-contract.mjs` are not touched — verified at
  this baseline that neither reads `series.status`, so the drop cannot break them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Archived series | `winner_team_id` set, `game_number` covers 1–7 | phase `archive`: Historical group, `?series=` source `historical` | N/A |
| Certified 3–3 | null winner, covers 1–6 | phase `pending`: Active group, `?series=` source `current` | N/A |
| Impossible shape | a winner whose rows are not exactly 1–7, or a game-number set matching neither (e.g. {1,2,4,5,6,7}) | excluded from **both** picker groups; never guessed | `console.error` + `captureException` (Decision 5) |
| Nothing pending | every row archived | Active group renders empty with `EXPERIENCE.md:112`'s copy and the archive link — not hidden, not an error | N/A |
| Deep link to a non-reconciling row | `?series=<id>` | still loads and predicts; falls back to `historical` for the source, and the existing submit guards toast as today | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/00005_release_1_data_model.sql:33,36` — `status TEXT DEFAULT 'historical'`
  and `chk_series_status`: the objects 00014 drops. `:152,:168` name `status` in insert column
  lists, and `00006:21,127` / `00007:89,117` filter on it — all replay **before** 00014, which is
  the property Decision 4's rehearsal proves rather than assumes.
- `supabase/migrations/00007_backfill_missing_historical_series.sql:41-42` (`idx_series_identity`)
  and `:57` (`ON CONFLICT (year, round, team_a_id, team_b_id, status) DO NOTHING`), wrapped in
  `BEGIN`/`COMMIT`. `00011:9` enables RLS and `:40-44`'s read policy has no status predicate. Nothing
  from 00008 onward reads the column. Do not edit any earlier migration.
- **New** `scripts/rehearse-migration-00014.mjs` — Decision 4's harness, beside the repo's other
  committed `scripts/*.mjs` probes (`docker run` a throwaway `postgres:16`, `docker exec psql` each
  migration in filename order, then the two synthetic inserts, assert, `docker rm -f` in a
  `finally`). It seeds no archive data of its own — `00001`/`00005`/`00007` carry the 16-row fixture
  the replay runs against. Like every other file under `scripts/`, Biome's `files.includes` does not
  cover it, so it is checked by `node --check` and by running it.
- `supabase/scripts/load-games/main.py:60` — writes `game_sevens`, never `series`: unaffected by the
  drop (verified).
- `src/types/types.ts:34` — `status: 'historical' | 'active' | 'completed'` leaves the `Series`
  interface; `'completed'` dies with it. `winner_team_id?: number | null` at `:33` and
  `series_game_scores?: SeriesGameScore[]` at `:40` are the derivation's inputs.
- `src/pages/PredictPage.tsx` — the seven reads, all verified at this baseline (epics.md's
  `:167/:396/:408`, `:712-717`, `:778` are stale numbers for these same sites):
  `:37` `status,` inside `SERIES_SELECT` (delete the line);
  `:179` `loadSeriesById` → `source:`;
  `:422` and `:434` `selectSeries` → state source and PostHog `series_source`;
  `:738` the Active group's `games.some(...)` guard and `:743` its `.filter(...)`;
  `:804` the decade card's `Current`/`View Series` label.
  `:49-50`'s `asSeries`/`asSeriesRow` casts stay — nothing is validated at the boundary; the helper
  is the reconciliation point. Reuse `:156-158`'s error path shape for reporting.
- `src/pages/HistoricalPage.tsx` — `:40` `.eq('status','historical')` →
  `.not('winner_team_id','is',null)`; `:309-312` the right-hand "Series Status" `<div>` is deleted
  (owner decision 2026-09-30) and the "Series Winner" block at `:300-307` spans the row; nothing else
  reads the column. `:15` `SeriesWithNestedTeams extends Series` inherits the type change.
- **New** `src/lib/series-phase.ts` + `src/lib/__tests__/series-phase.test.ts` — `src/lib` is
  kebab-case with named exports. The helper is `Series`-shaped-input only and platform-free.
- `src/pages/__tests__/helpers.tsx:16-36` — `seriesFixture`: `:22` `status: 'historical'` deleted;
  it carries six rows (games 1–6, team_a wins the odd/home games, team_b the even → a real 3–3) and
  no winner, so under derivation it is **pending**.
- `src/pages/__tests__/predict-flow-regression.test.tsx:69` and
  `src/pages/__tests__/predict-error-states.test.tsx:227` — the `/2022 View Series/` button selectors
  must become `Current` once the fixture reads pending. `predict-flow-regression.test.tsx:433`
  (five rows) and `:447-451` (game set {1,2,4,5,6,7}) are the deep-link/anomaly shapes to keep green.
- `scripts/spike-2-1/audit-unique-key.mjs:93` — the pre-flight selects `status`, so it works only
  against a table that still has it; post-apply it must lose that column. Home: Story 2.7, which
  re-runs the archive audit for epic verification.
- `docs/CURRENT_DATA_MODEL.md:19` (the pending-migration paragraph) and `:27` (`status` in the
  `Stores:` list).
- Not touching: `src/lib/nba-utils.ts:58-65` (`getRoundImportance`), `src/db/supabase.ts:7` (the
  single anonymous client).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/00014_series_identity_and_drop_status.sql` — in one `BEGIN`/`COMMIT`
      (like 00007): `ADD CONSTRAINT series_year_team_pair_key UNIQUE (year, team_a_id, team_b_id)`;
      `DROP INDEX IF EXISTS idx_series_identity`; `DROP CONSTRAINT IF EXISTS chk_series_status`;
      `DROP COLUMN IF EXISTS status` (the default goes with the column). Explicit drops rather than
      relying on Postgres' implicit dependency cascade, so a replayer reads the intent. No data
      change, no backfill.
- [x] `scripts/rehearse-migration-00014.mjs` — Decision 4's replay harness, run before the commit is
      reported and again in the final report.
- [x] `src/lib/series-phase.ts` — the single derivation + reconciliation check; `src/pages/PredictPage.tsx`
      and `src/pages/HistoricalPage.tsx` read only through it.
- [x] `src/types/types.ts` — remove `status`; fix every compile site the Code Map lists (the gate's
      `tsc -b` enumerates them; do not reintroduce the field as optional).
- [x] `src/lib/__tests__/series-phase.test.ts` — fixtures for 1–7+winner, 1–6+null, and the two
      non-reconciling shapes (winner with six rows; game set {1,2,4,5,6,7}).
- [x] `src/pages/__tests__/helpers.tsx` + the two named suites — fixture and selector updates.
- [x] `docs/CURRENT_DATA_MODEL.md` — same commit as the migration: name 00014 and the new key at
      `:19`, remove `status` at `:27`, and state plainly that the committed migration is applied by
      the owner, so the document describes the target shape.
- [x] Hand the owner, in the final report: the pre-flight command, the rehearsal result, and the
      exact production apply command. `docs/CHANGELOG.md` is not touched (no `Unreleased` convention;
      this lands in the next release entry, same as Story 2.0's 400 vocabulary).

**Acceptance Criteria:**
- Given the migration replayed in a disposable database, when 00001–00014 apply in order, then no
  statement fails — `00007:57`'s `ON CONFLICT (…, status)` target resolving at its own point is the
  property proven, not assumed.
- Given the replayed schema, then a duplicate `(year, team_a_id, team_b_id)` insert is rejected by
  the database and the same matchup with slots swapped is **not** (Story 2.3's assertion owns that
  half). Given the live table, then the pre-flight measurement reports the new key duplicate-free over
  all 178 rows — that measurement, not the replay, is the satisfiability evidence (Decision 4).
- Given no pending series, when a fan opens the picker, then the Active group is present and empty
  with its established copy.
- `npm run gate` green, run bare with its exit code read directly.

## Implementation Notes

**Commits (local `master`, all unpushed):** `22cf9fa` "Drop stored series status, key series on the team pair (Story 2.2, AD-4, AD-5, FR3)" — 11 files, +532/−28; migration, docs, derivation, both pages, types and tests in one commit, so `docs/CURRENT_DATA_MODEL.md` cannot describe a shape the schema does not have. `64dbe73` "Cover the derived-phase read path with page tests (Story 2.2)" — `predict-phase-groups.test.tsx` and the replay-assertion loosening. `64b1d27` "Close the review gaps on the derived-phase read path (Story 2.2)" — the step-04 patches listed below, including the new `historical-page-archive.test.tsx` and the hardened rehearsal harness.

**Rehearsal — what it proved, measured 2026-09-30 (exit 0).** `node scripts/rehearse-migration-00014.mjs` against a throwaway `postgres:16` container (no published port, removed in `finally`): 00001–00014 applied in filename order with no statement error, which is the `00007:57` `ON CONFLICT (…, status)` target resolving while `status` still exists; `\d public.series` printed `series_year_team_pair_key UNIQUE, btree (year, team_a_id, team_b_id)`; `idx_series_identity`, `status` and `chk_series_status` each confirmed absent by a catalog query; a duplicate `(2024, 8, 18)` insert rejected with SQLSTATE 23505 attributed to `series_year_team_pair_key` via `GET STACKED DIAGNOSTICS`; the slot-swapped `(2024, 18, 8)` insert accepted. **What it did not prove:** the 178-row archive totals. The replayed migrations seed the eight `game_sevens` fixture tuples at `00001:102-110`, which `00007` turns into series rows, so the container holds **8 series rows** (measured; the script prints the count as a note). Satisfiability over the real archive stays with the live pre-flight `node scripts/spike-2-1/audit-unique-key.mjs`, per Decision 4. Nothing was applied to production; the owner holds the apply command. *(Decision 4's frozen text still says "16 `game_sevens` rows" — the measured count is 8 tuples at `00001:102-110`. Left as the owner's to renegotiate; the unfrozen record here and the script header carry the measurement.)*

**Harness hardening after the first green run.** Three edits, each re-run green (exit 0, container removed):
- The replay assertion was `files.length === 14 && files[13].startsWith('00014_')`, which turns this evidence red the moment 00015 lands, and its `>= 14` replacement still only counted files. It is now per-number coverage: every prefix `00001`…`00014` must be present, and a missing one is named in the failure. The property is "00014 applied in order", not "00014 was the last file forever".
- `waitForReady` polled `pg_isready`, which can answer during initdb's temporary server — the window in which the `rehearse` database does not exist yet. Readiness is now `psql -d rehearse -c 'SELECT 1'` returning `1`, so the gate cannot open early.
- `docker run` moved inside the `try` (a container created by a run that then fails to start was leaking past the teardown), and every `spawnSync` docker/psql call carries a 10-minute ceiling — without one a stalled daemon blocks forever, since `waitForReady`'s deadline is only checked between polls.

**Pre-flight exit code was lying (measured).** `node scripts/spike-2-1/audit-unique-key.mjs` printed 178 rows duplicate-free and still returned **127**: its trailing `process.exit(0)` raced the undici socket pool on Windows and aborted inside libuv (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`). A localhost-fetch control exited 0, isolating the cause to the explicit exit. Removed, so the script exits on natural drain — re-measured at exit 0. A report anyone can read as green while the shell says otherwise is the failure mode this repo's gate rule exists to catch.

**Review pass (step-04, three layers).** Patches from triage, in `64b1d27`: the Active group's empty state now waits for the list query (`seriesListLoaded`, `PredictPage.tsx:66-69,170,775-788`) because the claim "no active series right now" is about the whole archive and was rendering mid-fetch; `HistoricalPage`'s archive predicate gained its own boundary suite (`src/pages/__tests__/historical-page-archive.test.tsx`, 2 tests) — before it, nothing in the repo imported that page and reverting `.not('winner_team_id','is',null)` kept the whole gate green; the `SERIES_SELECT` projection is now observed by a test (`winner_team_id`, `series_game_scores(*)` present, `\bstatus\b` absent); `series_source` is asserted on the emitted `series_selected` and deep-link `prediction_generated` payloads; the dead `|| 'TBD'` fallback in `HistoricalPage.tsx:313` is deleted; and every card selector that matched a **computed accessible name** in jsdom was replaced with raw `textContent` helpers (`clickDecadeCard`, `clickYearCard`, `yearCardText` in `helpers.tsx`), per AGENTS.md's rule and `qa-matrix-1-5.md` §5 note 4 — that covers `predict-phase-groups`, `predict-error-states` and `predict-flow-regression`. Mutation checks measured on the patched tree: `deriveSeriesPhase` reduced to "`winner_team_id != null` ⟹ `archive`" (the score-set reconciliation removed) reddens **4 tests** across `series-phase.test.ts` and `predict-phase-groups.test.tsx`; `HistoricalPage.tsx:42` reverted to `.eq('status','historical')` reddens **both** tests in `historical-page-archive.test.tsx` — the coverage that did not exist before this pass; a no-op `seriesListLoaded` reddens exactly one page test (`1 failed | 8 passed`). Each mutated file was restored from an explicit copy and the three suites re-run clean (21 passed).

**Two gaps found at review that this story does not own**, both written to `deferred-work.md` with a named home: the Story 2.1 spike audits still project `status` (`audit-archive.mjs:76`, `audit-unique-key.mjs:93`) and so go red the moment 00014 is applied — Story 2.7, which re-runs them; and nothing automated executes the rehearsal, which stays a human-typed command until Story 2.6 wires it.

**Page suites now:** `predict-phase-groups.test.tsx` 10 tests, `historical-page-archive.test.tsx` 3 tests, `series-phase.test.ts` 11 tests (counts after the 2026-10-01 external pass; see its section in `## Review Triage Log`). `seriesFixture` stays the certified 3–3 pending shape, pinned by a test so an edit to `helpers.tsx` cannot silently move every suite off it.

**Matrix coverage gap closed by a page suite.** The pure-function suite cannot show what the picker *does* with a non-reconciling row, so `src/pages/__tests__/predict-phase-groups.test.tsx` (jsdom) covers the matrix's page-level rows: empty Active group with `EXPERIENCE.md`'s established copy plus the `/historical` link; pending-only grouping with an archived row still reachable by year; derived `Current` / `View Series` card labels; exclusion with `console.error` and exactly one `posthog.captureException` whose message names the row id; a deep link to the anomaly still loading and predicting with `series_id: 's-anomaly'` and zero captures (exclusion is a picker concern, not a load-path failure); and the `helpers.tsx` fixture pin above. The review pass added the four the matrix implied but did not test: the empty state withheld until the list query answers, the projection contract, and the two `series_source` payloads.

**Fixture consequence worth recording:** removing `status` from `seriesFixture` left it as a pending row, so two existing suites that selected the archived-looking label had to be re-pointed — `2022 Current` in `predict-error-states.test.tsx` and `predict-flow-regression.test.tsx` — and one assertion changed from `getByText('BOS vs MIA')` to `getByText('101 — 91')`, because the matchup legitimately renders twice now (picker row and panel) while the score line stays unique to the panel and is already that suite's established assertion.

**Analytics stayed two-valued.** No third `series_source` bucket: the deep-link path maps a `null` derivation to `historical` through `seriesSourceForPhase`, which is today's behavior for anything not active.

**Where the archive and the picker disagree, on purpose.** `HistoricalPage`'s membership is a database predicate — `winner_team_id IS NOT NULL` — not `deriveSeriesPhase`, so a winner whose score rows are not exactly 1–7 is excluded from both picker groups and reported there, while still listing in the archive with its winner. That is the fan-facing fact (the series did happen and was won); the reconciliation guard protects the Active group, where a half-written row would put an impossible "pending" in front of fans. The Tasks bullet's "read only through it" describes the picker's derivation, and the I/O matrix names only the picker groups — recorded here rather than editing the frozen text. Story 2.3's runner is the first thing that could produce such a row.

**Gate:** `npm run gate` → exit 0, read bare (Biome checked 109 files; `tsc -b` clean; Vitest 15 files green including the two new suites; build kept the `/predictgame7/` asset prefix).


## Spec Change Log

No loopback ran: `review_loop_iteration` stayed 0 because no surviving finding routed to `intent_gap` or `bad_spec`. Every finding whose smallest fix was an edit to this spec is rejected per step-04 and recorded in the triage log below with the accurate state written into `## Implementation Notes` instead — the frozen Decision 4 row count, the "published port" clause, the "seven client branches" count, the "read only through it" bullet, and the I/O matrix's silence on the archive/picker divergence. No frozen text was modified.

## Review Triage Log

Layers run on `s22-step4-diff.txt` (baseline `66be551`): blind-hunter, edge-case-hunter, verification-gap. Verdicts rendered after verifying each claim in the files, not from the reports.

**Patched — caused by this change, fixed in this pass.**

- **medium** [edge-case] `PredictPage.tsx:767-783`: the Active group's empty state rendered while the list query was still in flight, so every initial load told the fan "no active series right now" — a claim about the whole archive. Verified: `pendingGames.length === 0` is true before the fetch resolves. Fixed with `seriesListLoaded` (`:66-69`, set at `:170`, gate at `:775-788`); mutation-checked (a no-op flag reddens exactly one test).
- **high** [verification-gap] `HistoricalPage.tsx:42`: the archive predicate flip had zero coverage — repo-wide grep found no suite importing the page, so reverting to `.eq('status','historical')` kept the entire gate green and would blank the archive post-apply. Pre-verified as filed. Fixed: `src/pages/__tests__/historical-page-archive.test.tsx` (2 tests) pins the filter arguments, the projection, and the removed "Series Status"/`TBD` readout.
- **medium** [verification-gap] `PredictPage.tsx:31-44`: no test observed the `SERIES_SELECT` projection — every page mock's `select` ignored its argument, so re-adding `status,` or dropping `series_game_scores(*)` stayed green while breaking post-apply. Pre-verified. Fixed: projections recorded from the mock and asserted (must carry `winner_team_id` and `series_game_scores(*)`, must not match `\bstatus\b`).
- **medium** [verification-gap] `PredictPage.tsx:401,452`: `series_source` was never asserted on an emitted event — `toMatchObject({ method: 'elo' })` tolerates a missing key, and grep found `series_source` in no test. Pre-verified. Fixed: `series_selected` asserts `{ series_source: 'current', series_id: 's-1' }`; the deep-linked non-reconciling row asserts `prediction_generated` with `series_source: 'historical'` (the no-third-bucket invariant).
- **high** [edge-case] `predict-phase-groups.test.tsx:132-168` matched year/decade cards by **computed accessible name** in jsdom — the year card's label is two sibling spans, which is precisely the case AGENTS.md forbids (`qa-matrix-1-5.md` §5 note 4, F16: dom-accessibility-api inserts a separator Chrome's accname does not). Real rule violation, not a hypothesis. Fixed: `clickDecadeCard`/`clickYearCard`/`yearCardText` in `helpers.tsx` assert the raw `textContent` concatenation with an exactly-one-match guard; the three suites that used name regexes (`predict-phase-groups`, `predict-error-states`, `predict-flow-regression`) re-pointed.
- **low** [edge-case] `rehearse-migration-00014.mjs:125-158`: the replay assertion counted files, so it certified a sequence it had not verified — a migration deleted from the middle of the range kept it green. Fixed: per-number coverage of `00001`…`00014`, with the missing prefixes named in the failure.
- **medium** [blind-hunter] `rehearse-migration-00014.mjs` header claimed the replay seeds 16 `game_sevens` rows and "~16 series rows"; measured at `00001:102-110` = 8 tuples → 8 series rows, which the run printed. A green run reading 8 against a stated 16 reads as missing seed data. Fixed in the script header and in `## Implementation Notes`; the identical claim inside frozen Decision 4 is the owner's to renegotiate.
- **low** [blind-hunter] `HistoricalPage.tsx:313`: `{selectedSeries.winner_team?.full_name || 'TBD'}` became unreachable once the predicate guarantees a winner, and 'TBD' contradicts the derived-phase story. Deleted.
- **low** [edge-case] `rehearse-migration-00014.mjs:132`: `docker run` sat outside the `try`, so a run that created the container and then failed leaked it past the `finally`. Moved inside.
- **low** [edge-case] `rehearse-migration-00014.mjs:55-71`: no `timeout` on `spawnSync`, so a hung daemon or stalled `psql` blocked forever — `waitForReady`'s deadline is only checked between polls. Added `DOCKER_TIMEOUT_MS` (10 min, far above the slowest measured call).
- **low** [blind-hunter] `waitForReady` polled `pg_isready`, which the official image can answer from initdb's temporary server before the `rehearse` database exists. Real window; consequence is a spurious red in the owner's hands rather than a false green, so graded low and fixed anyway: readiness now requires `psql -d rehearse -c 'SELECT 1'` → `1`. Rehearsal re-run green (exit 0, container removed).
- **low** [blind-hunter] `sprint-status.yaml` carried 2-2 as `in-progress` while the spec was review-ready. Set to `review` in this pass.

**Deferred — written to `deferred-work.md` with a named home.**

- **medium** [edge-case + blind-hunter + verification-gap] `audit-archive.mjs:76` and `audit-unique-key.mjs:93` still project `status`, so both spike audits 400 the moment 00014 is applied — exactly when Story 2.7 needs them. Same finding's second half: no committed probe verifies the key landed on production. → Story 2.7.
- **medium** [verification-gap] Nothing automated runs `scripts/rehearse-migration-00014.mjs` — not the gate, not `ci.yml`, not the pre-push hook — so the replay evidence expires silently at 00015. Needs a Docker service in CI; → Story 2.6.

**Rejected — verified false.**

- [edge-case] "A null-winner row that reconciles to neither shape is absent from the archive and reported nowhere": `fetchAllGames` selects every row unfiltered and reports each one whose derivation is `null`, so the picker path does report it; `HistoricalPage` excluding it is by design (archive membership = winner set).
- [edge-case] `series_game_scores` containing a null element would fail the whole list: PostgREST embedded arrays contain objects or are empty, and the shape was never shown reachable. A throw to the error panel for a corrupt payload is correct behavior, not a defect.
- [edge-case] Re-applying 00014 aborts on 42P07 so `status` never drops: the file is one `BEGIN`/`COMMIT`, the drops are `IF EXISTS`, and the CLI's `supabase_migrations.schema_migrations` ledger records versions — re-apply is not a path this story owns.
- [blind-hunter] The Edge Functions might write `status` or target the old five-column conflict key, which the "verified not to read it" boundary never checked: measured this pass — every `status` token under `supabase/functions/**` is an HTTP response code (`handle-contact/index.ts:17,19`, `predict-game-7/index.ts:28,31`), and `supabase/scripts/load-games/main.py` contains none.
- [blind-hunter] `docs/CURRENT_DATA_MODEL.md` documenting an unapplied schema breaks AGENTS.md's "active schema" convention: the doc was updated in the same commit as the migration, labels the section "target shape", and says plainly that applying it is the owner's action. The convention is satisfied.
- [verification-gap] "No apply command in the diff": Decision 3 puts it in the final report, not the code — it is handed at step-05.

**Rejected — low, unlikely to be met in everyday use.**

- [edge-case] The same anomaly re-reports on every refetch, inflating counts: the fix adds a `useRef` dedupe set; a refetch is a genuine re-observation, PostHog aggregates, and no fan sees it.
- [blind-hunter] `getByText('101 — 91')` couples a test to score formatting: that string is already the sibling suite's established assertion (4 pre-existing sites in `predict-flow-regression.test.tsx`), and a formatter change fails loudly in the suite rather than silently in production.

**Rejected — the fix is an edit to this spec (step-04 rule), with the accurate state recorded above.**

- [blind-hunter] Frozen Boundaries says the rehearsal container is "reachable only by its own published port" while it publishes none — the script is the safe side of that contradiction.
- [blind-hunter] Frozen Intent's "seven client branches" undercounts the client reads by one (the eighth is `HistoricalPage.tsx:40`).
- [blind-hunter] Decision 4's "16 fixture `game_sevens` rows" — measured 8. *(Re-surfaced by the 2026-10-01 external pass as H3 — the rejection was right that only the owner can edit frozen text, but no owner had the edit. It now has a home: `deferred-work.md`, "Deferred from: external code review of Story 2.2".)*
- [blind-hunter] Decision 5 / the helper docstring state exclusion-and-reporting where the I/O matrix's deep-link row asserts nothing reported; the docstring already scopes the rule to "the picker groups", so the contract as written holds.
- [blind-hunter] The Tasks bullet says both pages "read only through" `series-phase.ts`; `HistoricalPage`'s membership is a DB predicate. Divergence is intentional and written up in `## Implementation Notes`.
- [verification-gap] The I/O matrix names only the picker groups, so "a winner whose rows are not 1–7 still lists in the archive with its winner" is undocumented — same write-up, same reason.

### External review pass (2026-10-01, four layers, diff `22cf9fa^..5ab8940`)

Layers run on a fresh temp diff of the six Story 2.2 commits: blind-hunter, edge-case-hunter,
verification-gap, acceptance-auditor. The edge-case layer verified all 17 commit-message claims
against the code and filed **zero** findings. The verification-gap layer reported the diff file
unreadable and returned its documented empty result, so its coverage claim is absent from this
pass — the other three layers read the same file successfully. No blocking finding: the
acceptance auditor found no AC violated by the code.

**Independence caveat, same as Stories 1-2/1-3/1-4:** the four reviewers ran as subagents of this
session, not as a separately-invoked different model. The story was flipped to `done` on the
owner's instruction in the same session that made the patches; whether that satisfies the
different-model bar stays the owner's call.

**Patched — caused by this change, fixed in this pass (owner chose B/A/A/A/A/A).**

- **high** [blind-hunter] `HistoricalPage.tsx:313` rendered the literal string `"undefined"` when the
  `winner_team` embedding missed: the previous pass deleted the `'TBD'` fallback as unreachable, but
  RLS/embedding can still return a row with `winner_team_id` set and no joined team, and the new
  archive suite covered only the populated case. Fixed with an explicit `'Winner not available'`
  fallback plus a third `historical-page-archive.test.tsx` test that renders the missing-join row and
  asserts neither `undefined` nor a placeholder leak.
- **high** [acceptance-auditor] **H2** — the AC "the pre-flight measurement reports the new key
  duplicate-free over all 178 rows" was satisfiable only *before* the apply, because
  `audit-unique-key.mjs` projected the dropped `status`. Owner took option B (ship now, not with 2.7):
  the select names only surviving columns, and the script was re-run against the live table —
  **178 rows, 0 duplicate groups for `(year, team pair)`, exit 0**, which is the post-apply shape
  probe `deferred-work.md` asked for. `audit-archive.mjs` stays red on purpose (its subject is the
  `status` domain); that half remains Story 2.7's.
- **medium** [blind-hunter] **M1** — `rehearse-migration-00014.mjs` certified only `00001..COVERED_THROUGH`
  while replaying every file, so a 00016+ would be applied and skipped silently. `COVERED_THROUGH` moved
  to a header constant and `main()` now warns by name when a file sits above the ceiling. The
  automation gap itself stays with Story 2.6.
- **medium** [blind-hunter] **M2** — `epic-2-context.md:3` told readers to regenerate with a
  `compile-epic-context` script that does not exist in `package.json` or `scripts/`. Reworded to
  hand-maintained (option A: delete the aspirational instruction rather than write a script no story asked for).
- **medium** [blind-hunter] **M4** — no test reached the `seriesListLoaded` gate through a failure→retry
  cycle, so the flag could be deleted and eight of nine suite tests stayed green. New test drives fetch
  failure → Retry → in-flight → success and asserts the empty-state claim stays withheld mid-retry.
  Mutation-checked both ways: `seriesListLoaded || true` reddens it (and the original withholding test);
  the reverted flag leaves it green.
- **medium** [blind-hunter] **M5** — `deriveSeriesPhase` reads `!= null`, and the type allows
  `winner_team_id: undefined`, but only an omitted key was exercised. New `series-phase.test.ts` case pins
  explicit `undefined` on both the 1–6 and 1–7 shapes.
- **medium** [blind-hunter] **M6** — the I/O matrix's deep-link row promises "the existing submit guards
  toast as today", which no test asserted. Pinned as the negative (the winner + games 1–6 anomaly reaches
  no `toast.error`/`toast.warning` on its way to a successful prediction) because the guards' own positive
  toasts are already byte-pinned in `predict-flow-regression.test.tsx:436-465`; re-asserting them here
  would duplicate, not cover.

**Deferred — written to `deferred-work.md` with a named home.**

- **high** [blind-hunter + acceptance-auditor] **H3** — frozen Decision 4's "16 `game_sevens` rows" vs.
  the measured 8. Previously rejected as a spec edit; this pass filed it because the rejection left the
  edit unowned. **Lands with the owner** (frozen blocks are not agent-editable).

**Rejected — verified against the current tree.**

- [blind-hunter] `docs/CURRENT_DATA_MODEL.md` documents a broken state without a forward pointer to its
  resolution — it names Story 2.7 in the same paragraph, and that paragraph is now updated with the
  green post-apply measurement.
- [blind-hunter] `findCard` in `helpers.tsx` matches by `startsWith` and can pick the wrong button when two
  cards share a prefix. Not reachable: `clickYearCard` hands off to `cardByText`, which throws unless the
  prefix matches exactly one button, so a collision fails the test rather than mis-clicking. Prefix-only
  matching is deliberate (F16 forbids asserting computed names in jsdom).
- [blind-hunter] The withholding test's `queryByText(...).toBeNull()` before the promise resolves is fragile
  under concurrent mode. It is mutation-sensitive — the `|| true` check above reddens it — which is the
  evidence that the frame it observes is the pre-resolution one.
- [blind-hunter] The acceptance auditor's notes on frozen text (published-port wording, "seven client
  branches", the Tasks bullet's "read only through") duplicate the previous pass's rejections; `## Spec
  Change Log` and `## Implementation Notes` already carry the accurate state.

## Design Notes

**Game-number set, not row count.** Reconciling on `{1..6}`/`{1..7}` rather than `length` is what
keeps `predict-flow-regression.test.tsx:447-451`'s {1,2,4,5,6,7} row out of the Active group; a
count-only rule would call that shape pending and put a half-written series in front of fans.

**Constraint form.** A table-level `UNIQUE` constraint (not a bare unique index) is what makes
Story 2.3's `onConflict: 'year,team_a_id,team_b_id'` target resolvable; an expression index over
`LEAST/GREATEST` was rejected by the change proposal because supabase-js cannot name it as a
conflict target.

**Two-valued analytics stay two-valued.** Non-reconciling rows are excluded where the picker groups
them, and where a deep link reaches one the source stays `historical` — today's behavior for anything
that is not `'active'`, so no third bucket enters the frozen registry.

## Verification

**Commands:**
- `node scripts/spike-2-1/audit-unique-key.mjs` — expected exit 0 with `(year, team_a, team_b)
  ordered` reported duplicate-free over 178 rows: the pre-flight on the table as it stands.
- `npm run gate` — run unfiltered and read its own exit code; a piped run reports the pipe's status.
- `node scripts/rehearse-migration-00014.mjs` — expected exit 0, printing: all fourteen migrations
  applied in order with no statement error (`00007:57` included), `\d series` showing
  `series_year_team_pair_key` present, `idx_series_identity` and `status` absent, the duplicate
  insert rejected with a unique-violation SQLSTATE, and the slot-swapped insert accepted. Any miss
  exits non-zero. Expect the **8** fixture series rows, not 178 (Decision 4, corrected to the
  measured count) — a row-count assertion here would be measuring the fixture, not the archive.
  Needs a Docker daemon; nothing runs it automatically (recorded in `deferred-work.md`).
- Mutation checks for the read path: drop game 7 from an archived fixture and confirm the
  Active/Historical split test goes red (the helper is load-bearing, not decorative); make
  `seriesListLoaded` a no-op and confirm the empty-state test goes red; revert
  `HistoricalPage.tsx:42` to `.eq('status','historical')` and confirm
  `historical-page-archive.test.tsx` goes red (it did, post-fix — before the suite existed the
  whole gate stayed green).

**Manual checks:**
- With nothing pending, the picker's Active group shows the empty-state line and the archive link,
  and the decade card for a fully-archived year reads `View Series`.
