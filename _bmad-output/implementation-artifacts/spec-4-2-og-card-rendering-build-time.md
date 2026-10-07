---
title: 'Story 4.2 — OG card rendering: build-time card renderer'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: '7ff3a2e4379ee3e88d09e6a046c2a6069a492ff1'
route: 'dispatch'
review_loop_iteration: 2
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

### Review Findings

Pass 2 (2026-10-07). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V), acceptance-auditor (A). Pass 1's table is in `## Review Triage Log`; pass 2 re-reviewed the whole `7ff3a2e..872d32d` diff, patches included.

- [x] [Review][Patch] Entry defaults and the packaged command line are pinned by no test, and the spawn test deletes the real `dist/og` on every `npm test` [scripts/og/render.ts:69,74; tests/og/card.test.ts:376] — V (pre-verified) + B. `outDir`/`publicDir` defaults are exercised by no test (every `runOgCards` test injects a tmp dir; the spawn test exits at the env check before writing), so a mis-derived `repoRoot` ships a `gh-pages` publish with no `og/` directory while the gate, `og:cards` and `predeploy` all stay green and every Story 4.3/4.8 `og:image` 404s. Separately, `rmSync(outDir)` at `render.ts:74` runs before the env check, so the no-env spawn test wipes the repo's real `dist/og` as an unasserted side effect. And the test hand-writes `['scripts/og/render.ts']` instead of the `og:cards` line in `package.json:13`, so a path or flag move surfaces only at deploy time. **APPLIED 2026-10-07:** `REPO_ROOT`/`DEFAULT_OUT_DIR` exported and pinned by a test that derives the repo root a second way from the test file; env check moved before the `rmSync`, so a no-env run deletes nothing (new assertion, mutation-proven); the spawn test now builds its argv from `package.json`'s `og:cards` line with the env-file target redirected to an empty temp file, so the real flags and path run without touching the live database or `dist/og`.
- [x] [Review][Patch] Entry guard keeps a silent exit-0 branch [scripts/og/render.ts:200-203] — A. `existsSync(process.argv[1])` short-circuits `isEntry` to false when the launcher's path does not resolve, so the step exits 0 having written nothing and `predeploy` goes green — pass 1's V2 failure shape from a different branch. Fix: drop the `existsSync` test and let `realpathSync` throw (non-zero), which is this story's established fail-loud rule. **APPLIED 2026-10-07:** guard dropped, and a spawned test imports the entry with an unresolvable `argv[1]` and asserts non-zero + `ENOENT`; mutation-proven — re-instating `existsSync` turns that test red with `expected +0 not to be +0`.
- [x] [Review][Patch] `epic-4-context.md` rewrite dropped standing constraints its downstream stories read as authority, and mis-states the card population [_bmad-output/implementation-artifacts/epic-4-context.md] — B + E + A, one root cause. Dropped: the `og:description` copy and its `EXPERIENCE.md · Voice and Tone` pointer (the new "OG meta copy" section carries titles only); the token floor (`#767676`/`#B91C1C`/`#595959`/`#949494`, UX-DR-5) with `prefers-reduced-motion`, light-mode-only and "no new radius, elevation or color token"; the retry-panel a11y detail (`role="status"`, Retry as first tab stop, inputs preserved); the NFR-S1 security bullet; the AD-2 `SharePayload` "define it once before either diverges" guard while 4.4 is open. Also wrong: "writes `dist/og/<series-id>.png` for every **archived** series" — `render.ts:139` renders every phase-deriving series, pending included (this spec's Design Notes own that widening; `epics.md:822` still says archived). Owner decision 2026-10-07: restore in-story. **APPLIED 2026-10-07, partly by the other session:** the Story 4.3 session rewrote this same file and committed it (c34d676) with four of the five already restored — the token floor, the `SharePayload` single-source line, `og:description` in the OG-tags bullet, and the PostHog-key rule under Analytics port (AD-1). This patch adds what was still missing: `form-border #949494` and the "no new radius, elevation or color token" clause on the token floor, the `EXPERIENCE.md · Voice and Tone · OG meta copy` pointer for the per-variant titles and descriptions, and the card population corrected to "every phase-deriving series — archive **and** pending, never `status`, dates or `league`". The retry-panel a11y detail was left to the code that now carries it (`src/pages/series/SeriesFetchFallback.tsx:23` sets `role="status"`), so no doc line was re-added for it.
- [x] [Review][Patch] Documented two-command deploy runs the gate and the card render twice [package.json:12-14] — A. `predeploy` = `npm run gate && npm run og:cards`, and npm auto-fires the `predeploy` lifecycle when `deploy` runs, so the AGENTS.md flow (`npm run predeploy` then `npm run deploy`) pays ~90 s and a second live anon read, the extra one able to fail a deploy the first pass already cleared. Owner decision 2026-10-07: collapse the documented flow to `npm run deploy` alone (npm fires the hook once). Pre-existing for `gate`; doubled by this story adding `og:cards`. **APPLIED 2026-10-07:** AGENTS.md's Deploy line rewritten to one command, with the double-run prohibition and the `og:cards` env/live-read dependency stated. This also closes the Deploy half of pass 1's deferred B3; the coverage-paragraph half (that `scripts/og/**` is now gated) stays deferred.
- [x] [Review][Defer] "`share-og` is retired" has no referent [epic-4-context.md · Technical Decisions] — deferred: pre-existing prose. `supabase/functions/` never contained a `share-og` (the Edge Function was cut before it was built; the sprint key `4-2-og-card-rendering-share-og-edge-function` is the only trace). Natural owner: the same doc pass as pass 1's deferred B3.
- [x] [Review][Defer] Frozen "Always" cites a mockup that still ships the dropped variants [_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/mockups/key-og-card.html] — deferred: design-phase artifact, not this story's surface. It is titled "3 variants" and still renders the custom-matchup eyebrow/VS block that AD-6's 2026-10-07 amendment and DESIGN.md:150 dropped. `DESIGN.md` records the drop, so the card code is right and the frozen clause's second reference is stale. Settling it needs an owner provenance note on the mockup, and the spec's frozen block cannot be edited without the owner.

**Rejected (pass 2), with the check that settles each:**

- E (×3) — no fetch timeout on the series read, no `max-rows` truncation guard, no `year`/`round` null validation: guards for undemonstrated or impossible state. `series.year`/`round` are `NOT NULL` (`00005_release_1_data_model.sql:27-28`), the read is 178 rows against a 1000 cap and pass 1 already triaged that "decades from reachable" (E11), and no run has ever stalled rather than resolved.
- B — "the blank-chip guarantee has no production enforcement": mechanically excluded. `normaliseLogo` forces every logo through `sharp().png()` before embed, and resvg's blank-box defect is specific to raw `.webp`/`.gif`/`.avif` data URIs (spike finding 1), so post-conversion blankness cannot arise. The three tested files cover all three failing extensions, and every `og:cards` run pushes all 59 logos through the same path.
- B — the 1080×540 safe zone is unasserted: the frozen layout satisfies it by construction (64 px margins exceed the 60/45 px insets). The requirement is recorded in `epics.md` UX-DR-1 and `EXPERIENCE.md:151`, and asserting it would re-test the margin constant.
- B — "no performance budget survived the re-cut" / "the ~40–50 s `predeploy` cost was never accepted": the deleted budget bounded the retired Edge Function's ~1 s redirect; the build's measured 43.9/49.3/39.2 s and 16.29 MB are recorded here with dates, and pass 1 triaged the serial render as acceptable (B11).
- B (×3) + A (×1) — spec bookkeeping: the Change Log/Code Map not re-cut for the seven pass-1 patches, the I/O matrix missing the all-skipped row, the frontmatter `status`/`review_loop_iteration` disagreeing with `sprint-status.yaml`, and the AC's "SVG text contains no score digits" not matching the delivered text-node assertion. Every one is an edit to the spec under review, which no review layer may make; the SVG-text wording is already resolved in Implementation Notes (satori outlines text into paths), and the status fields are this workflow's to write at the end.
- A — fallback-only sets, empty reads and DB-unreachable paths shipping silently: already pinned by `render.ts:85,168-170` and the pass-1 tests at `card.test.ts:325,330`, which fail on inversion.

**Pass-2 triage outcome:** 0 decision-needed outstanding (both resolved by owner 2026-10-07 → patch), 4 patch, 2 defer, the remainder rejected on verification. Layers: all four reported; none failed. All four patches applied 2026-10-07/08: the two code patches with mutation proof (see Implementation Notes), the AGENTS.md Deploy line, and the `epic-4-context.md` restorations — the last shared with the Story 4.3 session, whose own rewrite (committed as `c34d676`) restored four of the five dropped items before this story's patch added the rest.

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

**Pass-2 review patches, applied and mutation-proven (2026-10-07, 21:13 local):**
- `npx vitest run tests/og/card.test.ts` — 20 passed (2 new entry-seam tests + the extended no-env test).
- `npx biome lint scripts/og tests/og` — clean. `npx tsc -b` — exit 0.
- Mutations, each run against the new test and then reverted (render.ts verified byte-identical to its pre-mutation state after every one):
  - `DEFAULT_OUT_DIR` pointed at `<repo root>/og` → "defaults write to <repo root>/dist/og" **red**.
  - `rmSync` moved back above the env check → "fails loud with no env **without touching the previous output**" **red**.
  - `existsSync(process.argv[1])` re-added to the entry guard → "exits non-zero rather than quietly skipping the run" **red** with `expected +0 not to be +0`, i.e. the silent exit-0 pass-1 patched around is now caught.
- **Gate (2026-10-07 22:15 commit-aligned; the machine clock read 10-08 06:14), `npm run gate` as one command on the tree at `a9c9334`:** all four legs green in sequence — lint, `tsc -b`, `npx vitest run` (33 files / 658 tests), then `npm run build` exit 0 with the `/predictgame7/` asset prefix and the `404.html` byte-copy check both confirmed. The build output below the chain's own `&&` gates is the evidence the earlier legs passed. Story 4.3's in-flight `src/pages/**` work was committed at that point, so this is a clean whole-tree reading, not one mixed with someone else's uncommitted edits; this story's two changed surfaces are additionally pinned individually by `npx vitest run tests/og/card.test.ts` (20 passed) and `npx biome lint scripts/og tests/og` (clean).
- **Not run:** `npm run og:cards` — it needs the live anon read and `.env`, and the owner had not asked for a release. Pass 1's local run (179 PNGs, 39–49 s, 16.29 MB) is the recorded evidence for that command; pass 2 changed only the entry guard's ordering and its seam tests, not the card tree or the read.
- **Collateral to record:** `dist/og/` (the 179 PNGs from the 20:22 local run) is absent. It is gitignored build output, regenerable with `npm run og:cards` (~40 s, live anon read), and no `gh-pages` branch was touched. Two writers could account for the deletion in the 20:48–21:11 window — the parallel session running `npm test` against the pre-fix spawn test (which is exactly pass 2's P1 footgun, occurring for real), or this session's `rmSync`-ordering mutation probe. Not attributed; recorded either way.

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
