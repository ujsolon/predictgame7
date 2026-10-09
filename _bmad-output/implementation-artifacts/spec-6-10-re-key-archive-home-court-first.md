---
title: 'Story 6.10 — Re-key the archive to home-court first'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_commit: 'cbe3a07857ace1e5af29a28776a3a39682405ca4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the archive, `series.team_a_id` is a winner slot: 158 of 159 NBA, the BAA series and all 18 ABA store the winner there. The owner decided (2026-10-09) that the stored first team is the **home-court team, i.e. the real Game 7 host**, so that Story 6.8 can display stored order everywhere as "home team first". Measured live on 2026-10-09:
- 42 NBA/BAA series store the Game 7 *visitor* as `team_a`;
- Story 6.9 found 6 such ABA series (`supabase/scripts/pipeline/data/aba_game7_venues.csv`).

**Approach:** a guarded migration, `00020`, written and rehearsed by the agent and **applied by the owner** (`npx supabase db push`). For those 48 series it swaps `team_a`/`team_b` and every game row's home/away sides with their scores, so that:
- every game's per-team scores are unchanged;
- games 1–6 keep the pipeline convention that `team_a` is the home side;
- Game 7's home side is the real host for **all 178** series.

## Boundaries & Constraints

**Always:**
- **The swap set** is computed and asserted, never guessed:
  - **NBA/BAA:** series with `league IN ('NBA','BAA')` whose Game 7 `home_team_id` (the real venue since `00016`) is not `team_a_id`. **Exactly 42**, or the migration aborts naming the count.
  - **ABA:** the rows of `aba_game7_venues.csv` whose `game7_home_team ≠ team_a`. **Exactly 6**, embedded in the migration as literal `(year, team_a abbr, team_b abbr)` tuples, matched to exactly one series each, or it aborts.
  - Per 6.9's rule, a `note` starting with `info:` is a settled row; any other non-blank note, or a blank `game7_home_team`, aborts generation.
  - A test pins the migration's ABA tuples to the CSV.
- **Per swapped series, in one transaction:**
  - swap `team_a_id` ↔ `team_b_id`;
  - for games 1–6, swap `home_team_id` ↔ `away_team_id` *and* `home_score` ↔ `away_score`;
  - for Game 7, **ABA swaps only**, do the same. NBA/BAA Game 7 rows are already real and untouched.
  - `winner_team_id`, `series_game_scores.winner_team_id`, ids, `created_at`, `is_featured` and `league` are unchanged.
- **Post-condition guards** (abort the whole transaction on any failure):
  - for all 178 series, the Game 1 `home_team_id` = `team_a_id` (the pipeline's `plan.ts` convention);
  - for all 178, the Game 7 `home_team_id` = `team_a_id`;
  - the multiset of `(series_id, game_number, team_id, score)` is identical before and after;
  - winner counts are unchanged;
  - the Game 7 home-win census for NBA/BAA is still **117 of 160**.
- **Idempotence:** a second application finds 0 NBA/BAA and 0 ABA candidates. It is a no-op that passes the guards, demonstrated in the rehearsal.
- **Rehearsal:** `scripts/rehearse-migration-00014.mjs` gets `COVERED_THROUGH = 20` in **this** commit, plus a section exercising `00020` on the fixture:
  - the swap and per-team score preservation;
  - every guard rejecting a corrupted state (`expectRejected`);
  - the re-apply no-op.
- **Docs in the same commit:** `docs/CURRENT_DATA_MODEL.md`'s archive boundary is updated: `team_a` = the home-court/Game 7 host for all 178; Game 7 venues real for all 178; games 1–6 venues remain a convention (home side = `team_a`), not measured venues. It is marked "written, apply pending" until the owner applies.
- **After apply (owner-run, listed in the report):**
  - `node --env-file=.env supabase/scripts/pipeline/run.ts --refresh-insights`, expected unchanged figures;
  - an anon read showing the post-conditions;
  - the next `npm run deploy` regenerates pages and cards.

- **AGENTS.md (owner decision 2026-10-09, option 1a: the dangerous-now exception to the between-epics edit rule):** in this story's commit, rewrite the archive rule ("winner-slot fiction … `team_a` is the winner in 177 of the 178") to the post-`00020` truth:
  - `team_a` is the home-court / Game 7 host for all 178 series;
  - Game 7 venues are real for all 178;
  - games 1–6 venues are a convention (home side = `team_a`), not measurements, so no home-court statistic may use games 1–6;
  - the statement holds once `00020` is applied, and until then the old rule stands.

  The diff is shown to the owner at the commit.

**Never:**
- Edit the applied `00016` or `game7_venues_curated.csv`.
- Change app code. Display order is Story 6.8; the 4.3/4.8 spoiler-neutral order stays until then.
- Change the pipeline's live convention.
- Touch `winner_team_id`.
- Apply the migration from an agent session.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| NBA swap | 2016 Finals: `team_a` CLE, Game 7 host GSW | `team_a` GSW; games 1–6 home GSW with scores swapped; Game 7 untouched; CLE still the winner | N/A |
| ABA swap | 1975 IND/DEN, host DEN | `team_a` DEN; games 1–7 home DEN, scores swapped | N/A |
| Already home-first | 118 NBA/BAA + 12 ABA | untouched | N/A |
| Wrong count | NBA/BAA candidates ≠ 42, or ABA ≠ 6 | abort, naming the count | transaction rolled back |
| Score corruption | any per-team score changes | abort | rolled back |
| Re-apply | migration run twice | second run is a no-op | guards pass |
| ABA tuple mismatch | a CSV tuple matching 0 or 2 series | abort, naming the tuple | rolled back |

</frozen-after-approval>

## Code Map

- `supabase/migrations/00016_archive_league_identity_and_game7_venues.sql`: the guard style to mirror (`DO $$ … RAISE EXCEPTION '00016 guard …'`), the real Game 7 venues for 160. `00019` is the latest. The new file is `00020_archive_home_court_first.sql`.
- `supabase/scripts/pipeline/data/aba_game7_venues.csv` + `tests/pipeline/aba-game7-venues.test.ts`: the 6 ABA swaps (1971 UTS/IND, 1972 IND/UTS, 1972 NYN/VAS, 1973 IND/KEN, 1973 KEN/CAC, 1975 IND/DEN) and the `info:` rule.
- `supabase/scripts/pipeline/plan.ts:217`: the Game 1 home = `team_a` assertion (must still hold).
- `supabase/migrations/00017_pipeline_insights_refresh.sql`: the census reads the winner plus the Game 7 venue (unchanged for NBA/BAA). Refresh after apply.
- `scripts/rehearse-migration-00014.mjs`: `COVERED_THROUGH` (now 19) and the section pattern (section 8 = `00019`); the fixture has synthetic archived series. `tests/pipeline/insights-refresh.test.ts` pins the migration list (add `00020`).
- `docs/CURRENT_DATA_MODEL.md`: `### series` and "Story 2.8 status" boundary paragraphs.
- **App:** no change needed (verified 2026-10-09). The UI uses `winner_team_id` for the outcome (e.g. `HistoricalPage.tsx:225`); `buildSeriesRequest` maps scores by team id; probe row 5 is order-agnostic.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/00020_archive_home_court_first.sql` -- the guarded swap and post-conditions.
- [x] Test -- pins the ABA tuples in `00020` to the CSV (and the 42 count literal).
- [x] `scripts/rehearse-migration-00014.mjs` -- `COVERED_THROUGH = 20` plus a rehearsal section for `00020`; `insights-refresh.test.ts` migration list.
- [x] `docs/CURRENT_DATA_MODEL.md` -- the archive boundary rewrite, "written, apply pending".
- [x] AGENTS.md -- the archive rule rewritten (owner-approved dangerous-now exception), diff shown at commit.
- [x] Report -- the owner apply checklist (push, `db push`, insights refresh, anon post-condition read, deploy).

**Acceptance Criteria:**
- Given `npm run gate`, then green. Given the push, then the CI migration rehearsal is GREEN with the `00020` section.
- Given the owner applies `00020`, when the anon post-condition read runs, then the Game 7 host = `team_a` for 178/178 and the Game 1 host = `team_a` for 178/178, with 48 series swapped and per-team scores unchanged.

## Implementation Notes

- Rehearsal fixture vs. live: the curated CSV (and so the fixture) stores the 2026 WCF `SAS,OKC`, production stores it OKC-first, so the fixture would hold 43 NBA/BAA candidates. The rehearsal applies `LIVE_SHAPE_2026_WCF_SQL` (slots + games 1–6 exchanged for that one series, self-asserting its reach — superseded by the real-venue shape in the review fix below) immediately before `00020` in the ordered replay and in every section-9 seed. The migration itself pins 42.
- Idempotence design: ABA tuples resolve by `(year, unordered pair)`; a tuple is a candidate only while stored in tuple order, so a re-apply sees 0 + 0. `swap_count` accepts exactly (42, 6) or (0, 0).
- Guards: 3 pre (`aba_tuple_match`, `swap_count`, `candidate_shape`) + 6 post at first, 8 after the review fixes below; post-guards are fired in the rehearsal by injecting a corruption at the `-- ==== 00020 POST-CONDITIONS ====` marker.
- Local evidence 2026-10-09: `node scripts/rehearse-migration-00014.mjs` exit 0 (Docker), `npm run gate` green (876 tests). CI rehearsal and the owner apply are not yet evidenced.
- Review fix (games 1-6 truth): docs, AGENTS.md and 00020 comments now say games 1-6 home = team_a is a convention for the 177 spreadsheet-sourced rows only; the pipeline-born 2026 WCF carries real per-game venues (games 3, 4, 6 SAS-home; 3 of 890 archived game 2-6 rows, live read 2026-10-09). Game 1 and Game 7 home = team_a hold for all 178.
- Review fix (rehearsal fixture): `LIVE_SHAPE_2026_WCF_SQL` now seeds the WCF in production's real shape (OKC home in games 1, 2, 5, 7; SAS home in 3, 4, 6; scores travel with teams). 9b asserts 1,068 archived game 1-6 rows, all 288 rows of the 48 re-keyed series team_a-home, and the only non-team_a-home rows are the WCF's games 3, 4, 6.
- Review fix (candidate_shape): requires all of games 1-6 home = team_a per candidate, and the abort reports the total count of bad candidates plus the first. New post-guard `swapped_games_1_6_home_is_team_a`. The 9d tamper now uses game 4, so the games 2-6 coverage is exercised.
- Review fix (lock): `LOCK TABLE public.series, public.series_game_scores IN SHARE ROW EXCLUSIVE MODE;` right after BEGIN.
- Review fix (ABA census): new post-guard `aba_game7_home_win_census` (12 of 18, aborts with the measured value). Post-guard order is game1, game7, swapped 1-6, NBA census, ABA census, team scores, winners, identity, so each guard has a tamper that reaches it. 9e fires the ABA census by turning 1976 DEN/KEN's Game 7 into a home loss.
- Review fix (expiring literals): every count abort (swap_count, game1/game7 178, NBA 160, ABA 18) now tells the operator the archive changed since the 2026-10-09 measurement and to re-measure and regenerate before applying, i.e. apply 00020 before 00021 or any newly archived series. The test pins 5 such messages, and the checklist says the same.
- Review fix (AGENTS.md): added the programmatic applied-state check (archived series with Game 7 home <> team_a: 42 = not applied, 0 = applied), the `plan.ts:216-222` reference, and the 2026-10-02 date on the 177/178 figure.
- Review fix (data model `series` Stores list): `team_a_id`/`team_b_id` now carry their meaning before and after 00020, plus the applied-state check. Noted that after apply the predictions for the 6 ABA series change, because `buildSeriesRequest` sends `home_team` from the Game 7 row, which becomes the real host (a correction). For all 48 series the request's team order also follows the new slots. Prerendered pages and cards hold no predictions.
- Review fix (CSV parse): the test and the rehearsal assert the exact CSV header and abort on a blank host or a non-`info:` note. The test also asserts that 00020 issues no DML or DDL against `public.` beyond the two UPDATEs (the LOCK is allowed).
- Review fix (checklist): the figures are now labeled (archived NBA/BAA Game 7s 160, home wins 117, game-6-winner series wins 60, average Game 7 margin 10.88). The fixture reads 159/117/59 because the committed sheet lacks the 2026 WCF.
- Review fix (CI trigger): `migration-rehearsal.yml` push and pull_request `paths:` now include `aba_game7_venues.csv`, and `workflows.test.ts` pins it.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-09). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V: no gaps, two other findings). The diff ran from `cbe3a07` to the working tree, excluding the unrelated context, sprint-status and logo files.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| E4/E5 | **Games 1–6 are not "home = team_a for all 178".** The pipeline-born 2026 WCF has real venues, with games 3, 4 and 6 hosted by SAS (`team_b`). The rehearsal's live-shape seeding forces OKC home in all six games, so it certifies a state production does not have; the docs and AGENTS.md text over-claim | high | Live anon read 2026-10-09 (E): 3 of 890 archived game 2–6 rows have home ≠ `team_a`, all in the WCF. The migration itself is safe on production (WCF is not a candidate; its Game 1 and Game 7 are OKC home), but the record and the instrument are wrong | patch |
| E1/E2 | `candidate_shape` checks only games 1 and 7, and no post-guard covers games 2–6. A candidate with real game 2–6 venues would be inverted silently | medium | True at `00020` (candidate_shape / post-guards). The fix: the candidate must have `home = team_a` on games 1–6 before the swap, plus a post-guard that swapped series have games 1–6 `home = team_a` after | patch |
| B4 | No table lock, so a concurrent pipeline write mid-migration rolls back via the guards (safe, but avoidable) | low | True; `LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE` after `BEGIN` is one line | patch |
| B2 | No guard on the ABA Game 7 home record, although this migration makes the ABA venues real | low | True. A post-guard that ABA Game 7 home wins = 12 of 18 (6.9) | patch |
| B3/E3 | The 178 / 160 / 42 / 6 literals expire once any new series is archived (6.11 adds the 1968 Finals as `00021`, applied after `00020`) | low | True. Abort messages become re-measure instructions, and the checklist says "apply `00020` before `00021` or any new archived series" | patch |
| B6 | AGENTS.md makes agents rely on a doc for the applied state | low | True. Add the one-line anon check (count archived series whose Game 7 `home_team_id ≠ team_a_id`: 42 = not applied, 0 = applied) | patch |
| B5/B7 | The `series` column docs lack `team_a_id`'s meaning; the `plan.ts` line refs disagree | low | True; direct doc corrections | patch |
| B8/B9/B10/B14 | Test and rehearsal hardening: check the CSV header and abort on a blank host; assert no DML other than the two UPDATEs; check the 1,068 row count, not just 0 mismatches; `candidate_shape` reports the total count | low | True; direct | patch |
| B11 | Checklist figures unlabeled (160/117/60/10.88 vs the rehearsal's 159/117/59) | low | True; label them | patch |
| V-o1 | `migration-rehearsal.yml` `paths:` omits `aba_game7_venues.csv`, now a rehearsal input, against the workflow's own "trigger set = input set" rule | low | True; add the path (and its pin in `workflows.test.ts` if listed) | patch |
| B1 | Predictions for the 6 ABA series change after the apply (the `home_team` sent is now the real host) | low | True, and correct (a fix). The claim that OG cards and pages show predictions is false: prerendered pages hold facts only (AD-7). Record it in the data-model doc | patch (doc) |
| B12/V-o2 | `src/lib/spoiler-neutral.ts:4-5` and `src/prerender/preload.ts:61-65` state the "`team_a` = winner 177/178" premise, which goes false on apply | low | True; app code is out of scope here. Story 6.8 retires that ordering | defer (6.8) |
| B13 | The patch excludes the sprint, context and logo files; the spec status is in-review | false | Deliberate: those belong to other changes; status syncs at step 5 | reject |
- **Prediction symmetry measured (orchestrator, 2026-10-09):** the same 2016-style request was sent to the live, stateless `predict-game-7` twice, with `team_a`/`team_b` and their per-game scores swapped and `home_team` fixed. All four methods gave each team identical probabilities and the same predicted winner (logistic 84.94, bayes 45.77, elo 46, exponential smoothing 31.68 for CLE in both orders). So the slot swap changes only labels for the 42 NBA/BAA series. Only the 6 ABA series' predictions change, because their `home_team` becomes the real Game 7 host.
