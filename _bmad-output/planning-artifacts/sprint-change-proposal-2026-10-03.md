# Sprint Change Proposal — the scheduled feed source changes from stats.nba.com to ESPN (2026-10-03)

Status: **approved by the owner 2026-10-03** (calls C1–C4 below, given in-session).
Scope of this document: **planning artifacts + the spec-2-6 record**. One new story (2.13) is created in `epics.md` and `sprint-status.yaml`; it is not built by this pass. The only code-surface changes this pass makes are inside markdown/YAML-quoted text; no workflow, adapter, or migration ships here.

## 1. Issue summary

Story 2.6 shipped its cadence — three inseason cron lines, two offseason edge crons, `--require-feed`, the shared notify composite, the path-filtered migration rehearsal — against `stats.nba.com`, and that endpoint refuses every cloud egress this project can produce. The measurement is a four-cell table, not a single run (all verbatim in `deferred-work.md`, Story 2.6 entries of 2026-10-03):

| Cell | Client | Location | Verdict |
|---|---|---|---|
| GitHub-hosted runner | Node/undici | datacenter | **0 bytes, 9/9** + 2 confirming run controls (**0/15 total** stats reds across the investigation) |
| Supabase Edge Function | Deno | datacenter (AWS pool; `egressIp` moved between runs) | **0 bytes, 3/3** |
| Owner's machine | Node/undici | residential | **PASS 2/2** |
| Owner's machine | curl/schannel | residential | **RST 2/2** |

`cdn.nba.com` returns 403 (Akamai "Access Denied") from **both** clouds, byte-identical — so the refusal is NBA-family-wide, not one endpoint. **ESPN (`site.api.espn.com`) answers both clouds**: 226 ms from Supabase, **78 ms from a GitHub-hosted runner** (confirming run `37119291248`, exit 0, `HOSTED-ESPN GREEN`), with the fields the adapter needs measured on a hosted payload. Both throwaway probes are retired (`930ff2c`); the deployed Supabase function still owes `supabase functions delete feed-egress-probe` (owner).

This is therefore a **feed-source change, not a scheduling change**. D-5 (window crons) and D-7 (un-run cadence) stay closed and untouched. What reopens is Story 2.4's source choice: the balldontlie decision entry's documented reopening trigger — "the feed route breaks" — has fired.

**Five findings from the confirming run bind the new story** (`deferred-work.md`, "CONFIRMED GREEN AND BOTH THROWAWAYS RETIRED"):

1. All four fields `nbaCom.ts` reconstructs a series from exist on a hosted payload: `venue.fullName`, `notes[0].headline` (round **and** game number), `competitors[].homeAway` with per-side `score`, `status.type.description = Final`.
2. `competitions[0].type.shortName` is **absent** — round naming must come from the headline.
3. Date **ranges** are refused (`400` with a JSON error body) — the daily single-date form is the natural shape; a backfill is a bounded loop.
4. `dates=` filters by **US local date, not UTC** — a live hazard for a 09:30 UTC cron and for `--require-feed`'s emptiness test.
5. `team.abbreviation` is **not a safe join key**: ESPN prints `NY`/`SA` where `teams` stores `NYK` (id 20) / `SAS` (id 27). A silent mismatch drops games; `--require-feed` is what turns that into a loud red.

## 2. Impact analysis

| Artifact | Site | Conflict | Resolution |
|---|---|---|---|
| `epics.md` | Epic 2 | no story owns an ESPN adapter; sequence and FR-21 line stale | **P1** — new Story 2.13, sequence `… 2.6 → 2.12 → 2.13 → 2.7`, FR-21 + Epic 2 narrative annotations |
| `prd.md` | FR-21 | Q-4 direction line names Fantrax/nba.com; phase-blocker note reads as live | **P2** — annotation (re-resolved, not re-decided; addendum lifecycle rule) |
| `ARCHITECTURE-SPINE.md` | AD-5, mermaid, Deferred | adapter list lacks `espn`; Deferred still calls the feed leg an open "scheduling-boundary question" | **P3** — AD-5 amendment, diagram label, Deferred bullet settled |
| spec-2-6 `SPEC.md` | CAP-2, CAP-6, Assumptions | "`nba_com`, not `manual_csv`, is the scheduled inseason source" falsified | **P4** — amendment block; CAP-2's green-dispatch proof re-pointed to 2.13 (owner call C3) |
| spec-2-6 `failure-modes.md` | mode 2 | `Counter=1000` is nba_com's mechanism; the class survives under ESPN without the constant | **P6** — annotation |
| spec-2-6 `decisions.md` | — | none: D-3/D-5/D-7 stand verbatim | no edits |
| `.github/workflows/pipeline-inseason.yml` | `:44/:47/:50/:113/:134` | default, dispatch choices and copy name `nba_com` | **P5** — Story 2.13's build |
| `.github/workflows/pipeline-offseason.yml` | `:77-78` | hard-coded `--source=nba_com` | **P5** — Story 2.13's build |
| `tests/pipeline/workflows.test.ts` | pins | pins the nba_com defaults/copy | **P5** — Story 2.13's build |
| `supabase/migrations/` | new `00018` | none exists — the owner's C2 alias mechanism is a schema change | **P1/P8** — inside Story 2.13 |
| `seriesdatasource-port.md` | registry `:82` | `manual_csv \| fantrax \| nba_com` | **P5** — updated at 2.13 build time |
| `sprint-status.yaml` | 2-6, new 2-13 | 2-6 blocked at `review` on a dead source; no 2-13 row | **P7** — 2-6 → done with transfers recorded; 2-13 backlog |
| UX (`DESIGN.md`, `EXPERIENCE.md`) | — | **no coupling** — grep found zero feed-source references | N/A |
| `docs/CURRENT_DATA_MODEL.md` | `teams` | gains a column at 2.13 | standing same-commit rule, recorded in P1's AC |

No epic is invalidated; no epic order changes beyond the 2.13 insertion. Epics 1/3/4/5 are untouched — Epic 4's active-series pages consume pipeline output and are source-agnostic.

## 3. Recommended approach

**Option 1 — Direct Adjustment** (selected). One new adapter story inside Epic 2's existing structure; the shipped scheduling half of 2.6 is exactly what survives, so nothing is rolled back and the MVP is unaffected (FR-20/21 remain achievable; the Traffic Gate does not care which feed answers).

- Effort: **Medium** — an adapter comparable to `nbaCom.ts` (582 lines) + tests + registry + two YAML defaults + a small additive migration.
- Risk: **Medium** — `site.api.espn.com` is unofficial, undocumented Disney infrastructure with no SLA; a shape change can arrive without notice. Mitigation is structural: every failure shape (non-200, non-JSON, missing fields, empty feed, unresolvable team code) lands in Story 2.6's **proven** loud machinery — non-zero exit → deduped issue — which the four red dispatches of 2026-10-03 demonstrated on real breakage.
- Rollback (Option 2) rejected: reverting 2.6 destroys proven work and changes nothing about egress. MVP review (Option 3) rejected: no scope bend is needed.

## 4. Owner calls — decided 2026-10-03 in this pass

- **C1 — `nba_com` disposition: keep registered, disconnect from the scheduled surface.** The adapter stays in the registry and remains runnable by hand (`--source=nba_com` from the owner's machine is the one measured-passing cell), but leaves both workflow files — defaults, dispatch choices, and copy.
- **C2 — alias mechanism: a column on the live `teams` table, per provider.** Not a committed CSV: migration `00018` adds `teams.espn_code` (nullable, unique-where-not-null), seeded for every franchise whose ESPN code diverges from the stored `teams.abbreviation`, and the adapter resolves through the row it already reads. Consequences accepted with the call: a schema change joins the story (owner-applied, rehearsed, `CURRENT_DATA_MODEL.md` same-commit), and the feed join stops being abbreviation-equality — finding 5 is why.
- **C3 — Story 2.6 closes now; CAP-2 re-points to 2.13.** 2-6 flips to `done`. Its green non-dry CAP-2 dispatch is owed by 2.13 (inheriting the run sheet); its three remaining zero-write proof steps (fantrax dispatch, close-#8-and-refire, one migration-rehearsal dispatch) transfer to 2.13's spec and the owner's actions, recorded in `sprint-status.yaml` rather than left implicit.
- **C4 — basketball-reference is the designated automated fallback if the ESPN route breaks; `manual_csv` stays the floor.** Measured reachable from both clouds (200, HTML, ~220 ms). **This pass records the designation only — no scraper is built speculatively.** Implementation is a conditional story, authored if and when the trigger fires (ESPN route breaks, deduped issue + owner decision), because building an HTML-coupled scraper now buys coverage for a failure that has not happened, at scrape-cost and coupling risk. *(This timing is the one judgment call made in this pass rather than by the owner — flag it at review; if the owner wants the scraper built alongside 2.13, that is a second new story, not a widening of 2.13.)*

## 5. Detailed change proposals

### P1 · `epics.md` — new Story 2.13 (full text as applied)

Inserted after Story 2.12. Acceptance criteria carry the five binding findings, C1/C2/C4, and the C3 transfers. See `epics.md` — the applied text is the record; its shape:

- Registry joins `espn`; both workflows' defaults/choices/copy move in the same commit (P5's surface).
- `describeRun` with `feedSeriesCount` declared, so `--require-feed`/CAP-6 work unchanged.
- Team resolution through `teams.espn_code` (`00018`, additive, seeded, owner-applied; rehearsal `COVERED_THROUGH` extended; `CURRENT_DATA_MODEL.md` same commit); an event team that resolves to zero rows aborts the run naming the code — never a silent drop, never a substring/city guess. All 30 modern franchises' codes cross-checked against a live payload in the story's evidence.
- Round naming parsed from `notes[0].headline` into the adapter's canonical vocabulary; archived spellings never rewritten (Story 2.4's rule).
- Request date derived in `America/New_York`, not the runner's UTC (finding 4).
- Single-date form only; backfill is a bounded loop (finding 3).
- Non-`Final` games never enter the plan; the `status.type.state == 'in'` shape is probed in this story, not assumed (never fetched to date).
- Basketball-reference recorded as the designated fallback-of-last-resort, unimplemented (C4); `manual_csv` floor untouched.
- `nba_com` kept registered, off the workflow surface, runnable by hand (C1).
- Inherits 2.6's owed zero-write proof steps and the green non-dry CAP-2 dispatch (C3); issue #8 gets its step-5 close-and-re-fire.
- Adapter tests beside `nba-com.test.ts`; `seriesdatasource-port.md` registry updated same commit; `npm run gate` green.

Also applied: Epic 2 narrative sequence → `2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.8 → 2.9 → 2.10 → 2.5 → 2.6 → 2.12 → 2.13 → 2.7` (+ one sentence naming 2.13 and this proposal); FR-21 inventory line gains a third-resolution annotation; Story 2.7's Given → "Stories 2.1–2.6, 2.12 and 2.13 complete".

### P2 · `prd.md` FR-21 — annotation (old → new)

OLD (tail of the FR-21 consequence):
> Data source direction is set (Q-4: Fantrax API preferred, nba.com scrape fallback) but unverified — a feasibility spike is a build-time prerequisite. `[NOTE FOR PM]` if both fail, FR-21 reopens as a phase-blocker: stale Active Series data during the playoffs would invalidate the Traffic Gate measurement itself.

NEW: unchanged text plus:
> `[Re-resolved 2026-10-03 by sprint-change-proposal-2026-10-03.md: Fantrax was ruled out by the spike (2026-09-30), and the shipped nba_com adapter's endpoint refuses all cloud egress — stats.nba.com 0/15 across two providers and three client stacks, cdn.nba.com 403 from both. The scheduled source is ESPN's site.api.espn.com (Story 2.13), an unofficial endpoint with no SLA whose failure modes land in Story 2.6's proven non-zero-exit → issue machinery. basketball-reference is the designated automated fallback of last resort (owner call C4); manual_csv remains the floor. The phase-blocker note is not invoked — a hosted source exists.]`

### P3 · `ARCHITECTURE-SPINE.md` — three edits

1. Mermaid: `SRC[SeriesDataSource adapters — PORT: fantrax / nba.com / csv]` → `SRC[SeriesDataSource adapters — PORT: espn / nba.com / csv]`.
2. AD-5 rule, OLD: `adapters: `fantrax`, `nba_com`, `manual_csv` (the spreadsheet precedent), selected by env var.` → NEW: `adapters: `espn` (the scheduled source from Story 2.13 — `site.api.espn.com`; `team.abbreviation` is NOT the join key, resolution goes through `teams.espn_code`, owner call C2 of `sprint-change-proposal-2026-10-03.md`), `fantrax`, `nba_com` (registered, off-schedule, hand-run only), `manual_csv` (the spreadsheet precedent), selected by env var.`
3. Deferred bullet, OLD tail: `What the spike did *not* settle is where the feed leg may run: the endpoint answers the owner's machine and three-timeout-refuses a GitHub-hosted runner (measured 2026-10-03), which is an AD-5 scheduling-boundary question, not an adapter one.` → NEW: `**Settled 2026-10-03** (`sprint-change-proposal-2026-10-03.md`): the scheduler stays on GitHub Actions and the source changed — `stats.nba.com` and `cdn.nba.com` refuse all datacenter egress (0/15 + byte-identical 403s from two providers), while ESPN answers both clouds (78 ms hosted). The `espn` adapter is Story 2.13; D-5/D-7 of spec-2-6 were never reopened.`

### P4 · spec-2-6 `SPEC.md` — amendment block (applied verbatim)

Appended to Assumptions bullet 1:
> `[Amended 2026-10-03 by sprint-change-proposal-2026-10-03.md, owner calls C1+C3: the scheduled inseason source is `espn` (Story 2.13), not `nba_com` — stats.nba.com refuses all cloud egress (0/15 across two providers; `deferred-work.md`, four-cell table). Both workflows' defaults and dispatch choices re-point in Story 2.13's commit; `nba_com` stays registered and hand-runnable but leaves the workflow surface. CAP-2's green-dispatch proof re-points to Story 2.13 (it inherits this spec's run sheet); CAP-6's empty-feed alarm is unchanged in shape and owed against `espn`. Story 2.6 closed 2026-10-03 with the fantrax dispatch, the issue-#8 close-and-re-fire and one rehearsal dispatch still owed — transferred to Story 2.13's spec and the owner's action list in `sprint-status.yaml`, not dropped.]`

CAP-2 success, OLD `runs the `nba_com` source through the existing runner` → NEW `runs the scheduled source through the existing runner (`nba_com` as authored; re-pointed to `espn` by Story 2.13 — amendment below)`.
CAP-6 success, OLD `a `nba_com` run whose feed holds zero series` → NEW `a scheduled-source run whose feed holds zero series (`nba_com` as authored; `espn` from Story 2.13)`.

`decisions.md`: **no edits** (D-5/D-7 stay closed; D-3's flag design is source-independent).

### P5 · Code/YAML surface — executed by Story 2.13's build, inventoried here

`pipeline-inseason.yml:44` (dispatch description), `:47` (choices), `:50` (default), `:113` (`PIPELINE_SOURCE` fallback), `:134` (`--require-feed: nba_com returned 0 series` copy); `pipeline-offseason.yml:77-78`; `tests/pipeline/workflows.test.ts` pins; new `espn` adapter + tests; `supabase/scripts/pipeline/data/` seed data if the story chooses a fixture; migration `00018` + rehearsal `COVERED_THROUGH` bump; `seriesdatasource-port.md` registry (`:82`) and a new adapter section.

### P6 · `failure-modes.md` mode 2 — annotation (appended to the mode's cell text)

> `[Re-pointed 2026-10-03: `Counter=1000` is the nba_com mechanism; under the `espn` source (Story 2.13) the mechanism dies but the class survives — a short postseason that parses as valid. Story 2.7's row-count-vs-bracket read stays the detector; the issue filed at 2.6's close is worded to the class, not the constant.]`

### P7 · `sprint-status.yaml`

- `2-6-scheduled-workflows-failure-notification-sm-4: review` → `done`, with a closing comment block: source blocker resolved by measurement (four-cell table, HOSTED-ESPN GREEN `37119291248`); routing per this proposal; CAP-2 re-pointed to 2-13 (C3); owed transfers listed explicitly (fantrax dispatch, issue-#8 close-and-re-fire, one rehearsal dispatch, `supabase functions delete feed-egress-probe`).
- New row between 2-12 and 2-7: `2-13-espn-feed-adapter: backlog` with a comment block citing this proposal, the five findings, and C1–C4.

### P8 · Migration `00018` (inside Story 2.13, recorded here because C2 creates it)

Additive: `ALTER TABLE teams ADD COLUMN espn_code text` + `UNIQUE` partial index where not null; seed at minimum `NYK→NY`, `SAS→SA` (the two measured divergences) and every other franchise whose ESPN code differs from the stored abbreviation — the full 30-team cross-check is an AC of 2.13, not a guess list. `EXPECTED_TEAM_COUNT = 59` is untouched (no new rows). Applied by the owner (`npx supabase db push`), rehearsed first, `docs/CURRENT_DATA_MODEL.md` in the same commit — the standing rules.

### P9 · Explicitly not touched

`decisions.md` (D-1..D-7 verbatim); `keepalive.yml`; the cron lines and window bracket (D-5); the notify composite; `--require-feed`'s design (D-3); UX artifacts (no coupling); `addendum.md` (decision-evidence trail stays as written — FR-21's annotation lives in `prd.md`); the archived data model (`00016`/`00017` semantics unchanged); no PLANNED-GATED scope.

## 6. Implementation handoff

**Scope classification: Moderate** — backlog reorganization (one new story, one close, sequence + annotation edits), no fundamental replan.

- **This pass (applied on approval):** P1–P4, P6, P7 to the named artifacts.
- **Next dev session (`bmad-build` / spec authoring):** Story 2.13's spec — carries the five findings, C1–C4, P5's inventory and P8's migration shape as frozen inputs; inherits 2.6's run-sheet transfers.
- **Owner actions, unchanged and still owed:** `supabase functions delete feed-egress-probe`; the three transferred zero-write dispatches land with 2.13; the green non-dry CAP-2 dispatch after 2.13 ships; `00018` apply when 2.13 rehearses it.

Success criteria: 2.13's spec approved; adapter green against a live playoff date; both workflows dispatch on `espn`; CAP-2's green dispatch observed; issue #8 closed via step 5; `npm run gate` green throughout.

## 7. Application log

- 2026-10-03: C1–C4 received from the owner in-session ("batch the proposals"). P1–P4, P6, P7 applied to `epics.md`, `prd.md`, `ARCHITECTURE-SPINE.md`, spec-2-6 `SPEC.md` + `failure-modes.md`, `sprint-status.yaml`. P5/P8 deferred to Story 2.13's build by design. C4's implementation timing (designation-only vs. build-now) is flagged in §4 as this pass's one unconfirmed judgment call.
