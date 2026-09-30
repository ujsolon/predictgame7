# Epic 2 Context: Playoff-Current Active Series

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

During the 2027 playoff window, Active Series reflect the latest results with no manual editing, and the epic still completes even if every automated data source fails. It first closes the server-side quality gate (Deno type-check plus request validation on the Edge Functions), then puts the uniqueness guard and the derived series phase into the schema and read path, builds the pipeline runner behind a swappable data-source port with a spreadsheet floor adapter, refreshes the insights cache from the archive, and schedules the whole thing on GitHub Actions with loud failure. Calendar-critical: automation must be deployed and drilled before April 2027, because stale Active Series would invalidate the release's own traffic measurement.

## Stories

- Story 2.0: Gate the server side — Edge Function type-check and input validation
- Story 2.1: Q-4 data-source feasibility spike (plus the read-only archive audit)
- Story 2.2: Schema prerequisites + derived phase on the read path
- Story 2.3: Pipeline runner + SeriesDataSource port + manual_csv floor
- Story 2.4: Automated adapter per the spike decision
- Story 2.5: Insights cache refresh
- Story 2.6: Scheduled workflows + failure notification
- Story 2.7: Epic verification — simulated playoff week

## Requirements & Constraints

- Active Series appear distinctly from Historical entries and reflect the most recent pipeline run; they change only on the pipeline cadence. Live/in-game scoring is out of scope permanently.
- Archive data stays canonical and internally consistent, and every pipeline run is idempotent — re-running identical input changes nothing. Legacy tables stay archived, never deleted.
- Insight pattern-card values are recomputed server-side from the archive into the cache; no insight arithmetic in the browser.
- Offseason mode initializes/finalizes the postseason bracket idempotently at playoff start and end; inseason mode runs daily inside a configurable window.
- A failed run must be detectable without a human watching: non-zero exit, CI failure notification, logs sufficient to diagnose without local reproduction. If the spreadsheet floor is the inseason source, a documented daily operator cadence replaces the cron guarantee.
- Service-role credentials come only from CI/secret storage — never committed, never in `VITE_*`. Client code reads through the single anonymous client only; all writes stay in Edge Functions or pipeline scripts.
- Supabase free-tier ceilings stay accepted constraints; the existing keepalive workflow is extended alongside, never modified.
- Migration and read-path flip ship in one release, outside a playoff window, with the schema documentation updated in the same commit. Production applies only on the owner's explicit go-ahead, after rehearsal in a throwaway database.
- Every story ends with `npm run gate` green (lint, typecheck, tests, build); type-checking of the Edge Function entry points exists only in CI.
- Product guardrails hold: no wagering, odds, or guaranteed-pick mechanics; no accounts or other Traffic-Gate-blocked surfaces.

## Technical Decisions

- A series' phase is derived, never stored: a null winner means Game 7 pending, a filled winner means archive. Rows are born only at a certified 3–3, born atomically with their six score rows, and completed by appending game 7 and filling the winner in one write. The vestigial stored status column, its check constraint, and its default are dropped, and every consumer reads one shared derivation helper instead.
- The derivation's integrity is enforced by convention plus a defensive read, not by the database: the runner asserts before commit and exits non-zero; the read path excludes and reports a series that does not reconcile rather than guessing it into a group. Phase must never be derived from dates or row creation timestamps.
- Series identity is `UNIQUE (year, team_a_id, team_b_id)`. `round` is deliberately outside the key and ships with no check constraint: `(year, round)` collides in 19 groups of the 178 live rows, and round values carry 17 era-dependent spellings, so keying or gating on it would tie idempotency to free text. The round vocabulary belongs to the adapter, which derives one canonical display value for new rows and never rewrites archived spellings.
- Measured archive facts the builder relies on: 178 series, 1,246 score rows, every series exactly seven, zero anomalies. The team slots carry a convention (first slot is game 1's home team in every row), not a canonical id ordering, so the constraint cannot enforce slot order — the runner asserts the pair is absent in either slot order before inserting, and the adapter maps the higher seed into the first slot.
- The existing five-column identity index is dropped in the same migration that adds the new constraint, since it depends on the removed status column; the replacement constraint is satisfied by all 178 current rows, and the rehearsal in a throwaway database confirms the older backfill's conflict target still resolves at its own point in replay order.
- Source access goes through one documented port with two fetch operations, adapters selected by environment variable, with the spreadsheet adapter as the guaranteed floor. Fantasy Fantrax is ruled out by the spike's evidence — it returns fantasy point totals, not real game scores — and stays recorded as rejected rather than silently dropped. The automated route runs on a free public endpoint as primary plus one keyed provider as alternate, where a vendor key becomes a CI secret and a stated cost decision.
- Pipeline runs as scheduled CI workflows executing scripts under the pipeline scripts directory; the runner language is the spike's call, and any directory left unchecked by the local gate is recorded explicitly rather than quietly passing.
- Server code follows the Edge Function runtime convention, but third-party SDKs come through a prebuilt-types CDN rather than the registry that resolves against this repo's lockfile — the CI type-check step is not hermetic and depends on network egress. Function deploys are ungated by local checks, so probe the deployed function over the wire before blaming client code or calling a story done.
- Insights refresh triggers on an offseason run or a run that fills a winner; the client keeps reading the cache table.

## UX & Interaction Patterns

- With nothing pending, the picker shows an empty, non-breaking Active group carrying the established empty-state line and an onward link to the archive — never an error and never a hidden section.
- Active versus Historical separation is visible to users but has no stored flag behind it: a series enters the Active group because it has six score rows and no winner, and leaves it on the single write that fills the winner.
- The pending-Game-7 highlight on the home surface is a rendered block, not a route; this epic proves only that the data reaches it. Its visual treatment, copy, accessibility floor and responsiveness belong to the sharing epic.
- Verification exercises the derivation with real request/response shapes rather than faked status fields, and notes that the picker query is unfiltered — a seeded row is live to every visitor the instant it exists, so drill data is inserted deliberately.

## Cross-Story Dependencies

- Story 2.0 runs first: it is the server-side gate every later `supabase/` story inherits, and this epic writes the first Deno of the project.
- Story 2.1's spike decides Story 2.4's adapter choice, and its archive audit supplies the measured numbers Story 2.2's migration and Story 2.7's reconciliation assert against. The spike stays at owner review — its measurements are authoritative, its sign-off is still owed.
- Story 2.2's migration must land before any automated writer exists, otherwise the pipeline duplicates rows. Story 2.3's runner builds on that key and on the derivation helper; Story 2.4 swaps in the automated adapter behind the same port while the floor adapter stays available.
- Story 2.5 depends on the runner completing series; Story 2.6 schedules whatever the runner has become and is the notification path Stories 2.3/2.4 fail into; Story 2.7 verifies the chain end to end. Story 2.3 additionally inherits the legacy spreadsheet loader that still writes to an archived table — retire or repair it there, since the floor adapter descends from it.
- Outside the epic: the analytics epic's failure signal and the sharing epic's prerender route list both rest on this epic's derivation and measured archive total — the route list comes from that total plus the owner's featured list, not from arithmetic on older figures. The analytics event property naming the series source is re-derived here with a single owner-local query touch, while the frozen event-name registry stays untouched.
