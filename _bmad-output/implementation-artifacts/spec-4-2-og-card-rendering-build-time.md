---
title: 'Story 4.2 — OG card rendering: build-time card renderer'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: '7ff3a2e4379ee3e88d09e6a046c2a6069a492ff1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spike-4-2-og-card-rendering.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Share links can only unfurl as cards if every series has a card image. Story 4.3's prerendered pages will reference these images as `og:image` (AD-6/AD-7 as amended 2026-10-07, proposals b and c). No renderer exists yet. The spike also found two traps:
- 10 of the 59 logos (8 `.webp`, BLB `.gif`, KCK `.avif`) render as **blank chips with no error**;
- 15 of the 17 stored round names overflow one line.

**Approach:** Implement `epics.md` Story 4.2:
- A gated TypeScript build step in `scripts/og/`, run with Node's native type stripping as the pipeline's `run.ts` is.
- It reads every series that derives a phase (archive **and** pending, via `deriveSeriesPhase`) with the anon key.
- It normalises each logo from `public/` to PNG with `sharp`, then renders the DESIGN.md card with satori + resvg.
- Output: `dist/og/<series-id>.png` plus `dist/og/fallback.png`, each 1200×630.
- It runs in `predeploy` after the gate. Any failure exits non-zero.

## Boundaries & Constraints

**Always:**
- The card matches DESIGN.md · OG card and `mockups/key-og-card.html`:
  - ink `#1A1A1A` field, `#FAFAFA` type, 64 px margins;
  - logos on `#FFFFFF` chips 232 px / radius 28 / logo 192 px `contain`, with 3-letter abbreviations at 64 px mono;
  - center slot fixed at **296 px**, with `{YEAR}` over the **stored round name (uppercase, wrapped, never abbreviated)**, over "GAME 7" (20 px, `#8A8A8A`);
  - lower band: hairline rule, wordmark "PredictGame7" 48 px, tagline "Where data meets playoff drama" 20 px `#D4D4D4`;
  - fonts: Montserrat (400/500/600) and JetBrains Mono 700, from `@fontsource/*` woff files in `node_modules`, never fetched.
- **No series score, no winner, no prediction output** on any card. That covers pending series too.
- The fallback card has the wordmark and tagline only, and no teams.
- **Every logo goes through `sharp(...).png()`** before embedding, whatever its extension. A logo that fails to decode, or is missing on disk, fails the run with its team code and path named.
- Phase comes from `deriveSeriesPhase` (AD-4). Never `status`, dates or `league`.
- A failed series render exits non-zero after listing every failure. No partial output may pass silently.
- The renderer is pure over its inputs (series rows plus logo bytes in, PNG bytes out), so tests need no network or DB.

**Never:**
- Change `public/assets/teams/*`, `teams.logo_url` or any migration.
- Add a Supabase Edge Function, or anything that needs a deploy step beyond `npm run deploy`.
- Emit OG `<meta>` or page HTML (Story 4.3).
- Abbreviate round names.
- Run the DB read inside `npm run gate`/CI, because the gate has no Supabase secrets. The DB read happens only in `predeploy`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Historic card | archived series, PNG logos | `og/<id>.png` 1200×630 with both logos visible, abbreviations, `{year}`/round/GAME 7, no score or winner | N/A |
| Converted logo | a `.webp`, `.gif` or `.avif` logo (DNR, BLB, KCK) | Logo region is **not blank** (non-white pixels present inside the chip) | N/A |
| Longest round | "Western Division Semifinals", "Western Conference Finals" | Wraps inside the 296 px slot; both team blocks fully on the canvas | N/A |
| Pending series | `winner_team_id` null, six games | A card is rendered the same way (there is no outcome to hide) | N/A |
| Fallback | always | `og/fallback.png`: wordmark + tagline only | N/A |
| Bad logo | missing file or undecodable bytes | Run exits non-zero, naming the team code and path | fail loud |
| Non-reconciling row | `deriveSeriesPhase` → null | Skipped and listed in the run summary (it has no page either) | reported |
| DB unreachable | no `.env` / network error | Exits non-zero with the reason; no `dist/og` claims success | fail loud |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/run.ts` is the pattern to copy: a TS entry run by `node` with type stripping (`erasableSyntaxOnly`), `process.exitCode` rather than `exit()`, and env from `process.env`. The operator form is `node --env-file=.env …`.
- New `scripts/og/`:
  - `card.ts`: the pure satori tree for the historic and fallback cards, plus `renderCard(input) → Promise<Buffer>` (satori → resvg) and `normaliseLogo(bytes) → Promise<Buffer>` (`sharp().png()`).
  - `render.ts`: the entry. It reads series with `SERIES_SELECT`-equivalent columns (id, year, round, `winner_team_id`, `team_a`/`team_b` abbreviation + `logo_url`, `series_game_scores`) over anon REST using `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, filters with `deriveSeriesPhase`, renders into `dist/og/`, prints a summary (count, seconds, total MB, skipped, failures) and exits non-zero on any failure.
  - Imports must be relative with explicit `.ts` and erasable syntax only. `src/lib/series-phase.ts` is already importable from the pipeline program.
- `src/lib/series-phase.ts:39` `deriveSeriesPhase`, and `src/lib/series-query.ts:13` `SERIES_SELECT`: reuse them, never re-derive.
- `tsconfig.pipeline.json` `include`: add `"scripts/og"`.
- `biome.json` `files.includes`: add `"scripts/og/**/*.ts"`. Today `scripts/**` is unlinted.
- `package.json`:
  - devDependencies: `satori`, `@resvg/resvg-js`, `sharp`, `@fontsource/montserrat`, `@fontsource/jetbrains-mono`. The spike used satori 0.35.1, resvg-js 2.6.2 and sharp 0.35.5.
  - `"og:cards": "node --env-file=.env scripts/og/render.ts"`.
  - `"predeploy": "npm run gate && npm run og:cards"`.
- New `tests/og/card.test.ts` (node env, runs in the gate). It renders from fixture inputs plus real repo logo files:
  - the two longest round names;
  - DNR `.webp`, BLB `.gif` and KCK `.avif`;
  - the fallback;
  - and a pending-series input.

  It asserts 1200×630 via `sharp().metadata()`, non-blank chip regions by sampling raw pixels inside each 232 px chip, and that the rendered SVG text (satori output) contains no score digits pattern and no winner name. It also asserts `normaliseLogo` rejects garbage bytes.
- `docs/` and `README`: no change, since there is no user-facing surface yet. Story 4.3 wires `og:image`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`: devDependencies and the `og:cards` / `predeploy` scripts.
- [x] `scripts/og/card.ts`: the card trees, `renderCard` and `normaliseLogo`.
- [x] `scripts/og/render.ts`: the read, filter, render and summary entry, with exit codes.
- [x] `tsconfig.pipeline.json` and `biome.json`: include `scripts/og`.
- [x] `tests/og/card.test.ts`: the matrix rows that need no DB.
- [x] Run `npm run og:cards` once locally against the live archive, outside the gate. Record count, seconds and total size in Implementation Notes, and visually check 3 cards (one converted logo, one 3-line round, the fallback).

**Acceptance Criteria:**
- Given `npm run gate`, then green, with the new tests running in it.
- Given `npm run og:cards` with `.env`, then exit 0 and one PNG per phase-deriving series plus `fallback.png`, all 1200×630. Time and size are recorded.
- Given a deliberately unreadable logo in a test, then the run/test fails with the team code named.

## Implementation Notes

**Local run, 2026-10-07** (`npm run og:cards` against the live archive, outside the gate, Node 24.19.0, Windows 11):
- Exit 0. 179 PNGs written: 178 series plus `fallback.png`, from 178 series read. Skipped: none. There is no pending series in the table today.
- 43.9 s on the first run and 49.3 s on the second, against the spike's 46.4 s.
- 16.29 MB total, about 91 KB per card. The spike estimated ≈10 MB. Recompressing every PNG with sharp at level 9 only reached 14.0 MB, so it was not adopted.
- All 179 files measured 1200×630 with `sharp().metadata()`.
- Visual check:
  - 1981 KCK–PHX (`.avif`) and 1970 NYK–BLB (`.gif`, with a space in the filename): both logos are visible.
  - 2026 OKC–SAS "Western Conference Finals": 3 centred lines, clear of both chips.
  - Fallback: wordmark and tagline only.
- Without env, `node scripts/og/render.ts` exits 2 with the reason and leaves no `dist/og`.

**Choices the spec left open:**
- `normaliseLogo` also caps the longest edge at 384 px (2× the 192 px box, `withoutEnlargement`) before `.png()`.
- The read reuses `SERIES_SELECT` itself via supabase-js with the anon key. It does not use a hand-written column list.
- An empty series read fails the run, so a card set with only the fallback cannot ship.
- On any failure, `dist/og` is removed: at the start of the run, and again before a non-zero exit.
- The test asserts the exact text-node list of each card, taken from satori's `onNodeDetected`. It does not scan the SVG, because satori outlines text into paths.
- The chip blank check measured 0 ink pixels on a raw, unconverted webp. That confirms it detects the failure it guards against.

- **Orchestrator re-check after the review patches (2026-10-07):**
  - `npm run gate` exit 0 (29 files / 629 tests).
  - `npm run og:cards` exit 0: 179 written (178 series + 1 fallback), 39.2 s, 16.29 MB, nothing skipped.
  - KCK (`.avif`) card inspected: the logo renders, and "Western Conf Semifinals" wraps to 2 lines.
  - **Size note:** 16.29 MB is about 60% above the spike's ≈10 MB estimate. sharp level-9 recompression reached only 14.0 MB. It is acceptable for `gh-pages`, whose publishes are additive and deduplicate identical bytes, but palette quantisation is the lever if size ever matters.

## Spec Change Log

- 2026-10-07, from review: the `og:cards` script uses `node --env-file-if-exists=.env`, not the Code Map's `--env-file=.env`. With no `.env`, plain `--env-file` makes Node fail before the step can print its own missing-env message. Also from review: a run where every row is skipped now exits 2, the same as an empty read, so a fallback-only set cannot ship.

## Review Triage Log

Pass 1 (2026-10-07). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| V2/E1/E12 | The entry guard (`resolve(argv[1]) === fileURLToPath(import.meta.url)`) is never exercised by the gate. A guard that silently fails to fire (symlink or junction path, or a later rewrite) makes `og:cards` exit 0 having written nothing, and `predeploy` goes green | medium | Pre-verified by V: no spawn test exists, and every test calls `runOgCards` with an injected `outDir`. Fix: `realpathSync` on both sides, plus a `spawnSync(process.execPath, ['scripts/og/render.ts'])` smoke test with no Supabase env, asserting exit 2 and the env message | patch |
| E3/B1/E2 | Every row skipped by `deriveSeriesPhase` (for example if the anon read of `series_game_scores` breaks) leaves `fallback.png` only, and the run exits 0 | medium | Verified in `render.ts`: the `rows.length === 0` guard runs before the filter, and no check follows it. This contradicts Implementation Notes ("a deploy can't ship with only the fallback card") | patch |
| V1 | The "round wraps inside the 296 px slot" assertions measure a fixed-width box, so they cannot fail | medium | Pre-verified by V with a deleted probe: an unwrappable 38-character word reports the same `width:296, left:452` and passes all four assertions. `inkInChip` misses light text on a white chip. Fix: assert the ink-field gutters between chips and slot hold no type-coloured pixels, plus a negative control (an overlong word) that the assertion catches | patch |
| E4/B8 | The logo cache stores the first requester's team code in its rejection, so a shared `logo_url` that fails names the wrong team | low | Verified: the cached promise's message closes over the first `team`. A direct fix builds the message at the call site, which the AC ("naming the team code") requires | patch |
| E7/B9 | The summary prints `rendered - 1 series + fallback` even when the fallback failed | low | True. Direct fix: count series cards and the fallback separately | patch |
| B2 | Through `npm run og:cards`, a missing `.env` fails inside Node (`--env-file` not found) before the designed message | low | True. Direct fix: `--env-file-if-exists` (Node ≥ 22.9; the operator runs 24.19) | patch |
| B14 | Three `runOgCards` tests that load fonts and render the fallback run on Vitest's 5 s default while their siblings get 30 s | low | True. Flake risk on a cold runner. Direct fix: give them the same timeout | patch |
| B3 | AGENTS.md says `scripts/` is unchecked except for the pipeline, and that `predeploy` = gate. Both are now stale (`scripts/og` is gated; `predeploy` also needs `.env` and a live read) | low | True. The fix edits an agent-context file | defer |
| E5/E6 | A remote (`https://`) or `..` `logo_url` is mishandled | low | Not present: all 59 `logo_url`s are site-relative `assets/teams/…` (spike sweep). A guard for undemonstrated state | reject |
| E8/E9/B7 | Empty or over-long abbreviations are not validated | low | All 59 are 3 characters (spike sweep). A guard for undemonstrated state | reject |
| B6 | Non-latin characters in `round`/abbreviation would render as tofu | low | All 17 rounds are ASCII (spike sweep). A guard for undemonstrated state | reject |
| E10/B5 | Future round names could overflow vertically or into the band, and there is no line cap | low | Current data fits (max 3 lines, rendered). V1's gutter test plus negative control pins the horizontal case. Vertical overflow needs a 4-line round no archive row has | reject |
| E11 | PostgREST max-rows (1000) could truncate the read | low | 178 rows today, about 4 new per season. Decades from reachable | reject |
| B4 | No `engines` floor for native type stripping | low | CI pins `22.x` (latest is ≥ 22.18) and the operator runs 24.19. The pipeline's `run.ts` relies on the same thing with no floor | reject |
| B10 | `gh-pages` never prunes stale cards | low | Series are never deleted or re-keyed (AD-5 identity). AGENTS.md already records that publishes are additive | reject |
| B11 | Rendering is serial (about 40 s) | low | A performance nicety, and 40 s per deploy is acceptable | reject |
| B12 | The tests lay out each card twice | low | Test-time cost only. Refactoring the API for it adds surface | reject |
| B13 | No run-level assertion that a `winner_team` name never reaches the card | false | Structurally impossible: `SeriesCardInput` has no winner field, and `render.ts` maps only year, round, abbreviations and logos. The exact text-node list test pins the rendered text | reject |

## Design Notes

**Why render pending series too.** Story 4.3 prerenders an Active series' preview page in season, and that page needs a card. The historic card already shows no outcome, so a pending series' card is identical in kind.

**Why `predeploy` and not `build`.** `npm run build` runs in CI and in the gate, which have no Supabase secrets (AGENTS.md). The card step needs the anon read, so it sits after the gate in `predeploy`, where `.env` exists. It is the same position AD-7 gives the prerender.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0.
- `npm run og:cards` -- expected: exit 0, with the summary printed and `dist/og/*.png` present.
