# Surface inventory — every line this story moves

Companion to `SPEC.md`. The rule that makes this a contract rather than a hint: **the adapter and the workflow re-point land in the same commit.** A build that ships `espn` while `pipeline-inseason.yml` still defaults to `nba_com` has shipped a cadence that cannot fetch, and a build that flips the default without the `describeRun` declaration has quietly disarmed `--require-feed`.

## New files

| Path | Role |
|---|---|
| `supabase/scripts/pipeline/adapters/espn.ts` | the adapter: request builder, parse, exclusions, `describeRun`. Sits beside `nbaCom.ts` and follows its discipline — a shape it cannot read is an error naming the game, never a default. |
| `tests/pipeline/espn-adapter.test.ts` | fixture-driven, offline. Covers CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7. |
| `tests/pipeline/fixtures/espn-*.json` | **Four verbatim captures, committed 2026-10-04, untrimmed**: `espn-teams-site-20261004.json` (the 30-franchise table `00018` seeds from), `espn-teams-core-20261004.json` (the `$ref` pointer list that is not a table), `espn-scoreboard-20250503-game7.json` (one real Final Game 7), `espn-scoreboard-20250504-mixed.json` (a Game 7 whose home side lost, plus a Final Game 1 to exclude). Fetched by an agent only under the owner's one-off release of the no-agent-fetch rule — see `payload-contract.md` "Where the seed comes from". No test reaches the network. |
| `scripts/probe-espn-adapter.mjs` | the owner-run live leg, in the `scripts/probe-nba-com-adapter.mjs` precedent: one named date, prints the field coverage and the 30-franchise code table, exits non-zero on a shape it cannot read. Unchecked by any gate step (root `scripts/*.mjs` still are, per AGENTS.md) except the in-test `node --check` smoke the other probes use. |
| `supabase/migrations/00018_teams_espn_code.sql` | `ALTER TABLE teams ADD COLUMN espn_code text`, a `CHECK (espn_code IS NULL OR espn_code ~ '^[A-Z]{2,4}$')` added through `DO $$` (so the constraint name is stable), a partial unique index `WHERE espn_code IS NOT NULL`, the 30 seed `UPDATE`s read off the committed capture, and four raise-to-abort post-condition guards (30 seeded / 30 distinct / the six divergences on their franchises / nothing outside ids 1–30 coded). Additive; no `teams` row is inserted, so `EXPECTED_TEAM_COUNT = 59` in the rehearsal is untouched. |

## Changed files

| Path | Line | Move |
|---|---|---|
| `supabase/scripts/pipeline/port.ts` | `ADAPTER_REGISTRY` | add `espn` with `hasRunReport: true`; keep `nba_com` registered and hand-runnable, keep `fantrax` as the recognised-name refusal (C1) |
| `supabase/scripts/pipeline/run.ts` | pre-landing `:311` `teamIds`, `:315` `teamIdByAbbreviation`; landed at `:316`, `:332`, with the new `espn_code` map at `:326` and its resolver at `:333` | the resolver the ESPN adapter gets must key on `espn_code`, not `abbreviation` — same refusal semantics (`unknown team abbreviation …`), different column. Which column each adapter resolves through is a per-adapter fact; nothing about the shared map may silently apply to both. |
| `.github/workflows/pipeline-inseason.yml` | pre-landing `:44` dispatch description, `:47` choices, `:50` default, `:113` `PIPELINE_SOURCE` fallback, `:134` alarm copy; landed at `:54`, `:57-60`, `:61`, `:124`, `:145` (the header comment this story rewrote is longer, so everything below it slid) | `nba_com` → `espn` in all five. The alarm-copy sentence names the source that returned 0 series, so it moves with the default or it lies. |
| `.github/workflows/pipeline-offseason.yml` | pre-landing `:77` log line, `:78` `--source=nba_com`; landed at `:85` and `:86` | → `espn`. The absence of `--require-feed` here stays exactly as it is — that omission is 2.6's design decision, not an oversight. |
| `tests/pipeline/workflows.test.ts` | the source pins and the pinned workflow-name list | re-pointed with the YAML in the same commit; the name list stays at six entries (the two throwaway probes are already retired). |
| `scripts/rehearse-migration-00014.mjs` | `COVERED_THROUGH` (`:147`, now `18`) | extends through `00018`, and section 7 (`:1520` onward) is the coverage: the additive column, the shape CHECK, the negative proof that a duplicate non-null `espn_code` fails the partial unique index, and each of `00018`'s four guards observed firing. `EXPECTED_TEAM_COUNT = 59` (declared in `venueBackfill.ts`, asserted at `:321`, re-read at `7a`) is untouched — no `teams` row is inserted. |
| `_bmad-output/implementation-artifacts/seriesdatasource-port.md` | `:81-82` registry line, plus a new adapter section | `manual_csv \| fantrax \| nba_com \| espn`, with `espn` marked the scheduled source and `nba_com` hand-run only. |
| `docs/CURRENT_DATA_MODEL.md` | `teams` | the new column, in the same commit as the migration. |
| `_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md` | AD-5's adapter list | already amended by the change proposal (P3); verify it names `espn` and the `espn_code` join rule rather than abbreviation-equality. |
| `_bmad-output/specs/spec-2-6-scheduled-pipelines/failure-modes.md` | mode 2 | carries the proposal's re-point: under `espn` the `Counter=1000` mechanism dies but the class survives — a short postseason that parses as valid. Story 2.7's row-count-vs-bracket read stays the detector. |

## Deliberately untouched

The **bracket** and the three-lines-for-one-bracket shape (D-5), the `notify-failure` composite, the dedupe and concurrency group, `--require-feed`'s design (D-3), `nightly-gate.yml`, `decisions.md` D-1..D-7 verbatim (D-5 gains an amendment line, not a rewrite — `schedule-amendment.md`), `nbaCom.ts` and `rounds.ts`'s canonical labels, every `src/**` file (no UI surface changes), `supabase/functions/**` (no deploy of any kind), and `00016`/`00017` semantics.

## Schedule amendment — the five lines this call adds (owner, 2026-10-04)

Moved by owner call on 2026-10-04: the slot goes `09:30 UTC → 07:30 UTC`, and `keepalive.yml`
goes `0 9 * * * → 0 7 * * *` with it so the pipeline stays after the warm-up ping — the one reason
D-5 recorded for the minute (`decisions.md:65`). Argued in `schedule-amendment.md`, including the
margin it trades away.

| Path | Line | Move |
|---|---|---|
| `.github/workflows/keepalive.yml` | `:5` | `0 9 * * *` → `0 7 * * *` |
| `.github/workflows/pipeline-inseason.yml` | `:30-32` | `30 9 16-30 4 *` / `30 9 * 5 *` / `30 9 1-30 6 *` → the same three with `30 7`; day-of-month and month fields unchanged |
| `.github/workflows/pipeline-inseason.yml` | `:11-13` | the comment names the new pair and the reason for it; a comment that still says "09:30 … follows the 09:00 keepalive" would be the file lying about its own schedule |
| `.github/workflows/pipeline-offseason.yml` | `:19-20` | `30 9 12 4 *` / `30 9 25 6 *` → `30 7 …` |
| `tests/pipeline/workflows.test.ts` | `:98` title, `:103`, `:142` | cron pins move to `30 7`; the test title's "at 09:30 UTC" moves with it |

The same minute is quoted in prose in `spec-2-6-scheduled-pipelines/SPEC.md:77`, its
`failure-modes.md:13` (mode 7), and `epic-2-context.md:51`; each gets an amendment annotation
rather than a silent rewrite, because those lines are also the record of what was decided on
2026-10-03. `epics.md:438`'s "live hazard for the 09:30 UTC cron" stays as written — it is a
2026-10-03 finding about the `dates=` local-date semantics, and the hazard is identical at 07:30.

## Evidence already banked, not to be re-collected

The egress question is closed: `stats.nba.com` 0/15 across two providers and three client stacks, `cdn.nba.com` `403` from both, ESPN `200` from both (hosted 78 ms, Supabase 226 ms, confirming run `37119291248`). Four-cell table and per-round verdicts are in `deferred-work.md` — read them rather than re-probing. What CAP-8 was owed — the 30-franchise code table — is now committed bytes rather than an inference (see `payload-contract.md`), and the two Game-7 admission shapes are replayed from captures in `npm test`. The scheduled-environment half closed on 2026-10-04: run `37235646137` is a hosted, non-dry `--source=espn --require-feed` run through the shipped adapter's own URL builder, headers, `America/New_York` date derivation and `readTeams` against the applied column, exiting 0 (`payload-contract.md` carries what its payload was). Still unproven: the shape of a game that is not finished (`in`/`pre`, or any `description` but `Final`), the write leg — which is Story 2.7's drill, not a dispatch — and a probe-leg run of `scripts/probe-espn-adapter.mjs` itself from a runner, which is now a confirmation leg rather than a discovery one.
