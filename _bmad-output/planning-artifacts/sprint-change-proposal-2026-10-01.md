# Sprint Change Proposal — the archive gains league identity and real Game 7 venues (2026-10-01)

Trigger: found while planning Story 2.5 (`spec-2-5-insights-cache-refresh.md`, 2026-10-01). Its Open Question 1 ("which population does `home_team_stats` count?") turned out to be unanswerable from the table, because the archive holds no venues and no league identity. Owner recorded the direction the same day; `deferred-work.md` §"Deferred from: Story 2.5 planning" names **this pass** as the owner of both the Tier B data change and the league chip/filter surface.
Scope of this document: **planning artifacts + the two Story 2.5 spec files**. No migration, no curated CSV, no code, no deploy is produced or authorized here. Two new stories are created in `epics.md` and `sprint-status.yaml`; neither is built by this pass.
**Status 2026-10-01: approved by the owner ("Approve and apply §5 edits") and applied — see §8 for the application log.** Calls 1–4 were decided in this session (§4); the artifact edits in §5 are now on disk, following the pattern of `sprint-change-proposal-2026-09-30.md`. Nothing was committed, pushed, or run against production.
Supersedes: nothing. It **lifts one clause** of Story 2.4's Decision 11 (the archive freeze) for a defined, one-time case, and **amends** AD-5's slot-convention sentence, which `sprint-change-proposal-2026-09-30.md` §2.1 recorded on evidence that has since been falsified. AD-4's derivation decisions stand unchanged.

---

## 1. Issue summary

**What triggered it.** Story 2.5 is the first story that has to *compute* something over the archived rows rather than merely count them. Its third Open Question asked how to define the home-court population. Answering it required reading the archive's ancestry, and the ancestry says the question has no answer in the data as it stands.

**The core problem, typed.** *Technical limitation discovered during implementation* — specifically, **two of them stacked**:

1. **A measurement was read backwards.** The archive's `home_team_id` is not a venue. `docs/NBASeriesResults.xlsx` is winner-oriented (22 columns: `Year, League, Series Type, Winner Team, Winner Games, Loser Team, Loser Games, Total games`, then G1–G7 scores for winner and loser; **no home/away column anywhere**). The retired loader mapped `team_a = "Winner Team"` and passed `home_team = None` (`git show 5b518ef~1:supabase/scripts/load-games/main.py`), and `00007_backfill_missing_historical_series.sql:129-204` wrote `home_team_id = team_a_id` for all seven games. So for every archived series, game 7's `home_team_id` **is** the series winner, and a whole-table home-team statistic returns **exactly 100%** — against nba.com's published 117–43 (.731). The "178/178 = game 1's home team" line in `decision-2-1-q-4-data-source.md:85-87` and `sprint-change-proposal-2026-09-30.md:30` is not a measurement of the archive; `scripts/spike-2-1/audit-slot-semantics.mjs:55` compares game 1's `home_team_id` to `team_a_id`, which 00007 sets equal before the audit runs.
2. **A column was dropped at load time.** The sheet carries `League`; no `series` row records it. Composition read directly from the sheet (rows with `Total games = 7`): **177 = NBA 158 + BAA 1 + ABA 18**, and the sheet stops at the 2026 conference semifinals. The live table holds 178, so the archive is **160 NBA/BAA + 18 ABA** — nba.com's published 160 to the unit (the NBA counts BAA 1946–49 as its own and excludes the ABA). Nothing is missing and nothing is spurious; the 177/178 gap that `prd.md` FR-19, `epics.md:52` and the tracked action item carry as *unreconciled* is now reconciled.

**Why this matters beyond one card.** Story 2.5 cannot ship an honest `home_team_stats` without venues, and cannot scope a statistic to the league its copy claims without `league`. The owner's calls, recorded 2026-10-01 and treated here as fixed input: store three league values; backfill the **Game 7 home team only** for the 160 NBA/BAA series from **one hand-curated source**, no scraper and no new adapter; games 1–6 venues stay unknown; league + venue ship as **one migration (`00016`) with its own rehearsal**; the archive shows a **league chip and filter**; Story 2.5 lands **after** all of it and its RPC becomes `00017`.

### 1.1 Three consequences the scoping did not yet know

Found by reading the mechanism rather than the summary. Each one shapes a decision in §4.

**(a) The `manual_csv` floor cannot deliver the venue list.** `supabase/scripts/pipeline/plan.ts:382-390` — for a series already on the table as archived, a source that disagrees with the stored rows raises `PlanAssertionError` ("the runner never rewrites an archived outcome"), and `adapters/manualCsv.ts:15-19` requires whole series shapes (a birth needs games 1–6 split 3–3; a completion needs a pending row). A curated CSV of Game-7 venues run through the pipeline therefore aborts on all 160 rows *by design*. The intent survives — one hand-curated committed file, reviewable as a diff, no adapter — but the vehicle changes (Call 1).

**(b) Backfilling the venue means swapping scores on ~43 rows, not just setting a column.** `00007:194-204` wrote `home_score = game_7_score_a`, and `team_a` **is** the series winner, who by definition wins Game 7. So in every archived game-7 row the home side scored higher. If the real Game-7 home team lost (43 of the 160), setting `home_team_id` alone produces a row where the home team lost while `home_score > away_score` and `winner_team_id` points at the away side — a *second* fabricated inconsistency, the same class of defect we just caught. The fix is a coordinated swap of `home_team_id`/`away_team_id` **and** `home_score`/`away_score`, leaving `winner_team_id` untouched (Call 2).

**(c) The read path is already swap-safe — verified, not assumed.** `HistoricalPage.tsx:91-92`, `:284-286` and `PredictPage.tsx:317-319`, `:328`, `:670-676` all recover team-relative scores from home-relative rows via `home_team_id === team_a_id`, and the game tiles (`HistoricalPage.tsx:282-298`) render only a G-number and the two team-relative scores with the higher one bolded — **no home/away label is displayed anywhere**. After a swap, `scoreA` still resolves to team_a's score, so `00016` changes zero pixels on the archive and zero values in the Predict preload. This is the single fact that makes an in-place rewrite acceptable rather than reckless.

## 2. Impact analysis

### 2.1 Epic impact

**Epic 2 still completes, with two stories added and one already-created story unblocked.** New work lands as **Story 2.8** (league + venue: `00016`, the curated file, the rehearsal) and **Story 2.9** (league chip + filter on the archive). Execution order is **2.4 → 2.8 → 2.9 → 2.5 → 2.6 → 2.7**; story numbers are append-only, so the IDs do not sort into that order and `epics.md`'s Epic 2 narrative states it explicitly.

| Story | Status | Change |
|---|---|---|
| 2.2 (done) | — | none. Its migration `00014` and read-path flip are unaffected; `league` is additive |
| 2.3 (done) | — | none to shipped code. Its archive guard (`plan.ts:382-390`) stays **exactly as written** — `00016` deliberately does not route through it (Call 1) |
| 2.4 (`review`) | — | none to the adapter. Decision 11's freeze is lifted **once**, for game-7 venues of the 160 NBA/BAA series; the freeze keeps full force for games 1–6, for the ABA rows, and for the ongoing pipeline |
| **2.8 (new)** | backlog | `00016` + curated file + rehearsal. **The venue list is the long pole** — 160 hand lookups (~97 inside the `leaguegamelog` depth Story 2.1 measured, 1993-94 onward; ~63 older) |
| **2.9 (new)** | backlog | league chip + filter, FR-10/FR-11 surface, NFR-A1 floor. Depends only on 2.8 |
| 2.5 (`draft`, blocked) | backlog | unblocks after 2.8 applies. Population rules simplify to **one** filter for all three cards (Call 2); RPC becomes `00017` |
| 2.6 (backlog) | — | schedules a runner whose new rows carry `league` by column default (Call 4) — no workflow change |
| 2.7 (backlog) | — | gains one reconciliation: the drill asserts the league split (160/1/18) and the 117 home-win count as post-`00016` archive facts, and drops the `variedHome=1` hypothesis (retired by 2.8 — see §2.3) |

**Epic 4 is protected by one constraint, not changed by it.** The prerender route list stays derived from the **measured 178** plus the owner's flagship list. All 178 series — the 18 ABA included — keep their pages; the league filter is client-side and `00016` is not a data *subtraction*. Story 4.3's tracked action item ("docs that still say 177") is now **half-resolved**: the 177/178 gap has a cause and a composition, so the remaining work is the route-list re-derivation and the five wording sites. `share-og` (Story 4.2) needs no change — the card's context line is year·round·Game 7, and all five flagships are NBA.

**Epics 1, 3, 5 unaffected.** Epic 1's read paths use the derived phase. Epic 3's analytics registry gains a *property value*, not an event name (§2.2, `historical_filter_applied`). Epic 5 inherits two already-routed copy findings — "Momentum Matters" (37.1% measured, not the seeded 62.5%) and the `toFixed(2)`/`toFixed(1)` mismatch — and after 2.8 the home-court claim at `InsightsPage.tsx:194` becomes *supportable* at .731 rather than unsupportable.

**No new epic, no removed epic, no resequencing of epics.** The change is inside Epic 2's own subject matter (what the archive *is*), and the one UI surface it creates is small enough to live beside its cause.

### 2.2 Artifact conflicts

| Artifact | Site | Conflict | Resolution |
|---|---|---|---|
| `ARCHITECTURE-SPINE.md` | AD-5 `:97`, slot-convention sentence | asserts "`team_a_id` is game 1's home team in 178/178 rows" — falsified | rewrite as winner-first + the post-`00016` venue boundary |
| `ARCHITECTURE-SPINE.md` | AD-5 `:97`, data-source clause | says the port is exactly two fetch operations; the shipped port has an optional third (`describeRun?()`, `port.ts:52-66`) | **swept while here** — clears `deferred-work.md`'s "AD-5 does not know the port gained a third member" (owner architecture pass) |
| `ARCHITECTURE-SPINE.md` | AD-4 `:80`, `:88` | silent on `league`; AD-4 binds the `series` table | add the one-time freeze lift + "phase still derived, never stored; no statistic may derive a population from a date" |
| `ARCHITECTURE-SPINE.md` | Consistency Conventions `:128` | "IDs & data" row names no league | add `league` (three values, default `'NBA'`) and the venue truth rule |
| `ARCHITECTURE-SPINE.md` | AD-7 `:109` | must not be read as re-deriving routes from 160 | add the explicit "178 stands" caveat |
| `epics.md` | `:90` AD-5 summary, `:157` Epic 2 narrative, `:52` FR-19, `:41`/`:123` FR-12 | repeat the slot claim; carry the unreconciled 177; no 2.8/2.9 in the sequence | edits E1–E4 |
| `epics.md` | Story 2.5 AC `:382` | "home-court advantage" from `series`/`series_game_scores` with no population rule | name the league filter and the verified-venue rule |
| `epics.md` | Story 2.7 AC `:412` | reconciliation list | add league split + home-win checksum |
| `epics.md` | Story 2.3 AC `:352` | "transaction-wrapped session without committing" — unreachable over PostgREST, already corrected in `epic-2-context.md:43` | **swept while here** — clears `deferred-work.md`'s owner-lands-here item |
| `epics.md` | new Stories 2.8 / 2.9 | do not exist | authored in §5.6 |
| `spec-2-5-insights-cache-refresh.md` | `:40` `:62` `:88-89` `:110` | "rows whose venue has been backfilled" (undefined marker); blocked-by-a-pass-that-now-exists | fold the four calls in, set the population to one filter, re-point at Stories 2.8/2.9, log it in "Spec Change Log" |
| `epic-2-context.md` | `:38` slot bullet, `:39` pinned facts, `:44` refresh trigger, `:10-18` story list, `:58` dependencies | freeze wording, "unreconciled" framing, no 2.8/2.9 | hand-maintained per its own header — update in the same commit as the epics edits |
| `sprint-status.yaml` | `:52` | `2-5: backlog` with no upstream data story | add `2-8`, `2-9`; annotate the action item's reconciliation half |
| `docs/CURRENT_DATA_MODEL.md` | `:98-128` | "The archive carries slots, not venues" + "the freeze stands" | **lands with Story 2.8's commit** (same-commit rule), not here. This pass writes only the *forward pointer* in the proposal |
| `_bmad-output/implementation-artifacts/seriesdatasource-port.md` | `manual_csv` section | a reader may now assume the floor can backfill archived rows | **lands with 2.8**: one sentence naming it a live-writes-only path and pointing at `00016` |
| PRD / addendum | FR-10, FR-11, FR-12, FR-19 | **no FR change.** The filter is FR-10's second filter dimension; the chip is FR-11's series record; `league` is FR-19's canonical archive data; the cards stay FR-12 | FR-19's `[As written this does not hold — 2026-09-30]` tag is now **answered** — the delta is explained, not open. Correct the tag with a pointer here, and keep §D–§G evidence untouched per the lifecycle rule |
| UX docs | `EXPERIENCE.md:30` ("Delta only — existing routes unchanged"), ratified-surfaces preamble `:16` | a new interactive control on a surface the UX spines deliberately did **not** re-spec | `EXPERIENCE.md` gains a Historical-archive delta line (filter semantics + one honest BAA explanation); `DESIGN.md` gains the chip treatment only if it differs from the existing muted-chip pattern. Behavior in EXPERIENCE, visuals in DESIGN, per their own split |
| `reviews/review-adversarial.md`, `.memlog.md:18` | — | audit trail that predicted the venue gap | **do not rewrite.** Cite |

### 2.3 Technical impact

- **`00016_archive_league_identity_and_game7_venues.sql`** (name is a proposal, not a commitment), one file, both changes:
  - `series.league text` added nullable → backfilled for all 178 from the curated file → `SET NOT NULL` → `DEFAULT 'NBA'` → `CHECK (league IN ('NBA','BAA','ABA'))`. Order matters: NOT NULL before the default would strand rows; both belong after the backfill.
  - One `UPDATE ... FROM (VALUES …)` per change, keyed on `(year, unordered team pair)` resolved through `teams.abbreviation` (the identity triple `00014` made enforceable), never on `round` (17 era spellings, deliberately ungated).
  - Game-7 rows of the 160 NBA/BAA series: swap `home_team_id`/`away_team_id` **and** `home_score`/`away_score` where the curated home team is the stored away side; `winner_team_id` never changes. Postgres evaluates every `SET` expression against the pre-update row, so a single statement does both correctly.
  - In-migration guards in `00015`'s raise-to-abort style: every curated row matches exactly one series; no series matched twice; after the backfill `league IS NULL` count is 0; the ABA count is exactly 18; the NBA/BAA game-7 home-win count equals 117; for all 1,246 rows `winner_team_id` still equals the higher-scoring side, and each series' `winner_team_id` still equals its game-7 winner. A guard that cannot fail is not a guard — this is the repo's standing rule, and it is what makes the curated list self-validating.
- **The 117 checksum is the verification, and it has one honest caveat.** nba.com's 117–43 is over the same 160 Game 7s the backfill covers, so a correctly curated list lands 117 and a list with a wrong row does not. The caveat: the published split carries an as-of date (2026-05-31), and the table's 160th NBA/BAA series is the 2026 Finals Game 7, which the source sheet does not contain. If the count lands 116 or 118, either one curated row is wrong or the published split excludes the 2026 final — and **Story 2.8 resolves which before the owner applies**, rather than relaxing the guard.
- **The curated file.** `supabase/scripts/pipeline/data/game7_venues_curated.csv` — inside the re-included data directory (`.gitignore` keeps repo-root `data/` out), committed as the auditable diff and the single source of truth. Minimal shape: `year,team_a,team_b,league,game7_home_team`, one row per archived series (178), `game7_home_team` blank for the 18 ABA rows. A blank venue is *how games 1–6 stay unknown*, expressed in the file's own shape. A committed generator emits the `VALUES` blocks, and the rehearsal fails if the migration's embedded list disagrees with the CSV — otherwise the two copies drift silently.
- **The `00015` RPCs are untouched** (Call 4): `pipeline_birth_series` keeps its signature and `league` arrives by column default. Editing a rehearsed, applied, production-verified function to carry a value no current source can vary is risk bought for nothing.
- **`scripts/rehearse-migration-00014.mjs`** — `COVERED_THROUGH: 67` goes 15 → 16, the ordered replay gains `00016`, and the new section exercises the post-backfill assertions against the replayed archive (178 rows, 160/1/18, 117, per-row winner consistency). The script's *name* now understates its coverage; keep it (renaming churns every reference in the docs) and state the coverage in its header comment instead. It is still run by no gate — that stays Story 2.6's problem, recorded as such.
- **Blast radius of the data change.** 160 of 1,246 game rows rewritten (43 of them score-swapped), `league` added to 178. Display: unchanged, per §1.1(c). `predictions.input_scores` holds team-relative snapshots of past predictions and is not a user-facing read path (`predictions` is private-by-RLS), so no visible drift. A future `--season=` drill aimed at a backfilled year reaches `plan.ts:382-390` and aborts instead of reconciling — which is the already-documented behavior of the guard, now with one more reason to disagree.
- **Sequencing is a hard gate, not a preference.** `00016` applies **before** Story 2.9 deploys. A build that selects `league` against a table without the column gets PostgREST `400 42703` and the archive page fails to load. Off-playoff-window requirement satisfied today (2026-10-01 is offseason, as AD-4's precedent AC notes).
- **Retired, not chased:** the "the 178th row is the 2026 Finals and may already carry real venues" hypothesis in `spec-2-5:113`. `00016` curates game 7 of every NBA/BAA series including that one, so its prior state stops mattering. Recording this closes a loose end without authorizing a production read.

## 3. Recommended approach

**Option 1 — Direct Adjustment.** Add two stories inside Epic 2, amend AD-4/AD-5/AD-7 and the epics/spec wording, leave Epic 4's route list and Epic 5's copy items where they already are. No requirement is added or removed; FR-10/11/12/19 already own everything the change touches.

- **Effort: Medium.** The migration, the generator, the rehearsal extension and the UI surface are ordinary work for this repo. The curated 160-row venue list is the bulk of it and is human table time, not code.
- **Risk: Medium, and concentrated in one place** — curation accuracy. Mitigated structurally, not hopefully: the 117 checksum, the per-row match guards, the CSV/migration agreement check, and the throwaway rehearsal all fail non-zero. Risk drops to Low for the *schema* half, which `00014`'s precedent (pre-flight over all 178 rows, then a replay) covers directly.
- **Timeline: compatible with Apr 2027** if curation does not stall. Epic 2 is calendar-critical and Story 2.6 schedules the cadence, so the ordering 2.8 → 2.9 → 2.5 → 2.6 keeps the playoff window ahead of everything except the drill (2.7). **Fallback if curation slips past a date the owner sets now:** ship `00016` league-only first (a one-file lift: `00016` = league, `00017` = venues, 2.5's RPC pushed to `00018`) and let `home_team_stats` report the verified subset with its own denominator — which requires a venue marker other than `league`, i.e. Call 2's option B or C becomes the price of the slip. Decide the slip date when 2.8 is picked up, not when it is late.

**Rejected — Option 2 (rollback).** Nothing completed needs unwinding. `00014`/`00015` are correct as applied; Story 2.4's adapter never read the falsified slot claim as an input (it supplies game-true home/away for new rows), and its Decision 11 freeze is exactly what made this discoverable without a broken production path. Rolling back would only destroy the audit trail.

**Rejected — Option 3 (MVP review).** Not a scope reduction. Dropping `home_team_stats` from Insights would mean deleting a card — FR-12's pattern set, user-visible copy, and a live surface — which is a bigger and worse-reviewed change than curating 160 rows once. The insight cards' whole premise is that they count the real archive; that premise is what this proposal buys back.

## 4. Owner calls — decided 2026-10-01 in this pass

| Call | Question | Decision |
|---|---|---|
| **1** | How does a hand-curated venue list reach the database when the `manual_csv` floor aborts on archived rows? | **CSV as source, `00016` as carrier.** Committed curated file, auditable diff, no scraper, no adapter; a generator emits the `VALUES` blocks into the migration; the rehearsal proves replay **and** CSV/migration agreement. The runner's write path and its archive guard stay untouched. |
| **2** | Where does the corrected Game-7 venue live, and does the migration swap the fabricated scores with it? | **Swap the Game-7 row in place**, scores included, `winner_team_id` never touched. `league IN ('NBA','BAA')` then *is* the "venue is real" marker: Story 2.5's three cards share one 160-series population, and `home_team_stats` becomes checkable against nba.com's 117–43 over exactly that set. The mixed meaning of `series_game_scores.home_team_id` (venue for game 7, winner-fiction for games 1–6) is pinned in `CURRENT_DATA_MODEL.md` and by tests, not left to inference. |
| **3** | Which epic owns the league chip + filter? | **New Story 2.8 for the data, new Story 2.9 in Epic 2** for the surface — co-located with the insights refresh that makes 160 visible, and inside Epic 2's verification (2.7). Recorded here as a **revision of spec-2.5's "belongs to the sharing/UX epic"** note; the reason accepted was the archive/insights contradiction, which co-landing removes outright. Epic 4 keeps its route list untouched. |
| **4** | How does `league` stay correct on rows the ongoing pipeline writes? | **Column `DEFAULT 'NBA'` + CHECK, no RPC signature change.** Both shipped adapters write NBA-only seasons, so the default is true rather than a guess; `00015`'s rehearsed functions keep their shape; a future non-NBA source sets the column explicitly. |

## 5. Detailed change proposals

Line numbers are as of this draft and shift as edits land — locate by the quoted text.

### 5.1 `ARCHITECTURE-SPINE.md`

**Edit A1 — AD-5 `:97`, slot-convention sentence.** Replace

> **Slot convention:** `team_a_id` is game 1's home team in 178/178 rows and `team_a_id > team_b_id` in 80, so there is no canonical id ordering the constraint could lean on. The adapter maps the higher seed to `team_a_id`, and the runner asserts the pair is absent **in either slot order** before inserting (Story 2.3's identity assertion) — the constraint cannot enforce the convention, so a slot-swapped re-insert of the same matchup would land as a new row; a real observed swap reopens this as a generated-key decision.

with the same sentence plus the correction:

> **Slot convention:** ~~`team_a_id` is game 1's home team in 178/178 rows~~ **corrected 2026-10-01 from the archive's own committed ancestry (`sprint-change-proposal-2026-10-01.md` §1): for the archived rows `team_a_id` is the series *winner*, and `00007:129-204` wrote `home_team_id = team_a_id` for all seven games — so archived `home_team_id` is not a venue.** `team_a_id > team_b_id` in 80 rows, so there is still no canonical id ordering the constraint could lean on, and the runner still asserts the pair is absent **in either slot order** before inserting. **Venue boundary (owner calls 2026-10-01):** migration `00016` adds `series.league` (`NBA`/`BAA`/`ABA`, `NOT NULL DEFAULT 'NBA'`, CHECKed) and rewrites the **Game 7** row of the 160 NBA/BAA archived series to the real home/away — scores swapped with the sides, `winner_team_id` unchanged — so **`league IN ('NBA','BAA')` is the definition of "this Game-7 venue is a real venue"**. Games 1–6 venues stay unknown permanently, the 18 ABA series keep winner-fiction on game 7, and every row the pipeline writes from here carries game-true venues. No statistic may read `home_team_id` for a game other than 7 of an archived series. This is a one-time, deliberate lift of Story 2.4 Decision 11's archive freeze; the freeze stays in force otherwise, and `plan.ts`'s never-rewrite-archived-rows guard is not relaxed.

**Edit A2 — AD-5 `:97`, port clause** (clears `deferred-work.md`'s open "AD-5 does not know the port gained a third member"): after "`fetch_series_statuses`, `fetch_game_scores`" insert "— plus an optional, adapter-declared run report (`describeRun?()`) the runner prints before planning and never reads for control flow".

**Edit A3 — AD-4 `:88` bullet**, appended: "`league` (added by `00016`) is a source-identity column, not a phase column: no code may derive a series' phase, group or population from it or from any date, and an insight population that filters on league still filters on `winner_team_id IS NOT NULL` first."

**Edit A4 — Consistency Conventions `:128` "IDs & data"** gains: "`league` ∈ {`NBA`,`BAA`,`ABA`} — three values, `DEFAULT 'NBA'`, CHECKed; the **Game 7** `home_team_id`/`away_team_id` of an `NBA`/`BAA` row is a real venue, every other archived game row is winner-fiction, and no statistic reads the latter."

**Edit A5 — AD-7 `:109` Count caveat**, appended: "**2026-10-01:** `00016` splits the archive by league (160 NBA/BAA + 18 ABA) and backfills Game-7 venues. It changes **no** route list: the prerender set stays the measured 178 plus the owner's flagship list, and the league filter is client-side. Re-deriving routes from 160 is a bug."

### 5.2 `epics.md`

- **Edit E1 `:90` AD-5 summary** — strike the falsified slot claim, name `league` + the game-7 venue boundary and the one-time freeze lift, pointing at this proposal.
- **Edit E2 `:157` Epic 2 narrative** — insert the new steps in execution order: `… → 2.4 automated adapter → **2.8 archive league identity + Game 7 venue backfill (`00016`, curated CSV, rehearsal)** → **2.9 league chip + filter on the archive (FR-10/FR-11)** → **2.5 `insights_cache` refresh (`00017`, league-filtered population)** → 2.6 → 2.7`,** with the note that IDs are append-only and do not sort into run order.
- **Edit E3 `:52` FR-19** — replace "the one-row delta is unreconciled row-by-row" with the reconciliation: `177 = NBA 158 + BAA 1 + ABA 18 in the source sheet, which stops at the 2026 conference semifinals; 178 live = 160 NBA/BAA + 18 ABA = nba.com's published 160 to the unit`. `prd.md:226`'s `[As written this does not hold — 2026-09-30]` tag gets the same pointer.
- **Edit E4 `:352` Story 2.3 dry-run wording** (clears its `deferred-work.md` owner item): "a dry-run mode computes and asserts the plan in memory, prints it, and issues **zero** writes (per-operation atomicity comes from `00015`'s one-RPC-per-write, since PostgREST cannot open and roll back a session)".
- **Edit E5 Story 2.4 AC `:368`** — the "measured `team_a_id` = game 1's home team in 178/178" parenthetical is struck and replaced with the winner-first correction; the higher-seed→`team_a` rule for *new* rows stands.
- **Edit E6 Story 2.5 AC `:382`** — "Game 6 winner impact, home-court advantage, average Game 7 margin (FR-12)" → each card names its population: archived (`winner_team_id IS NOT NULL`) game-7 rows, `league IN ('NBA','BAA')`; home-court advantage counts only rows whose league marks the venue as backfilled-or-pipeline-written; **this story runs only after `00016` is applied**.
- **Edit E7 Story 2.7 AC `:412`** — the reconciliation list gains the post-`00016` facts (league split 160/1/18, Game-7 home wins 117 over the 160) and keeps asserting 178 series / 1,246 score rows as the archive total.

### 5.3 New stories (authored in full in `epics.md`, drafted below)

**Story 2.8: Archive league identity + Game 7 venue backfill** (FR-19, FR-12 prerequisite; AD-5 as amended here)

As the owner, I want the archive to record which league each series came from and who actually hosted Game 7, so the insight cards can count a real, defensible population instead of a 100% artifact.

AC, in this repo's fail-loudly shape:
- **Given** the live archive (178 series, 1,246 game rows, nothing pending), **when** `00016` is rehearsed in the throwaway replay, **then** the ordered replay of `00001`–`00016` exits 0 with `COVERED_THROUGH = 16`, and every guard below is executed, not merely present.
- **And** `series.league` exists with `NOT NULL`, `DEFAULT 'NBA'` and `CHECK (league IN ('NBA','BAA','ABA'))`, and the replayed archive splits exactly **160 / 1 / 18** with zero NULL.
- **And** the curated file `supabase/scripts/pipeline/data/game7_venues_curated.csv` is committed (178 rows: `year,team_a,team_b,league,game7_home_team`; `game7_home_team` blank for the 18 ABA rows), and the rehearsal fails if the migration's embedded `VALUES` lists disagree with that file in either direction.
- **And** every curated row resolves to exactly one series via `(year, unordered team pair)`, and any row matching zero or two series aborts naming the row.
- **And** for the 160 NBA/BAA series the game-7 row's `home_team_id`/`away_team_id` name the curated home and the other slot, `home_score`/`away_score` travel with their teams (≈43 rows swapped), and `winner_team_id` is unchanged — assert `winner_team_id` = higher-scoring side for all 1,246 rows and = game 7's winner for all 178 series.
- **And** Game 7 home-team-wins over the 160 equals **117** (nba.com's published split). If it lands 116 or 118, the story resolves which — one curated row wrong vs. the published as-of date excluding the 2026 final — in writing, before the owner applies. A relaxed guard is not an acceptable resolution.
- **And** games 1–6 venue data is not invented anywhere: no statement in `00016` touches `game_number <> 7`, and the 18 ABA game-7 rows are untouched.
- **And** `00015`'s functions, `plan.ts`'s archive guard, and both adapters' fetch scope are unchanged; a `--season=` drill onto a backfilled archived year still aborts non-zero rather than reconciling.
- **And** `docs/CURRENT_DATA_MODEL.md` is updated **in the same commit** as the migration, replacing the "slots, not venues" and "the freeze stands" paragraphs with the post-`00016` boundary, and stating plainly that archived `home_team_id` means venue on game 7 of NBA/BAA rows only.
- **And** the agent does not touch production: it hands the owner the rehearsal command and `npx supabase db push`, and records the rehearsal output.
- **And** `npm run gate` passes (nothing under `supabase/scripts/**` type-checks the migration; `scripts/**` is checked by no local step, per AGENTS.md — stated, not quietly passed).

**Story 2.9: League chip and filter on the archive surface** (FR-10, FR-11, FR-19; NFR-A1)

As a fan browsing the Historical Archive, I want to see which league each series was played in and filter by it, so a 178-series archive and a 160-series insight denominator do not read as a contradiction.

AC:
- **Given** `00016` is applied, **when** the archive loads, **then** each series row and the expanded series record show a league chip carrying the stored value (`NBA` / `BAA` / `ABA`) — no derived or inferred league, and `BAA` is never silently relabelled as `NBA`.
- **And** one honest line of explanation for `BAA` (1946–49, the NBA's counted-as-its-own predecessor) is reachable — tooltip or legend — with the wording owned by the story and the AA floor pinned here, since a bare "BAA" chip is unparseable to a fan and the archive page has no existing glossary.
- **And** a league filter sits beside the existing year `Select` (`HistoricalPage.tsx:118-130`) and team search (`:140`), intersects with both (FR-10's combined-filter rule), and resets the page counter the way the year filter does (`:118`).
- **And** it emits the existing `historical_filter_applied` event with `filter_type: 'league'` and the league value — **no new event name**, addendum §A.1's ten names untouched — from the same call site the year filter uses (Story 3.1 owns moving them behind the analytics port; 2.9 does not start that refactor).
- **And** WCAG 2.1 AA (NFR-A1): keyboard-reachable, the control has an accessible name, filter results are announced or re-announced on change, contrast compliant at chip size; the "no automatic scroll on section click" behavior the owner has established for this app is not violated.
- **And** **no route list, page count or prerender input changes** — the filter is client-side over the already-fetched archive; all 178 series keep their pages (AD-7 caveat, Epic 4 untouched).
- **And** the archived game tiles' rendering is unchanged (`:282-298`); `00016` did not move a pixel there, and this story does not either.
- **And** an empty filtered result uses the existing "No series found matching your filters." (`:236`) — no new empty state.
- **And** `npm run gate` passes; component tests follow the repo's per-file jsdom convention and **assert no computed accessible name** (AGENTS.md evidence discipline — `getByRole({name})` can stay green on a tree Chrome reads as fused); names are settled over CDP with `scripts/measure-predict-latency.mjs`'s harness or with real AT.
- **And** deploy order is enforced by the story: `00016` applied **before** this build ships. A `league` select against a table without the column returns `400 42703` and the archive fails to load.

### 5.4 `spec-2-5-insights-cache-refresh.md`

- `:40` — population rule becomes: all three cards share `winner_team_id IS NOT NULL` + `league IN ('NBA','BAA')`; home-court advantage reads `home_team_id` only under that league filter, which `00016` makes equivalent to "venue is real". The "rows whose venue has been backfilled" phrasing (which had no marker to name) is retired.
- `:62` edge row — the Tier B migration is now named: `00016`, delivered by Story 2.8; failure mode unchanged (this story stops rather than computing from winner-as-venue).
- `:88-89` tasks — "Blocked until the Tier B course correction lands" → **unblocked-by-plan**: blocked until Story 2.8's `00016` is applied to production; RPC is `00017`; add the cross-check that `home_team_stats`' denominator is 160 and its win count 117.
- `:110` implementation note — record that this pass made the four calls and that Stories 2.8/2.9 now exist.
- **Spec Change Log** — one entry: the frozen block's Owner-decision bullet 2 is amended per §4 (human-renegotiated 2026-10-01), with the pointer to this proposal. Nothing else in the frozen block moves.

### 5.5 `epic-2-context.md`, `sprint-status.yaml`, `deferred-work.md`

- `epic-2-context.md`: story list gains 2.8/2.9 in execution order; the `:38` slot bullet gets the boundary paragraph and the freeze-lift note; `:39` pinned facts keep **178 / 1,246 / seven-each** as the archive total and add the league composition + the 117 count as the *insight* denominators; `:44` refresh trigger names the league filter; `:58` dependencies read "2.5 depends on 2.8's `00016` being applied and on 2.9 for the user-facing marker; 2.7 verifies the chain including league".
- `sprint-status.yaml`: `2-8-archive-league-identity-and-game7-venue-backfill: backlog`, `2-9-league-chip-and-filter-on-the-archive: backlog` inserted after `2-5`; `2-5` stays `backlog`; the `story-2-1-audit-pin-the-archive-total…` action item's text records the reconciliation as done and keeps the route-list half with Story 4.3.
- `deferred-work.md`: the two Story 2.5-planning entries (Tier B, league chip/filter) get " routed to and decided by `sprint-change-proposal-2026-10-01.md`; owned now by Stories 2.8 and 2.9" with their evidence left in place; the "AD-5 does not know the port gained a third member" and the "`epics.md:352` dry-run wording" entries are marked closed by Edits A2/E4; the "Momentum Matters" + `toFixed` entries stay routed to Story 5.1, now with the added note that post-`00016` the home-court claim at `InsightsPage.tsx:194` is supportable at .731.

## 6. Implementation handoff

**Change scope: Major in form, Moderate in practice** — it amends the architecture spine, adds two stories, and reopens one completed story's decision (2.4's freeze) for a defined case, so it needed the owner's PM/architect authority rather than a build session's. Execution itself is ordinary work: one migration + one curated file + one rehearsal extension + one small UI story.

| Who | Owns |
|---|---|
| **Owner (PM/architect authority)** | Approve/reject this proposal; **curate the 160 Game-7 home teams** (the only human-data task; ~97 inside the feed depth Story 2.1 measured, ~63 older); set the curation slip date §3; run the rehearsal verdict, then `npx supabase db push` — **the agent never applies `00016`** |
| **Developer agent — Story 2.8** | `00016` (league + game-7 venue swap) with the in-migration guards, the CSV→`VALUES` generator, `rehearse-migration-00014.mjs` to `COVERED_THROUGH = 16` + the new assertions, `CURRENT_DATA_MODEL.md` and `seriesdatasource-port.md` in the same commit, `npm run gate`, hand over the production commands |
| **Developer agent — Story 2.9** | Chip + filter + BAA gloss + AA floor + the `filter_type: 'league'` event property; CDP-settled accessible names |
| **Developer agent — Story 2.5** | Unblocked by 2.8's apply: `00017` RPC + refresh step + tests, against the population rules in §5.4 |
| **Story 2.6 / 2.7** | Scheduling unchanged; 2.7's drill asserts the new pinned facts alongside the old totals |
| **Story 4.3 / 5.1** | Keep their already-routed work: the route-list re-derivation from 178 + flagships; the "Momentum Matters" copy and the `toFixed` mismatch |

**Success criteria.** `/insights` prints numbers whose denominators a reader can name and reproduce (160 NBA/BAA Game 7s; 117 home wins; 59/159-or-160 Game-6-winner; margin over the same 160). `/historical` shows the same archive as 178 with the ABA visible and filterable. No statistic anywhere reads `home_team_id` off games 1–6, and `CURRENT_DATA_MODEL.md` is the place that says so.

**Commands the owner runs, in order, when Story 2.8 is delivered** (one line each, PowerShell-safe):

```
node scripts/rehearse-migration-00014.mjs
npx supabase db push
```

## 7. Explicitly not touched

- Games 1–6 venues, the 18 ABA game-7 venues, and any normalisation of archived scores. The freeze stays in force for all three.
- The identity key, `round`'s free-text vocabulary, AD-4's derivation, `00014`/`00015`, `plan.ts`'s guards, both adapters' fetch scope, and the ten analytics event names.
- Epic 4's route list, page count, OG card context line, and flagship list.
- `InsightsPage.tsx` — its copy, decimals and metric set stay FR-18/Story 5.1's.
- Any production write, any migration apply, any deploy. This document authorizes planning edits only.

## 8. Application log (2026-10-01)

§5 edits applied on approval. Three things the §5 list did not anticipate, recorded here rather than silently absorbed:

- **A divergence found mid-application, then fixed (Edit A6).** AD-5, `epics.md`'s Story 2.5 Given and `epic-2-context.md:44` all said the insights refresh fires on "an offseason run **or** a run that fills a winner". `spec-2-5`'s frozen owner decision (2026-10-01) says **only** a winner-filling run refreshes. The sweep missed it because the sentence appears in three artifacts; the spec is the decision record, so the other two were corrected to it.
- **Three falsified-measurement sites annotated in place, not rewritten.** `epics.md` Story 2.2 `:319`, Story 2.3 `:346` and Story 2.4 `:368` each restate the "game 1's home team in 178/178" slot evidence this proposal falsifies. They are accepted stories' AC text, so each got a bracketed `[annotation 2026-10-01: …]` in the style of `decision-2-1-q-4-data-source.md:85-87` and `sprint-change-proposal-2026-09-30.md:30` — no AC was rewritten.
- **Two pre-existing deferred items closed by treating this pass as the owner architecture pass** they asked for: AD-5's silence about `describeRun?()` (Edit A2) and `epics.md:352`'s unreachable dry-run wording (Edit E4). `deferred-work.md` marks both CLOSED with a pointer here.

Deferred-work routing applied: Tier B → Story 2.8, league chip/filter → Story 2.9 (with Call 1's mechanism correction inside the Tier B evidence), and a note on the "Momentum Matters" entry that post-`00016` the home-court copy at `InsightsPage.tsx:194` becomes number-supported at 73.1% while the momentum copy stays contradicted. `prd.md:226`'s FR-19 tag carries the reconciliation pointer (Edit E3). `sprint-status.yaml` names the new stories `2-8-archive-league-identity-and-game7-venue-backfill` and `2-9-league-chip-and-filter-on-the-archive-surface`, both `backlog`, inserted **before** `2-5` — §5.5 said "after `2-5`", and execution order 2.0 → … → 2.4 → 2.8 → 2.9 → 2.5 → 2.6 → 2.7 is what was applied.

Not applied, by the approval's own boundary: `docs/CURRENT_DATA_MODEL.md` and `_bmad-output/implementation-artifacts/seriesdatasource-port.md` deltas land with Story 2.8's commit, and no `00016`, curated CSV, code, rehearsal change or production command was produced.
