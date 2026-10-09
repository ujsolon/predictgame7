---
title: 'Story 6.11 — Add the 1968 ABA Finals to the archive'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_commit: '8e91ed2165ef517ff29ae83c202342f3fd16de6f'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The archive has 178 series and no 1968 series at all. The 1968 ABA Finals went seven games and is missing (found by the 6.9 spike, confirmed by an anon read on 2026-10-09). The owner decided to add it now, alongside 6.10's migration (`epics.md` Story 6.11).

**Approach:** a guarded migration, `00021`, written and rehearsed by the agent and applied by the owner in the same `npx supabase db push` as `00020`, after it. It adds:
- a **Pittsburgh Pipers** team row (`PTP`, id 61; logo `assets/teams/Pittsburgh_Pipers.gif`, supplied by the owner);
- the **1968 ABA Finals** series: `team_a` = PTP (the home-court team), winner PTP;
- its **seven game rows with real venues**.

The scores are owner-supplied (basketball-reference) and cross-checked against a second source, as in 6.9. A coverage check first names any *other* missing 1968 ABA seven-game series for an owner ruling.

## Boundaries & Constraints

**Always:**
- **Coverage check first (research, web tools, about 2–4 page reads, no script):**
  - read the 1968 ABA playoffs (basketball-reference `ABA_1968` plus Wikipedia "1968 ABA playoffs");
  - report every series that went seven games;
  - any besides the Finals is **named in the report for an owner ruling and not added**.
- **Data record:** a new `supabase/scripts/pipeline/data/aba_1968_finals.csv` in house style (`#` header with sources and date), one row per game: `game_number,date,home,away,home_score,away_score,source,cross_check`. Its values:

  | Game | Date | Home | Away | Home score | Away score |
  |---|---|---|---|---|---|
  | 1 | 04-18 | PTP | NOB | 120 | 112 |
  | 2 | 04-20 | PTP | NOB | 100 | 109 |
  | 3 | 04-24 | NOB | PTP | 109 | 101 |
  | 4 | 04-25 | NOB | PTP | 105 | 106 |
  | 5 | 04-27 | PTP | NOB | 108 | 111 |
  | 6 | 05-01 | NOB | PTP | 112 | 118 |
  | 7 | 05-04 | PTP | NOB | 122 | 113 |

  - Each game is cross-checked against a second source.
  - A mismatch on any score or venue is **not guessed**: it is reported for an owner ruling before the migration is emitted.
- **Migration `00021_add_1968_aba_finals.sql`** (one transaction; `LOCK TABLE` like `00020`; guards in the `00020` style):
  - **Pre-guards:**
    - `PTP` and id 61 are both absent from `teams`;
    - `NOB` exists;
    - no series `(1968, PTP, NOB)` exists;
    - the archive is at 178 series and `00020` is applied (the 42/0 check reads 0);
    - otherwise abort, with a re-measure instruction.
  - **Insert** into `teams` the row `(61, 'Pittsburgh Pipers', 'PTP', 'Pittsburgh', 'Pipers', logo_url 'assets/teams/Pittsburgh_Pipers.gif', espn_code NULL)`.
  - **Insert** into `series` the row `(year 1968, round 'Finals', league 'ABA', team_a PTP, team_b NOB, winner PTP, is_featured false)`, with seven `series_game_scores` rows from the CSV and `winner_team_id` per game by score.
  - **Post-guards:**
    - 179 archived series;
    - the new series derives phase `archive` (exactly games 1–7, winner set);
    - the series score is 4–3 with 3–3 after six;
    - the Game 1 and Game 7 hosts = `team_a`;
    - the earlier rows are untouched (a fingerprint of the 178 rows' series and game data before and after).
  - **Idempotent:** if the series and team already exist exactly as specified, it is a no-op.
- **A test** pins `00021`'s literals to the CSV, and the CSV to the table above.
- **Rehearsal (same commit):**
  - `COVERED_THROUGH = 21`, with a section exercising `00021`: insert, guards rejecting, re-apply no-op;
  - every pin that assumes 59 teams or 178 series after the replay is updated deliberately (`EXPECTED_TEAM_COUNT` and section 9's post-replay counts);
  - the CI trigger list includes the new CSV.
- **Counts:**
  - `docs/CURRENT_DATA_MODEL.md` (census 179: 160 NBA/BAA + 19 ABA; the 1968 series' venues are real for all seven games; a teams note for `PTP`);
  - tests and probe expectations that pin 178 / 18 are updated, or stated as historical (e.g. `00020`'s own 178 literals stay as written);
  - the prerender then yields 184 series pages and 189 sitemap URLs.
- **AGENTS.md** says "178" in the rule just rewritten by 6.10. Per the standing rule this is a **deferred-work entry** for the next between-epics window (not an edit), since it is not dangerous-now: the 42/0 check stays valid and the new row is home-first.
- **After apply (owner):**
  - an anon read showing 179 series and the new series' seven rows;
  - an insights refresh: the NBA/BAA figures are unchanged, since an ABA series does not enter the NBA/BAA census;
  - then `npm run deploy` (`og:cards` must render the PTP logo; a GIF is normalised by `sharp`).

**Never:**
- Edit `00016`, `00020`, `game7_venues_curated.csv` or `aba_game7_venues.csv`.
- Add any other missing series without an owner ruling.
- Change app code.
- Make `is_featured` true.
- Apply the migration from an agent session.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Clean apply after `00020` | 178 series, no PTP | team 61 PTP + series + 7 games; 179 archived | N/A |
| Applied before `00020` | the 42/0 check reads 42 | abort: apply `00020` first | rolled back |
| PTP or id 61 taken | an existing row | abort, naming it | rolled back |
| Re-apply | already present, identical | no-op | guards pass |
| Score mismatch in cross-check | the second source disagrees | no migration emitted; owner ruling | report |
| Another 7-game 1968 series found | the coverage check | named in the report, not added | owner ruling |

</frozen-after-approval>

## Code Map

- `supabase/migrations/00005_release_1_data_model.sql:14-55`: `teams` (`id INTEGER PRIMARY KEY`, explicit ids; `full_name` and `abbreviation` UNIQUE), `series` (uuid default), `series_game_scores` (`UNIQUE (series_id, game_number)`).
- `00014`: `series_year_team_pair_key UNIQUE (year, team_a_id, team_b_id)`. `00018`: `teams.espn_code` (nullable; `PTP` gets NULL). `00019`: `series.is_featured` (default false).
- `00020_archive_home_court_first.sql`: the guard and lock style to mirror, and its 42/0 applied check.
- **Live (anon, 2026-10-09):** 59 teams, max id 60 (`WSC`). `NOB` is id 46 with a logo. The `MNP` Minnesota Pipers is id 44 (a different row; do not reuse it).
- `scripts/rehearse-migration-00014.mjs`: `COVERED_THROUGH` (20), `venueBackfill.EXPECTED_TEAM_COUNT=59` (`:176`, `:395`), the section 9 post-replay 178 pins, and the fixture seeding. `tests/pipeline/insights-refresh.test.ts` (the migration list) and `tests/pipeline/workflows.test.ts` (the trigger paths).
- `public/assets/teams/Pittsburgh_Pipers.gif`: the owner's logo, untracked; commit it with this story.
- `supabase/scripts/pipeline/data/aba_game7_venues.csv`: the style model for the new CSV.

## Tasks & Acceptance

**Execution:**
- [x] The coverage check and the score cross-check (report in Implementation Notes).
- [x] `supabase/scripts/pipeline/data/aba_1968_finals.csv`, plus its test.
- [x] `supabase/migrations/00021_add_1968_aba_finals.sql`.
- [x] Rehearsal (`COVERED_THROUGH = 21` plus a section; the team and series count pins), the CI trigger, the migration list.
- [x] `docs/CURRENT_DATA_MODEL.md`; the logo committed; a deferred-work entry for the AGENTS.md "178".
- [x] The owner apply checklist (after `00020`).

**Acceptance Criteria:**
- Given `npm run gate` and the Docker rehearsal, then both are green.
- Given the owner applies `00020` then `00021`, when an anon read runs, then there are 179 archived series, the 1968 Finals has 7 games with a 4–3 PTP win, PTP is the first team, and the next deploy renders its card and page.

## Implementation Notes

- **Coverage check (2026-10-09, 2 page reads, web tool, no script):** basketball-reference `ABA_1968` and Wikipedia "1968 ABA playoffs". The 1968 Division Semifinals were best-of-five (MNM–KEN and NOB–DNR went 3–2; PTP–IND and DCH–HMV 3–0); both Division Finals went 4–1. **The Finals is the only 1968 ABA series that went seven games** — nothing to name for an owner ruling.
- **Score cross-check:** all 7 games agree between the two sources on date, venue and both scores (7 of 7); Wikipedia names the arenas (Civic Arena, Pittsburgh; Loyola Field House, New Orleans) and marks Game 4 as OT. No mismatch, so the migration was emitted.
- **Spec fact correction (no intent change):** the archive does hold one 1968 series — the NBA Eastern Division Finals (anon read 2026-10-09). "No 1968 series at all" is true for ABA only; the rehearsal pre-state and the docs say "no 1968 ABA series".
- **Live state measured 2026-10-09 (anon):** 178 archived; 0 archived NBA/BAA series with Game 7 host ≠ `team_a`, Game 7 and game 1 home = `team_a` on 178/178 — production already reads as `00020` applied, so `00021`'s `archive_state` guard is satisfied today. `round` for ABA Finals rows is `Finals` (1971, 1973), matching the spec.
- **Logo:** `sharp` (via `scripts/og/card.ts` `normaliseLogo`) decodes `Pittsburgh_Pipers.gif` (250×150 GIF89a) to PNG.
- **Pins updated:** rehearsal `COVERED_THROUGH = 21`, section 10, post-replay `SERIES_AFTER_REPLAY = 179` / `TEAMS_AFTER_REPLAY = 60` (`venueBackfill.EXPECTED_TEAM_COUNT` stays 59 — it pins the 00005+00007 seed parse, not the table); `drill-2-7-reconcile.mjs` (179 / 1,253 / 19 ABA) and `measure-predict-latency.mjs --archive-read` (179 rows, 20 chips) — both red against production until `00021` is applied, by design. Kept as historical: `00020`'s 178 literals, `game7_venues_curated.csv` (178 rows, 00016's input) and its tests, `drill-2-7-local-stack.mjs` (a local fixture), CHANGELOG's 183/188.
- **Review iteration 1 (2026-10-09):** P1–P10 applied (P9's citation format is uniform across all 14 citations, and `scripts/og/card.ts` imports under Vitest, so neither was deferred); D1–D2 logged to `deferred-work.md` (Story 6.11 section, target 6.8).

## Spec Change Log

## Review Triage Log

Three layers on `diff-6-11.patch` (92 kB): blind-hunter (floor 10), edge-case-hunter (claims = this spec), verification-gap. 2026-10-09.

**Patch (iteration 1):**
- P1 (blind) — the docs contradict themselves on `00020`. Measured live 2026-10-09: it is applied (178 archived; Game 7 host ≠ `team_a` 0, Game 1 host ≠ `team_a` 0; NBA/BAA home wins 117/160, ABA 12/18). Fix: mark § "Story 6.10 status" **APPLIED** with that read-back, and change the 6.11 checklist to "apply `00021` alone (`00020` already applied)". This also settles the 178-vs-179 read-back confusion that a combined push would have caused.
- P2 (blind) — the CSV header says "record of the home side 4-3". The per-game home record is 3–4; the 4–3 is PTP's series record (and PTP is the home-court team). Fix: reword.
- P3 (edge) — a `full_name = 'Pittsburgh Pipers'` row under another id would hit `teams_full_name_key` and fail with no named guard. Fix: add it to the `team_slot` pre-guard, plus a rehearsal tamper.
- P4 (edge + blind) — the exact re-apply aborts once the archive grows past 179. Fix: in no-op mode (team and series exact), the archive check accepts ≥ 179. The first-apply path keeps exactly 178. Document in the migration header and the data model doc that `00020` and `00021`'s first-apply counts are pinned to the 2026-10-09 size.
- P5 (edge) — `other_rows_unchanged` excludes any 1968 series involving PTP, not only the PTP/NOB pair. Fix: narrow the exclusion to the exact `(1968, PTP, NOB)` row.
- P6 (blind + verification) — rehearsal gaps:
  - add a tamper of an id-61 PTP row that differs only in `logo_url` (fires `v_team_exact`);
  - add a re-apply tamper with a divergent venue (game 3 hosts swapped, scores kept);
  - add a game-7-only host tamper for `hosts_are_team_a`.
- P7 (blind) — the line references in the `tests/pipeline/workflows.test.ts` comment are stale. Fix: refer to the reads by data-file name or section, not line numbers, and include `aba_1968_finals.csv`.
- P8 (blind) — the `### teams` doc line says "`00007` (ids 31–60)", but `00007` seeds 29 rows with id 41 absent. Fix: say so, and record why `00021` takes 61 rather than filling 41 (it is the next id after max = 60; ids are never reused).
- P9 (blind) — nothing checks the citation text against the row values. Fix: the CSV test parses each row's `source` / `cross_check` for the date and both scores and asserts they match the row's columns, if the citation format is uniform. If it is not uniform, record that and defer.
- P10 (blind) — nothing proves the GIF decodes in `og:cards`. Fix: a test that calls `normaliseLogo` (`scripts/og/card.ts`) on `public/assets/teams/Pittsburgh_Pipers.gif` and gets a PNG, if `card.ts` is importable under Vitest. Otherwise defer.

**Defer (deferred-work.md, Story 6.11 section):**
- D1 (verification) — `src/lib/team-logos.ts` has no `PTP` / "Pittsburgh Pipers" alias. Typing "Pipers" resolves to `MNP`. The seed-alias oracle in `team-logos.test.ts` reads only `00005` + `00007`, so it cannot see migration-added teams. App code is out of scope here (Never). Target: 6.8, which already edits the team-name surfaces. Widen the oracle to every `INSERT INTO public.teams` across `supabase/migrations/*.sql`.
- D2 (blind + edge) — stale "178" in comments under `src/`: `HistoricalPage.tsx:24,84-90,229`, `insights.ts:6`, `spoiler-neutral.ts`, `prerender/preload.ts`. The `PP`/`PTP` initialism case adds a 40th series / 48th cell / 21st franchise to the `HistoricalPage.tsx:229` comment. Target: 6.8 (`spoiler-neutral.ts` is retired there anyway).

**Reject:**
- R1 (blind) — branch the drill pins on a measured marker. The pins are deliberate. The red window closes at the owner's apply, and this repo's discipline is "a mismatch is a finding". A marker branch would also make a missing row read green.
- R2 (blind) — the order of the two 1968 series is undefined. This is pre-existing: several years already hold several series, and there is no snapshot that assumes one row per year (the gate is green with 179 in the fixtures). It belongs to 6.1's URL and catalog work if anywhere.
- R3 (verification, other) — `teams` is at 60 during rehearsal section 9. Informational; no check depends on it.
