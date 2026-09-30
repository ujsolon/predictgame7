---
title: 'Story 2.3 — Pipeline runner + SeriesDataSource port + manual_csv floor'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7fcd847'
story: '2-3-pipeline-runner-seriesdatasource-port-manual_csv-floor'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/decision-2-1-q-4-data-source.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-schema-prerequisites-derived-phase-on-the-read-path.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing in this repo can write a series. `docs/CURRENT_DATA_MODEL.md:28` names
`(year, team_a_id, team_b_id)` as "the upsert conflict target the Epic 2 pipeline upserts against",
but the only loader that exists (`supabase/scripts/load-games/main.py:60`) blind-inserts into
`game_sevens`, a table 00013 moved to `archive` and nothing reads — so it is broken today and it is
the wrong shape anyway (winner-oriented `game_N_score_a/b`, no home/away). Active Series updates are
manual, and Story 2.2's derived phase is only worth shipping if something can put reconciling rows
in idempotently.

**Approach:** a runner under `supabase/scripts/pipeline/` that reads series and game scores through
one documented `SeriesDataSource` port, with `manual_csv` as the adapter that ships now — the floor
that works regardless of what Story 2.1's spike concludes. The runner turns source rows into a
*plan* (birth at a certified 3–3, completion when game 7 arrives, skip when nothing changed),
asserts the plan against AD-5's identity rule and AD-4's derivation invariant **before** writing
anything, and exits non-zero rather than writing a shape the read path would have to exclude.
Story 2.4 swaps in an automated adapter behind the same port; nothing about the runner knows which
adapter produced its rows.

## Decisions

1. **TypeScript under `supabase/scripts/pipeline/`, wired into the local gate** (owner call
   2026-09-30). A new `tsconfig.pipeline.json`, referenced from the root `tsconfig.json`, includes
   `supabase/scripts/pipeline` and `tests` so `npm run typecheck` covers the runner; Biome's
   `files.includes` gains `supabase/scripts/**/*.ts`; `tests/pipeline/*.test.ts` is already matched by
   `vitest.config.ts:16`. `@types/node` becomes a declared devDependency (present transitively at
   25.9.1, undeclared before). This is the answer to `deferred-work.md:223-225`, which says Story 2.3
   must name its checker rather than leave Story 2.0's AC-269 reading as closed.
2. **Completion atomicity comes from migration `00015`: one `SECURITY DEFINER` RPC per operation**
   (owner call 2026-09-30). Birth and completion each execute as a single function call, so their
   statements share one transaction and the "in one transaction" AC is literally met. `EXECUTE` is
   granted to `service_role` only, revoked from `public`/`anon`/`authenticated`. The identity key
   remains `(year, team_a_id, team_b_id)` and the scores key remains `(series_id, game_number)`; the
   `ON CONFLICT` target moves from the client into SQL. The agent never applies it — rehearsal runs in
   the throwaway Docker Postgres (existing harness replays every migration in order and can call the
   functions with `psql`), and the owner holds the production command, exactly as with 00014.
3. **`manual_csv` is a long-format CSV, one row per game, committed** at
   `supabase/scripts/pipeline/data/series_manual.csv`, with teams referenced by
   `teams.abbreviation` (UNIQUE) and resolved to ids at runtime. Game 7 is one appended line, and a
   committed file is what Story 2.6's CI workflow can read.
4. **The legacy loader is retired in place:** `supabase/scripts/load-games/main.py` and its committed
   `venv/` are deleted, `data/NBASeriesResults.xlsx` stays for provenance, and the retirement is
   stated in `docs/CURRENT_DATA_MODEL.md`.

## Boundaries & Constraints

**Always:**
- `SERIES_SOURCE` selects the adapter, default `manual_csv`; an adapter name that is recognised but
  not implemented (Story 2.4's) fails loudly and never falls back silently.
- Conflict targets are exactly what AD-5 fixes: `series` on `(year, team_a_id, team_b_id)`
  (`series_year_team_pair_key`) and `series_game_scores` on `(series_id, game_number)`
  (`unique_series_game`, `00005:55`).
- The identity assertion checks the pair **in either slot order** before inserting, because the
  UNIQUE guards the pair as stored and cannot enforce the `team_a` = game-1-home convention
  (Story 2.1 measured it 178/178 with `team_a_id > team_b_id` in 80).
- The derivation invariant is asserted pre-commit: a winner implies seven decided score rows, a null
  winner implies exactly {1..6} with a 3–3 split. Reuse `deriveSeriesPhase` (`src/lib/series-phase.ts`)
  for the reconciliation half rather than restating it.
- `service_role` comes from the environment only, under a non-`VITE_*` name (NFR-S1); reads may use
  it too, but the runner never accepts an anon key for writes.
- Any failure — bad row, unknown team, unimplemented adapter, missing env, rejected write — exits
  non-zero with a message naming the offending row.
- Dry-run issues zero writes.
- The port method names stay verbatim from AD-5 (`fetch_series_statuses`, `fetch_game_scores`) so the
  spine and the code cannot diverge.

**Never:**
- No scheduling, no CI workflow, no notification (Story 2.6). No automated adapter, no round
  vocabulary derivation (Story 2.4). No insights refresh (Story 2.5).
- The agent never runs the runner against production and never applies a migration: no `supabase db
  push`/`db reset`/`db start`, no `psql` at the linked project — `supabase/.temp/project-ref` **is**
  production.
- No step writes `series.status` (the column is gone as of 00014) or derives phase from dates or
  `created_at` (AD-4). No new migration of `series`/`series_game_scores` DDL beyond what an approved
  Decision says.
- Earlier migrations are not edited. `src/**` read paths are not edited except by importing the
  shared derivation; no new PostHog event name and no change to `series_source` values.
- No wagering/odds/guaranteed-pick mechanics of any kind.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Certified 3–3, new | source has one series, games 1–6 all decided, 3 wins each, no winner | birth: one `series` row plus its six `series_game_scores` rows | N/A |
| Same input re-run | the rows above already exist | plan is empty; zero writes; exit 0 | N/A |
| Game 7 arrives | existing pending row; source now has game 7 and a winner | completion: game 7 appended and `winner_team_id` filled — atomically per Decision 2 | a failure mid-completion leaves the row non-reconciling, excluded and reported by Story 2.2's read path, repaired by the next run |
| Slot-swapped pair | `series` already holds `(2027, B, A)`; source says `(2027, A, B)` | identity assertion fires **before** any write | exit non-zero, nothing written, message names the row |
| Impossible shape | winner with six rows, or game set {1,2,4,5,6,7}, or a tie score | invariant assertion fires | exit non-zero, nothing written, message names the row |
| Unknown team | CSV abbreviates a team `teams` does not hold | plan refused | exit non-zero naming the abbreviation and the row |
| Unimplemented adapter | `SERIES_SOURCE=nba_com` | runner refuses to start | exit non-zero: "not implemented (Story 2.4)", never a silent `manual_csv` fallback |
| Missing key | no service-role env | runner refuses to start | exit non-zero naming the variable, not its value |
| Dry-run | any of the above plans | prints the planned writes and the row counts | writes zero rows |

</frozen-after-approval>

## Code Map

- `ARCHITECTURE-SPINE.md:93-97` (AD-5) -- fixes the port name and its two methods, the
  `SERIES_SOURCE` adapter list, both conflict targets, the either-slot-order assertion, and
  "non-zero exit … never partially applied silence". `:78-91` (AD-4) -- birth only at a certified
  3–3, atomic birth and completion, "the runner asserts before commit and exits non-zero… No
  trigger". `:179` -- dry-runs use `manual_csv` against a transaction-wrapped preview. `:153`, `:201`
  -- the language is the spike's call. `:173` -- `load-games/` is "legacy precedent".
- `epics.md:335-354` -- Story 2.3's ACs verbatim, including the default (`manual_csv`), the
  "3–3 split" invariant wording (`:349`), the port doc location (`:353`), and the retire-or-fix AC
  (`:354`). `epics.md:386-400` -- Story 2.6 owns workflows, SM-4 notification, and the operator
  cadence ("owner edits the CSV daily before 09:00 UTC"); 2.3 stops at the runner.
- `supabase/migrations/00005_release_1_data_model.sql:26-38,41-56` -- `series` (`id UUID
  gen_random_uuid()` never client-set; NOT NULL `year, round, team_a_id, team_b_id`; nullable
  `winner_team_id`; `chk_series_teams_different`) and `series_game_scores` (`series_id` FK
  `ON DELETE CASCADE`; `game_number` CHECK 1–7; scores CHECK `>= 0`; `chk_home_away_different`;
  `unique_series_game UNIQUE(series_id, game_number)` = the scores conflict target).
- `supabase/migrations/00014_series_identity_and_drop_status.sql:27-36` -- `series_year_team_pair_key
  UNIQUE (year, team_a_id, team_b_id)`; `status`, its CHECK and its default are gone, so a writer
  literally cannot write phase.
- `supabase/migrations/00011_enable_rls_on_public_release_tables.sql:9-10,40-44,57-61,83` -- both
  tables have SELECT-only public policies; every write needs the privileged role.
- `supabase/migrations/00013_archive_legacy_tables.sql` -- moved `game_sevens` to `archive`, which is
  why `main.py:60`'s `client.table("game_sevens")` insert 404s today.
- `supabase/scripts/load-games/main.py` -- :13-14 reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  via `dotenv` from the repo root `.env`; :17 hardcodes `data/NBASeriesResults.xlsx`; :24 filters
  `Total games == 7`; :36-57 builds a winner-oriented record with no home/away; :60 blind
  `.insert()` per row (not idempotent); :71-73 manual `python main.py`. Referenced by nothing in
  `package.json`, `.github/workflows/*`, `docs/**` or `README.md`.
- `src/lib/series-phase.ts:23-59` -- `SeriesPhaseInput = Pick<Series,'winner_team_id'|
  'series_game_scores'>`, `deriveSeriesPhase` (set-based `coversExactly`, `null` when neither shape),
  `isSeriesPending`. Platform-free and `src/types/types.ts` imports nothing, so the runner can import
  the one derivation instead of restating it (needs the `@/*` alias in the pipeline tsconfig under
  Decision 1).
- `src/types/types.ts:12-38` -- `Series`/`SeriesGameScore` row shapes the plan writes to; `Team.id
  INTEGER PK`, `abbreviation TEXT UNIQUE` (`:1-10`) is the CSV's team reference.
- `docs/CURRENT_DATA_MODEL.md:17-28` (`series`), `:30-39` (`series_game_scores`; the
  `(series_id, game_number)` UNIQUE and `id`/`created_at` are undocumented), `:76-77` (`archive`
  listing) -- updated in the same commit as whatever the runner writes.
- `scripts/spike-2-1/audit-unique-key.mjs:19-27,35-43,86-87,147-153,156-159` -- the repo's only
  Supabase-from-a-script precedent: hand-rolled `.env` reader, plain `fetch` to PostgREST with the
  anon key, `console.error` + `process.exit(2)`, and success by natural event-loop drain (an explicit
  `process.exit(0)` there raced libuv on Windows and returned 127 — do not reintroduce it).
- `supabase/functions/handle-contact/index.ts:82-85` -- the only privileged client in the repo
  (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`): those are the env names the runner should read.
  Never copy a key into a file; `.env` holds only the four `VITE_*` names today.
- `vitest.config.ts:12-17`, `tsconfig.json` (references), `tsconfig.app.json` (`include: ["src"]`),
  `biome.json` `files.includes`, `package.json:6-15` (gate scripts), `.github/workflows/ci.yml`
  (`node-version: 22.x`) -- the files Decision 1 edits.
- Not touching: `src/pages/**` (Story 2.2 shipped the read path), `supabase/functions/**`,
  `scripts/probe-predict-contract.mjs`, earlier migrations.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/scripts/pipeline/port.ts` -- the `SeriesDataSource` interface with AD-5's method
      names, the row types the adapters return, and the adapter registry keyed by `SERIES_SOURCE`.
- [x] `supabase/scripts/pipeline/adapters/manualCsv.ts` -- read + validate the CSV into port rows;
      resolve team abbreviations to `teams.id` via a supplied lookup.
- [x] `supabase/scripts/pipeline/plan.ts` -- pure: source rows + current table rows -> planned
      births/completions/skips, with the either-slot-order identity assertion and the AD-4 invariant
      assertion (importing `deriveSeriesPhase`).
- [x] `supabase/scripts/pipeline/writer.ts` -- the sink: read current rows, then upsert per the plan.
      Injectable so tests use a fake and no network is touched.
- [x] `supabase/scripts/pipeline/run.ts` -- entry point: env, adapter selection, dry-run flag,
      exit codes, one summary line per planned series.
- [x] `supabase/migrations/00015_pipeline_series_functions.sql` -- Decision 2's two RPCs (birth, completion), each doing its own `ON CONFLICT` and the AD-4 asserts in SQL, `SECURITY DEFINER`, granted to `service_role` only.
- [x] `supabase/scripts/pipeline/data/series_manual.csv` -- a worked example per Decision 3: one
      completed seven-game series and one live 3–3, plus a header comment naming every column.
- [x] `tests/pipeline/*.test.ts` -- the matrix rows above, against the fake writer; a re-run of
      identical input plans zero writes; each assertion names its row.
- [x] The checker wiring Decision 1 names: `tsconfig.pipeline.json` + its root reference + Biome's widened `files.includes` + `@types/node` declared in `package.json`.
- [x] `supabase/scripts/load-games/` per Decision 4: delete `main.py` and `venv/`, keep `data/NBASeriesResults.xlsx`, and state the retirement in `docs/CURRENT_DATA_MODEL.md`.
- [x] `_bmad-output/implementation-artifacts/seriesdatasource-port.md` -- the port contract as the
      doc `epics.md:353` asks for: both methods' signatures, the row shape, the adapter registry and
      env selection, what the runner asserts before it writes, and `manual_csv` as the reference
      implementation with the CSV columns.

**Acceptance Criteria:**
- Given a CSV describing a certified 3–3 that is not on the table, when the runner executes, then one
  `series` row and exactly six `series_game_scores` rows are written and the derived phase of the
  result is `pending`.
- Given the same input a second time, then the plan is empty and zero writes are issued (idempotency
  proven against the fake writer, and guaranteed by `series_year_team_pair_key` + `unique_series_game`
  against a racing run).
- Given `series` already holds the same `(year, pair)` with the slots swapped, when the runner plans
  that row, then it exits non-zero having written nothing.
- Given a source row that cannot reconcile (winner with six games, a game set that is not {1..6} or
  {1..7}, a tie, an unknown team), then the run exits non-zero, names the row, and writes nothing.
- Given a completion (game 7 plus winner) issued as one 00015 RPC call, then either both statements land or neither does, and a rejected write leaves the row exactly as it was.
- Given `SERIES_SOURCE` naming an unimplemented adapter or a missing service-role env, then the runner
  refuses to start with a non-zero exit and never silently falls back.
- Given `--dry-run`, then the planned writes are printed and the sink records zero calls.
- No credential appears in the diff; no file writes `series.status`; no scheduler, notification,
  automated adapter, or insights refresh ships from this story.
- `npm run gate` green, run bare with its own exit code read — now including the runner's lint, type-check and unit tests.

## Implementation Notes

Shipped under Decision 1's TypeScript wiring. Files created/edited (relative to `baseline_commit 7fcd847`):

- `supabase/scripts/pipeline/port.ts` — `SeriesDataSource` with the verbatim AD-5 method names
  `fetch_series_statuses` / `fetch_game_scores`; the `SeriesStatusRow` / `GameScoreRow` shapes; the
  `ADAPTER_REGISTRY` keyed by `SERIES_SOURCE` (`manual_csv` implemented, `fantrax`/`nba_com`
  recognised-but-unimplemented); `assertAdapterImplemented` + `createAdapterSource`; `DEFAULT_ADAPTER_NAME='manual_csv'`.
- `supabase/scripts/pipeline/adapters/manualCsv.ts` — `parseManualCsv` (two-pass: group by
  `(year, min/max team id)`, slots fixed by game 1's home/away; any row order accepted) and
  `createManualCsvAdapter`. Rejects and names the offending `source:line` for: bad header/column
  count, non-integer or negative fields, game outside 1..7, same-team games, ties, unknown team
  abbreviation (message carries the abbreviation + `source:line`), round clash within a series,
  duplicate game_number, and a missing game 1.
- `supabase/scripts/pipeline/plan.ts` — pure `planPipeline(sources, current)` + `groupSourceRows`.
  Source self-duplicate guard (either slot order) → per source exact/swapped lookup (swapped-only →
  identity assertion throw) → `validatedShape` (ties, slots, duplicate game numbers, and the AD-4
  game-number-SET reconciliation reused via `deriveSeriesPhase`, plus the 3–3 split and
  winner==game-7-winner) → birth / completion / skip branches. Divergences throw rather than
  rewrite stored games or an archived outcome; a half-written null-phase row is repaired through the
  completion path when the source agrees.
- `supabase/scripts/pipeline/writer.ts` — `PipelineSink` interface (`readTeams`, `readCurrent`,
  `birth→Promise<string>`, `complete`) + `createSupabaseSink` that calls the two 00015 RPCs
  (`pipeline_birth_series`, `pipeline_complete_series`) via `supabase-js` with `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`. `scorePayload` sends the 5-field jsonb the RPC validates.
- `supabase/scripts/pipeline/run.ts` — entry: parse `--dry-run` / `--source=` / `--csv=` flags →
  `assertAdapterImplemented` (before any secret read) → require env (message names the variable, never
  the value) → build sink → teams map → load adapter rows → `groupSourceRows` → `readCurrent` →
  `planPipeline` → describe plan → (dry-run: zero writes) → apply births (+ follow-up completion using
  the returned id) and completions. Failures set `process.exitCode = 2` (no `process.exit`, per the
  Windows libuv spike precedent). `deriveSeriesPhase` and the port are imported with relative `.ts`
  paths so Node's native type-stripping resolves them (it does not read tsconfig `paths`).
- `supabase/scripts/pipeline/data/series_manual.csv` — the worked example: 2016 Finals GSW/CLE
  (seven games → birth-then-completion) and a 2027 OKC/DEN live 3–3 (six games → pending), with `#`
  comments naming every column. Teams referenced by `teams.abbreviation`, resolved at runtime.
- `supabase/migrations/00015_pipeline_series_functions.sql` — the two `SECURITY DEFINER` RPCs
  (search_path pinned): birth asserts AD-4 (six games {1..6}, decided, 3–3) + AD-5 identity (either
  slot order) in SQL and upserts through `series_year_team_pair_key` / `unique_series_game`;
  completion validates game 7 against the stored row, is idempotent on identical replay, and refuses
  to overwrite an archived outcome. `EXECUTE` to `service_role` only; revoked from public/anon/authenticated.
- `tests/pipeline/{plan,manual-csv,run}.test.ts` — 39 tests, all green: the full plan matrix against
  the fake sink (no network), the committed-CSV parse, and the runner end-to-end (apply, re-run zero
  writes, dry-run zero calls, rejected-write exit 2, unimplemented/unknown adapter refusal, missing
  env naming the variable not the value, `VITE_*` rejected, unknown team aborts before writing,
  slot-swapped stored row exits 2 having written nothing, derived pending/archive via the shipped helper).
- Checker wiring: `tsconfig.pipeline.json` (new, `erasableSyntaxOnly`, `types:["node"]`, covers
  `supabase/scripts/pipeline` + `tests`), referenced from `tsconfig.json`; Biome `files.includes`
  widened to `supabase/scripts/**/*.ts`; `@types/node` added to devDependencies + lockfile.
- Legacy loader retired (Decision 4): `supabase/scripts/load-games/main.py` removed (staged) and
  `venv/` deleted; `data/NBASeriesResults.xlsx` kept; retirement documented in
  `docs/CURRENT_DATA_MODEL.md`. The 00015 write-path + `series_game_scores` id/created_at/conflict-target
  notes were added to the same doc, and the port contract documented in
  `_bmad-output/implementation-artifacts/seriesdatasource-port.md`.
- `.gitignore` gained a `!supabase/scripts/pipeline/data/` negation so the committed CSV is tracked
  despite the blanket `data` rule (`git check-ignore` confirms it no longer matches).

Verification run (see Verification): `npm run gate` green bare (lint + typecheck + 192 tests + build);
`npx vitest run tests/pipeline` 39/39; `node scripts/rehearse-migration-00014.mjs` (throwaway Docker
Postgres) replays 00001..00015 and exercises both 00015 RPCs — birth idempotency, 4-2/tie/gapped-set
rejections, completion atomicity, idempotent replay, wrong-winner and archive-restyle rejections, and
`service_role`-only EXECUTE — all green; the safe entry smoke test
`node supabase/scripts/pipeline/run.ts --source=nba_com` exits 2 with the unimplemented-adapter refusal
and no secret read; all three spec mutation checks reddened the intended test and were reverted.
Not run (owner-only, needs a real service-role key): the live `--dry-run` against `SUPABASE_URL`.

## Spec Change Log

- 2026-09-30 (post-review): no frozen Decision, AC or Boundary changed — review produced no
  intent_gap or bad_spec entry, so no re-derivation loopback ran. Frontmatter only: `status` →
  `in-review`, and `story` corrected to `2-3-pipeline-runner-seriesdatasource-port-manual_csv-floor`
  to match the `sprint-status.yaml:50` id (the file name keeps its hyphens; nothing references it).
  `supabase/scripts/load-games/requirements.txt` is still the owner's call (see the open question above).
- 2026-09-30 (owner decision, closing the story): the owner declined an independent review of the diff
  for bandwidth reasons, so the same-model in-session review above is the only review this build has
  had — recorded plainly rather than presented as a completed review gate. Status set to `done` at
  the owner's instruction, with `2-3-...manual_csv-floor` moved to `done` in `sprint-status.yaml`.
  Still open on the owner, none of them blocking this story: the three `deferred-work.md` entries
  (00015 apply + rehearsal automation → Story 2.6; `epics.md:352` dry-run rewording; the
  slots-not-venues archive question → Story 2.4), and the `requirements.txt` deletion call above.
  `00015` remains unapplied — the story is done in code, not in the database.

## Review Triage Log

Layers run on `%TEMP%\story-2-3-review.diff` (baseline `7fcd847`, 23 sections as the layers read it;
the file was rewritten after patching to the 25-section final tree): blind-hunter,
edge-case-hunter, verification-gap. Verdicts rendered after verifying each claim in the files or by
measurement — not from the reports. Every patch below re-verified: `npm run gate` exit 0 (201 tests,
18 files), `node scripts/rehearse-migration-00014.mjs` exit 0 (28 `ok` lines).

**Patched — caused by this change, fixed in this pass.**

- **high** [edge-case + blind-hunter] `plan.ts:215-245`: the winner branch checked seven decided rows
  whose game-7 winner matches `winner_team_id`, but never that games 1-6 split 3-3 — so a source row
  describing a 4-2 series that ended in game 7 was planned as a legal birth+completion, a shape the
  read path derives to `null` and excludes. Verified: `teamAWins !== 3` guarded only the null-winner
  branch. Fixed at `:224-232` (impossible-shape throw naming the real split) and mirrored in 00015's
  birth guard; covered end-to-end (`run.test.ts:269-287`, zero writes) and in the rehearsal (`ok a 4-2
  split over six games is not a certified 3-3 and is rejected`).
- **high** [verification-gap] `run.test.ts:60-90`: the fake sink accepted any six score rows, so it was
  strictly more permissive than the RPC it stands in for — a plan bug that produced a non-3-3 or a
  gapped birth passed the whole local gate. Pre-verified as filed: nothing in `tests/pipeline` could
  redden it. Fixed: `FakeSink.birth` now re-derives 00015's checks (`coversOneToSix`, decided,
  `teamAWins === 3`) and throws the RPC's own message; `FakeSink.complete` refuses a game 7 that
  differs from the stored one.
- **high** [verification-gap] `writer.ts:101-124` ↔ 00015 parameter names: `client.rpc(name, params)`
  binds by **named** Postgres parameters, so a payload key that drifted from `p_year`/`p_scores` would
  fail only in the owner's hands. No local test can see it. Pre-verified as filed. Fixed by executed
  evidence: `rehearse-migration-00014.mjs:342,405` now call both RPCs in named notation
  (`p_year => …`) against the replayed 00015 schema, and the contract is stated in
  `seriesdatasource-port.md` §Writes.
- **medium** [edge-case] `plan.ts:185-200`: AD-5's `team_a` = game-1-home convention was documented in
  the port as adapter-obligation but never asserted, so any future adapter that returned the pair in
  the other order produced a row the either-slot check cannot see (it compares against the table, not
  against the game rows). Fixed: `gameOne.home_team_id !== status.team_a_id` throws naming both ids;
  `plan.test.ts` case added.
- **medium** [edge-case] `plan.ts:310-330`: if the table ever held mirror rows for one pair in both
  slot orders, the matcher took the exact-order row and wrote against half the truth silently. Fixed
  at `:318-323` — the pair of ids is named and the run aborts; `plan.test.ts` mirror-twins case added.
- **high** [blind-hunter] `run.ts:105-115`: `--dry-run` was matched with `argv.includes`, so
  `--dry-run=true` — the form most operators reach for — parsed as *not* dry-run and the run wrote to
  production while the flag looked ignored. Verified: nothing rejected an unrecognised `--` token.
  Fixed: `unknownFlag()` (`:60-62`) refuses any stray flag with exit 2 before the sink exists;
  `run.test.ts` case asserts `/unrecognised flag/` and zero writes.
- **medium** [blind-hunter] `run.ts:119`: an empty or whitespace `SERIES_SOURCE` (the state a CI
  secret left unset produces) was passed through as `''` and failed the registry with an unhelpful
  "unknown adapter" — the boundary said un-set means the floor. Fixed: `?.trim() || DEFAULT_ADAPTER_NAME`;
  flag `--source=` still wins, tested.
- **low** [blind-hunter] `run.ts:92`: the dry-run/apply row total counted `birth.scores.length` only,
  so a birth that immediately completes under-reported by one row per finished series. Fixed —
  `+ (birth.followup ? 1 : 0)`; assertion updated to the measured 13.
- **medium** [edge-case] `00015_pipeline_series_functions.sql:67-71,96-100`: `p_round` satisfied
  NOT NULL as spaces (an empty display label reaching the picker), and a `p_scores` array of the wrong
  length escaped into a bare `null value in column "game_number" violates not-null constraint` from the
  insert, which names no series. Fixed with `btrim(p_round) = ''` and `jsonb_array_length(p_scores) <> 6`
  guards; both rehearsed (`ok a blank round label is rejected…`, `ok a payload that is not six elements
  long is rejected on the raw array…`). The migration is unapplied, so editing it is free.
- **medium** [verification-gap] `run.test.ts:26-43`, `manual-csv.test.ts:13-17`: suites asserted against
  `data/series_manual.csv` — the file whose contents change every playoff window by design — so the
  gate's color depended on production data. Fixed: suites pin their own `FIXTURE_CSV`/`EXAMPLE_CSV`,
  and the one test that *should* read the operator file asserts the opposite (committed file plans
  `0 birth(s), 0 completion(s), 0 skip(s)`).
- **medium** [verification-gap] `biome.json:includes`: Decision 1 put the runner's tests under the
  local gate, but `tests/**` was not in Biome's allowlist — the spec's "lints, type-checks and
  unit-tests the runner" claim covered only the source. Fixed: `tests/**/*.{js,jsx,ts,tsx}` added; the
  newly-covered suites lint clean (117 files checked, no fixes needed).
- **medium** [blind-hunter] `docs/CURRENT_DATA_MODEL.md`: the retirement paragraph claimed
  `data/NBASeriesResults.xlsx` and the loader's `venv/` "stay in the repo for provenance". Measured:
  `git ls-tree -r HEAD -- supabase/scripts/load-games` lists only `main.py` and `requirements.txt` —
  `.gitignore:5` (`venv`) and `:6` (`data`) excluded the other two from the first commit, so the
  sentence pointed the owner at files no clone carries. Corrected in place, and the
  operator-file/example-file split documented.
- **medium** [edge-case] `seriesdatasource-port.md:70-75`: claimed the 00015 birth RPC "repeats this
  check in SQL for the racing-run case". Read the SQL: the swapped-order guard is an unlocked `EXISTS`
  (`00015:76-85`), so it catches a committed twin, not one mid-insert. Reworded to state the real
  limitation — concurrent runs are safe only under a single writer, which Story 2.6's schedule is.
- **low** [blind-hunter] `plan.ts`: `plannedFromGameRow()` was unreferenced after the birth/completion
  payloads moved to `scorePayload`. Deleted.
- **low** [blind-hunter] `sprint-status.yaml:50` carried `in-progress` while the spec was review-ready;
  the spec's `## Review Triage Log` was empty. Both corrected in this pass.

**Deferred — written to `deferred-work.md` with a named home.**

- **medium** [edge-case] The epics' dry-run wording (`epics.md:352`, "transaction-wrapped session")
  cannot be met by a PostgREST client, and the approved spec's frozen Decision 2 + Boundary
  ("Dry-run issues zero writes") is what shipped. Not a code defect; the planning artifact needs the
  owner's rewording, and `epic-2-context.md:43` was corrected to describe the mechanism as built.
- **medium** [verification-gap] No automated step applies 00015 or re-runs the rehearsal — same shape
  as Story 2.2's deferred item, now widened: the replay harness covers 00001..00015 but nothing runs
  it. → Story 2.6's CI workflow.
- **high** [edge-case + blind-hunter] The archive's `series_game_scores` carry slots, not venues:
  measured this pass over the live table (178 series / 1,246 game rows) — in 177 series every game names
  `team_a` as home, in 0 do they name `team_b` throughout, 1 varies. That makes AD-5's
  "178/178 = game-1 home" evidence vacuous (the archive was written from the convention, not from box
  scores) and blocks Story 2.4's venue-correct adapter from reconciling historical rows. → Story 2.4
  inherit list + owner decision; documented in `docs/CURRENT_DATA_MODEL.md`.

**Rejected — with reason.**

- [edge-case] `tsconfig.pipeline.json`'s `paths: { "@/*": ["./src/*"] }` is unused dead config:
  **false, and the fix broke the gate.** Removing it reddened `tsc -b` with
  `src/lib/series-phase.ts(15,29): error TS2307: Cannot find module '@/types/types'` — `plan.ts`
  imports that shared derivation, so the file joins the pipeline program, where it needs the mapping.
  Restored with a comment saying why.
- [blind-hunter] `readCurrent()` can hit PostgREST's 1,000-row page cap and silently truncate the
  archive: measured false — `limit=2000` returns all 178 series rows today, and the embedded score
  rows ride those 178.
- [blind-hunter] The `run.ts` module-entry self-check is a silent no-op if imported rather than run:
  unreachable in the documented command (the module is an entry point, and no code imports it), and the
  suggested else-log would fire on every test import. Correct-by-design.
- [blind-hunter] 00015's birth `ON CONFLICT … DO NOTHING` versus completion's `DO UPDATE` diverge, and
  two concurrent births could both pass the swapped-order `EXISTS`: real, but `low` — the smallest fix
  is advisory locking, which the spec's "no new DDL beyond an approved Decision" boundary excludes, and
  Story 2.6 schedules exactly one writer. Recorded, not patched.
- [verification-gap] `supabase/scripts/load-games/requirements.txt` is orphaned by the loader deletion:
  already an open owner question in `## Spec Change Log` / Decision 4 names only `main.py` + `venv/`; it
  is the owner's deletion, not the agent's.
- [edge-case] Findings whose only correct fix is to edit this spec's frozen Decisions (e.g. "the port
  doc should list a third method"): rejected by the review rules — the frozen block is the owner's.
## Design Notes

**Plan-then-write, with the sink behind an interface.** The runner's value is that every rule
(identity, invariant, atomicity) is a pure function of (source rows, current rows), so the whole
matrix above is testable without a database. Nothing in this repo can exercise the real PostgREST
write path — no service-role key exists locally, no local Supabase stack, and the agent never touches
production — so the first live evidence is the owner's dry-run and Story 2.7's simulated playoff
week. The spec states that limit rather than claiming the writes are proven.

**Why birth and completion are separate operations.** Birth is a new row plus six score rows, which
one embedded insert can carry; completion mutates an existing row *and* appends one, which is what
Decision 2 is about. Keeping them distinct in the port and the plan means Story 2.4's adapter supplies the
same two shapes and needs no new runner logic.

## Verification

**Commands:**
- `npm run gate` — expected exit 0, read bare (a piped run reports the pipe's status). Per Decision 1 this now lints, type-checks and unit-tests the runner.
- `npx vitest run tests/pipeline` — expected: every matrix row green, and the re-run case asserting
  zero sink calls.
- `node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run` (owner-run,
  needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`) — expected: the plan printed, zero
  rows written, exit 0. The agent does not run this; it is handed over with the command.
- Mutation checks: break the either-slot-order assertion and confirm the slot-swap test reddens; make
  the invariant check count rows instead of the game-number set and confirm the {1,2,4,5,6,7} case
  reddens; make the dry-run flag fall through to the sink and confirm the zero-calls assertion
  reddens.
