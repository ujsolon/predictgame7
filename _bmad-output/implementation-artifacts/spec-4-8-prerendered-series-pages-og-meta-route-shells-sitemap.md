---
title: 'Story 4.8 — Prerendered series pages, OG meta, route shells and sitemap'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '0421cdc0dc5dc26a2226036f1b91573c118a7229'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every `/series/<id>` URL is served today through `404.html` as an empty SPA shell, with no per-series HTML, no OG/Twitter meta, no sitemap and no static shells for the app routes. Crawlers and link unfurlers therefore see nothing, and the archive cannot rank or unfurl (AD-6/AD-7).

**Approach:** Implement `epics.md` Story 4.8. A `predeploy` step **after `og:cards`** reads every series with the anon key and renders 4.3's real route tree (the same components and routes, AD-7 "no fork") to static HTML through Vite's SSR loader. It writes:
- the per-series pages;
- per-page OG/Twitter meta pointing at 4.2's cards;
- four app-route shells;
- `sitemap.xml` and `robots.txt`.

The client **hydrates** a prerendered page from a preloaded row, which is stripped of the outcome on preview pages (deferred B10).

## Boundaries & Constraints

**Always:**
- **Route set** is derived per row through `toSeriesView` (phase via `deriveSeriesPhase`, AD-4; never `status`, dates or `league`), over every row of the live read (178 today, ABA included; never a hard-coded count):
  - archive + not flagship → `dist/series/<id>/index.html` (full record);
  - archive + flagship → that path (preview) **plus** `dist/series/<id>/result/index.html`;
  - pending → preview only, with no reveal and no result page (matching 4.3's `/result` 404).
- **Fail loud, non-zero, and remove this step's outputs** when:
  - the env is missing;
  - the read is empty;
  - **any row's `toSeriesView` is null** (deferred entry, pass 2; listed by id);
  - a pinned flagship is absent or not archived;
  - `dist/index.html` or a referenced `dist/og/<id>.png` / `dist/og/fallback.png` is missing;
  - any written file is missing or empty on read-back.

  A run that fails at the env check deletes nothing (4.2's rule).
- **Spoiler discipline in the page source (B10).** A preview page's preload is the row with the Game 7 score row removed and `winner_team_id` / `winner_team` set to null. The server renders the preview *from that same stripped row*. Nothing in a preview file may carry the following:
  - the Game 7 row or its score pair;
  - a winner id or a winner embed;
  - "win Game 7" or "4–3";
  - an outcome title or description.

  The reveal link's presence is carried in the preload explicitly (`reveal: true`), because a stripped flagship row derives as `pending`.
- **Hydration.**
  - `main.tsx` calls `hydrateRoot` only when the root holds prerendered markup, the preload path equals the current path (trailing slash ignored) and there is no `?method=` (that arrival redirects). Otherwise it calls `createRoot`.
  - Server and client share one app tree (`App` split into router + shared children). The route uses the preload instead of fetching when the path matches.
  - No hydration error is logged on a prerendered load.
  - **Pending previews refresh (owner decision 2026-10-08, review pass 1, option b).** A preview preload with `reveal: false` (a pending series) hydrates from the preload, then fetches the live row in the background. While that fetch is loading, or if it fails, the page keeps the preload view. Once it succeeds, the page renders from the live row through the normal route logic: a series archived since the build shows its current page, and an id the database no longer has shows the 404. Flagship previews, record pages and result pages never fetch, because their content cannot change. The code was kept, not reverted, at the owner's choice.
- **Meta.**
  - `<title>` and description come from 4.3's `PageMeta` via the helmet context.
  - Every page and shell adds `og:title`, `og:description`, `og:url`, `og:image` (absolute), `og:type=website`, `twitter:card=summary_large_image` and `<link rel="canonical">`.
  - Series OG copy is EXPERIENCE.md's **Historic** row on every variant: "{A} vs {B} — Game 7, {Year} {Round}" in spoiler-neutral order, with `yearRound` league wording. The description is "Every Game 7 has a history. Decode the biggest game in basketball on PredictGame7."
  - Shells use the **Fallback** row and `og/fallback.png`.
  - All attribute values are HTML-escaped. Absolute URLs sit under `https://ujsolon.github.io/predictgame7/`, with a trailing slash for directory pages (GitHub Pages 301s `/x` → `/x/`).
- **Shells:**
  - Each of `dist/{predict,historical,insights,maths}/index.html` is `dist/index.html` plus generic meta, with an empty root.
  - `dist/index.html` and `dist/404.html` are left byte-identical to the build.
- **Sitemap and robots:**
  - `dist/sitemap.xml` lists home, the four app routes and every emitted series and result URL.
  - `dist/robots.txt` allows all and contains `Sitemap: https://ujsolon.github.io/predictgame7/sitemap.xml`.
- **Checking:** the step's code is type-checked and linted by the gate. The runner is a thin Node entry, and the logic lives in `src/prerender/` with unit tests.
- **Live verification (owner decision 2026-10-08, option a):** this story closes on local verification against `dist` and `vite preview`. The live checks happen during the 0.2.9 release and are recorded with dates against this spec: a cold deep-link GET, a JS-disabled fetch, a sitemap 200, and a platform OG debugger check, which is the owner's manual step. 4.8 stays `in-review` in `sprint-status.yaml` until they are recorded. No deploy happens in this story.

**Never:**
- Bake predictions, add an Edge Function, read `series.status`, touch `dist/og` or change the card renderer.
- Run inside `npm run gate`/CI (no secrets).
- Change 4.3's page copy or behaviour beyond the `reveal` override.
- Add Share (4.4), editorial content (4.5) or analytics events.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Non-flagship archive | showable archived row | `series/<id>/index.html`: full record in `#root`, outcome title, Historic OG tags, `og:image` `…/og/<id>.png`, full-row preload | N/A |
| Flagship | archived flagship | preview page (stripped preload, `reveal:true`, reveal link in HTML, no Game 7 anywhere in the file) + `result/index.html` (full record, full preload) | N/A |
| Pending | `winner_team_id` null, games 1–6 | preview only, no reveal, no result page | N/A |
| Unshowable row | `toSeriesView` → null | build fails, listing the id | exit non-zero, outputs removed |
| Missing card | `dist/og/<id>.png` absent | build fails | exit non-zero, outputs removed |
| Flagship missing | pinned id absent or pending | build fails | exit non-zero |
| Share arrival | cold `/series/<id>/?method=elo` | `createRoot` (no hydrate), redirect to Predict as 4.1 | N/A |
| JS disabled | `curl` a series page | full content and meta in the HTML | N/A |

</frozen-after-approval>

## Code Map

- `src/App.tsx`: split into `AppRoutes` (IntersectObserver, `Layout` + `Routes`, `Toaster`, same child order) and `App` (`BrowserRouter` + `AppRoutes`). The server wraps `AppRoutes` in `StaticRouter basename="/predictgame7"`.
- `src/main.tsx`: read `#pg7-preload` (JSON), provide it through context, and choose between `hydrateRoot` and `createRoot`. `AnalyticsProvider` stays client-only (no DOM output).
- `src/components/common/PageMeta.tsx`: `AppWrapper` accepts an optional helmet `context`, which the server passes.
- `src/components/layouts/Layouts.tsx:27`: compare `isActive` with the trailing slash stripped. Shell URLs arrive as `/predict/` after GitHub Pages' 301.
- `src/pages/SeriesRoute.tsx`, `SeriesResultRoute.tsx`: when the preload matches `location.pathname`, render its variant directly and disable the fetch (`useSeriesRecord(id, enabled && !preload)`).
- `src/pages/series/SeriesPreview.tsx:41`: an optional `reveal?: boolean` prop overrides the derived `hasReveal`.
- New `src/prerender/`:
  - `preload.ts`: the `SeriesPreload` type `{path, variant:'preview'|'record'|'result', reveal, series}`, its context and hook, `stripOutcome`, and an escaped JSON serialiser.
  - `plan.ts`: rows to pages with fail-loud errors, plus flagship checks.
  - `document.ts`: template injection (head tags plus the root body plus the preload script), OG tags, shells, sitemap and robots, with escaping.
  - `entry-server.tsx`: `prerenderSite(rows, template)` → `{files, errors}`, using `renderToString` and the helmet context.
- Reuse: `toSeriesView`, `spoilerNeutralView`, `isFlagship`/`FLAGSHIP_SERIES_IDS`, `predictHref`; `scripts/og/render.ts` `fetchSeriesAnon` (export it), and its env names and entry guard pattern.
- New `scripts/prerender/run.ts` (in `tsconfig.pipeline.json`'s include, Biome-covered):
  - fetches the rows;
  - starts `createServer({ mode:'production', appType:'custom', server:{middlewareMode:true, hmr:false, ws:false}, ssr:{noExternal:['react-helmet-async']} })` (measured: helmet is CJS and fails named imports otherwise);
  - loads `/src/prerender/entry-server.tsx` with `ssrLoadModule` (never imported statically, so no JSX enters the pipeline program);
  - checks the cards, writes, reads back, cleans up on failure, and closes the server.
- `package.json`: `"prerender": "node --env-file-if-exists=.env scripts/prerender/run.ts"` and `predeploy` = `npm run gate && npm run og:cards && npm run prerender`.
- `AGENTS.md` deploy paragraph and `README` if it lists the chain: name the new step.
- Probe: `scripts/probe-deep-links.mjs` (uses `openBrowserSession` from `measure-predict-latency.mjs`).

## Tasks & Acceptance

**Execution:**
- [x] `src/prerender/preload.ts`, `plan.ts`, `document.ts` -- the pure logic -- unit-testable without a server.
- [x] `src/App.tsx`, `main.tsx`, `PageMeta.tsx`, `Layouts.tsx`, the series routes and `SeriesPreview.tsx` -- shared tree, preload consumption, hydration choice, reveal override.
- [x] `src/prerender/entry-server.tsx` -- render every planned page and shell through `AppRoutes`.
- [x] `scripts/og/render.ts` (export the fetch), `scripts/prerender/run.ts`, `package.json`, `tsconfig.pipeline.json` (if needed) -- runner and chain.
- [x] Tests:
  - `src/prerender/__tests__/prerender.test.tsx` (node env, 4.3 fixtures) covers every matrix row except the share arrival and JS-disabled rows. **The B10 assertion:** the full flagship-preview file contains no Game 7 score pair (either order), no bare `93`, no `game_number":7`, no `winner_team_id":"`/`winner_team":{`, no "win Game 7" and no "4–3", while its result file does carry them.
  - Escaping, the sitemap/robots shape, and that the shells keep an empty root.
  - Route tests: the preload path renders without a fetch, and a mismatched path fetches.
- [x] Docs: `AGENTS.md` deploy chain, `docs/CURRENT_DATA_MODEL.md` untouched (no schema change).
- [x] Local run:
  - `npm run build && npm run og:cards && npm run prerender`, against live anon data;
  - assert counts (series pages = rows + flagships), all 5 flagship previews clean against the live Game 7 scores, and `sitemap.xml` well-formed;
  - then extend the probe for a headless check on `vite preview`: zero console errors on a prerendered load, no `rest/v1/series` request, the reveal click focuses the result `<h1>`, and a `?method=` cold load redirects;
  - and a JS-disabled `curl` of one page from each variant.

**Acceptance Criteria:**
- Given `npm run gate`, then green. Given the local run above, then exit 0 and every probe row ok.
- Given a forced failure (an unshowable fixture or a deleted card), when the runner runs, then it exits non-zero and leaves no `dist/series`, shells, sitemap or robots.

## Implementation Notes

- **Files.** `src/prerender/` holds `preload.ts`, `plan.ts`, `document.ts`, `entry-server.tsx`, plus three files the Code Map did not name:
  - `build.ts`: `runPrerender`, the orchestration (env check, read, render, card check, write, read-back, cleanup), with I/O injected so the failure rows are unit-tested.
  - `outputs.ts`: `SHELL_ROUTES` / `OUTPUT_PATHS`, with no imports. The Node runner imports it at runtime to clean up when the SSR loader itself fails.
  - `types.ts`: the entry/orchestration contract, kept JSX-free.

  `scripts/prerender/run.ts` loads both `build.ts` and `entry-server.tsx` through `ssrLoadModule`, because `src/` uses the `@/` alias and extensionless imports, which plain Node cannot resolve. Its imports of the `src/prerender` modules are type-only, so no JSX enters the pipeline program (verified with `tsc -p tsconfig.pipeline.json --listFilesOnly`).
- **`Series.winner_team`** is widened to `Team | null`. That is truthful for pending rows, and it is what `stripOutcome` writes.
- **`yearRound`** is now exported from `series-view.ts`, for the Historic `og:title`.
- **Shells** get the Fallback `<title>` and description as well as the OG tags, because the built `index.html` has no `<title>`. The root stays empty.
- **`README.md` deploy block** now shows `npm run deploy` alone and names the chain. The previous text showed `predeploy` and then `deploy`, which contradicted the AGENTS.md owner decision of 2026-10-07.
- **B10 assertion.** The literal check for `winner_team_id":"` could never match, because team ids are integers. The test therefore also asserts on the parsed preload: the series-level `winner_team_id` / `winner_team` are null, and the remaining game numbers are 1–6. Per-game `winner_team_id`s for games 1–6 stay, since the preview shows those games. Score pairs are also matched with React's `<!-- -->` text separators removed: the rendered strip prints `93<!-- -->–<!-- -->89`, so a literal `93–89` search on raw HTML is vacuous.
- **Probe** (`scripts/probe-deep-links.mjs`):
  - rows 8–11 are new;
  - row 2 now accepts a prerendered file where one exists, and checks each shell's `/x/` URL with its nav item active;
  - rows 3 and 6 now load the prerendered `series/<id>/` file.

  Port 4317 was taken by another worktree's `vite preview`, so the local run used 4327.
- **Review pass 1 fixes:**
  - **Pending previews refresh** (`SeriesRoute.tsx`, owner decision 2026-10-08, option b). For a `preview` preload with `reveal: false` only, the route runs `useSeriesRecord(id, isSeriesId(id))`. It renders the preload while the fetch is `loading` or `error`, so hydration matches and a failed refresh keeps the preload. Once the fetch answers `found` or `not-found`, the normal route logic takes over. Record, flagship-preview and result preloads still never fetch. `series-preload.test.tsx` covers four cases:
    - a pending preview switches to the full record once the live row comes back archived;
    - a failed refresh keeps the preload view;
    - a vanished row renders the 404;
    - record, flagship-preview and result preloads make no request.
  - **`stripOutcome` spoiler-neutral order** (E14). `team_a`/`team_b` and their ids are put in `shouldSwapForNeutralOrder` order, and each game row is homed on the neutral-first team. Home and away ids and scores swap together; per-game `winner_team_id` is unchanged. `prerender.test.tsx` asserts that `team_a` is the neutral-first team for the 2016 flagship (no swap) and the 2026 pending row (swap), that every game is homed on it, that per-team scores are preserved, and that the rendered preview HTML and helmet head are byte-identical to the unreordered strip.
  - **`shouldHydrate`** (`preload.ts`), together with `routerPath`, is the pure predicate `main.tsx` now calls. It is unit-tested for: an empty root, no preload, another path, with and without the trailing slash, base stripping (including a `/predictgame7x` near-miss), `?method=`, and a harmless `?utm_source=`.
  - **Probe row 11: a real hydration check.** `Page.addScriptToEvaluateOnNewDocument` records `#root`'s first server-rendered element through a `MutationObserver` before the module script runs. After load, the row asserts that element is still connected and still `#root`'s first child. Negative control: pointing one record page's preload path elsewhere (forcing `createRoot`) turned that row FAIL, along with the no-series-read row.
  - **`src/prerender/__tests__/hydration.test.tsx`** (new, jsdom) hydrates `prerenderSite` output with the `main.tsx` tree (`AppWrapper > PreloadContext > App`) for record, flagship preview, flagship result and pending preview. It asserts no `onRecoverableError`, no `console.error`, and that the first root node survives. It sets `HelmetProvider.canUseDOM = false` while prerendering, because jsdom has a `window`, and it stubs `matchMedia` and the act environment.
    - It found a real defect: a slash-less server basename rendered the Home link as `/predictgame7`, against the client's `/predictgame7/`. React 18 does not patch attributes on hydration, so production would have kept the wrong `href`.
    - Fix: `entry-server.tsx`'s `basename()` returns `import.meta.env.BASE_URL` unchanged, read on every call. The test turns red if the trailing slash is stripped again.
  - **`tests/prerender/run.test.ts`** (new) spawns the `package.json` `prerender` line with `--env-file` pointed at an empty file and both `VITE_SUPABASE` vars deleted. It expects status 2 and stderr naming `VITE_SUPABASE_URL`. A second case imports the module with an unresolvable `argv[1]` and expects a non-zero exit (ENOENT). To keep that path fast, `run.ts` now checks the env before starting Vite.
  - **The `winner_team_id":"` literal is gone** from the test and the probe. Probe row 9 now parses each live flagship preview's `#pg7-preload` and asserts:
    - `variant` is `preview` and `reveal` is true;
    - the series-level `winner_team_id` and `winner_team` are null;
    - the game numbers are exactly 1–6;
    - `team_a` is the neutral-first team (the rule is restated in the probe) and homes every game.
  - **`planSeriesPages`** decides flagship, reveal and result pages from a lowercase Set built from its `flagshipIds` parameter, not the global `isFlagship`.
  - **`BASENAME` constant replaced** by `basename()` → `import.meta.env.BASE_URL`, as above. Vitest serves `BASE_URL` as `/`, so the prerender tests `vi.stubEnv('BASE_URL', '/predictgame7/')`.
  - **`src/components/layouts/__tests__/layout-active.test.tsx`** (new, jsdom) asserts that `/predict/` and `/predict` mark only Predict, and `/` marks only Home.
- **Orchestrator re-check (2026-10-08).** After the patches, `npm run gate` first exited 1 with all 711 tests green. Vitest had caught an unhandled `TypeError: Observer.restart is not a function`: `IntersectObserver`'s 100 ms timer outlived a `hydration.test.tsx` case, and `tailwindcss-intersect` has no `restart` under jsdom. It failed 3 of 3 runs. Fixed by mocking `tailwindcss-intersect` in that file. Then:
  - `npm run gate` exits 0: lint 171 files, `tsc -b`, 39 files / 711 tests, and the build with the prefix and 404 checks; a second `vitest run` also exits 0.
  - `og:cards` writes 178 + 1 cards.
  - `prerender` writes 183 series pages (173 record + 5 preview + 5 result) from 178 rows, plus 4 shells and a sitemap of 188 URLs. `dist/404.html` is still a byte copy of `dist/index.html`.
  - `probe-deep-links.mjs` against `vite preview --port 4337` is GREEN, with 92 rows ok.
- **Live checks, 0.2.9 deploy (2026-10-08), run by the agent with `curl` and the probe:**
  - **Cold deep link: ok.** `GET /series/06715a85-…?method=elo` returns `301` with `Location: …/series/06715a85-…/?method=elo` (the query is kept), then `200`.
  - **JS-disabled fetch: ok.** The flagship preview's raw HTML carries the headline "Cavaliers and Warriors stand three games apiece", the absolute `og:image` `…/og/06715a85-….png` (`200`, `image/png`, 84,684 bytes), and no Game 7 score, "win Game 7" or `"game_number":7`. With the `facebookexternalhit/1.1` user agent it receives the full OG/Twitter set.
  - **Sitemap: ok.** `sitemap.xml` returns `200` `application/xml` with 188 `<loc>` entries. `robots.txt` returns `200`, and the `/predict/` shell returns `200`.
  - **Probe: GREEN.** `node scripts/probe-deep-links.mjs https://ujsolon.github.io/predictgame7/`: 92 rows ok.
  - **Platform OG debugger: ok, 2026-10-08 (owner, Facebook Sharing Debugger)** on the flagship preview URL.
    - Response 206: Facebook's ranged fetch, normal.
    - Canonical, `og:url`, `og:type` `website`, `og:title` "Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals", the Historic `og:description`, `og:image` `…/og/06715a85-….png` and `twitter:card` `summary_large_image` all read back as emitted.
    - Its only warning was the missing `fb:app_id`, which is expected: the site has no Facebook app.
    - It also listed an empty `og:image:alt`, which is not emitted today (logged in `deferred-work.md`).
  - **Still owed (owner, not a 4.8 gate):** the Search Console sitemap submission. Steps are in `release-0-2-9-checklist.md`. The verification file lands whenever the owner supplies the token.
- **Live checks were owed at the 0.2.9 release** (owner decision a). Record them below with their dates: a cold deep-link GET (expect GitHub Pages to 301 `/series/<id>` to `/series/<id>/` with the query kept), a JS-disabled `curl`, a sitemap 200, and a platform OG debugger check on a series URL (the owner's manual step). The sitemap also needs a Google Search Console submission, because crawlers read `robots.txt` only at the host root (review row B4).

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-08). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V). The diff ran from `0421cdc` to the working tree.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B3/E4/V-o2 | A prerendered **pending** preview never fetches (`SeriesRoute` disables the fetch on a preload match). After Game 7 is written, the page keeps saying "Game 7 stands" until the next deploy, whereas before 4.8 it read the live row on every visit | medium | Verified: `SeriesRoute.tsx` calls `useSeriesRecord(id, isSeriesId(id) && !preload)`. AD-7 accepts "next build → prerender" for the static HTML, but the frozen block's "the route uses the preload instead of fetching" also freezes the *client* view, which the intent never weighed. Deploys are owner-triggered, so they are not on the pipeline cadence | intent_gap |
| B1/E1 | The stripped preview preload keeps the stored `team_a`/`team_b` slots, and every games 1–6 row keeps `home_team_id` on the `team_a` slot. `team_a` is the winner in 177/178 archived rows, so the page source names the winner first | medium | Verified against AGENTS.md (winner-slot fiction and the `team_a` = winner measurement) and `stripOutcome` (`preload.ts`). The owner's E14 decision (option A) already rules that winner-free surfaces use the neutral order, so only one reading exists | patch |
| V1/E3/B13 | The probe's "hydrated" check is vacuous: React 18 `createRoot` sets `__reactContainer` too. `main.tsx`'s hydrate-or-create choice has no test | medium | Pre-verified by V (`react-dom.development.js` :29423/:29478). Fix: a pure `shouldHydrate` with unit tests, plus a probe check that the server-rendered root nodes survive | patch |
| V2 | No gate step hydrates server output with the client tree, so a server/client markup divergence passes `npm run gate` | medium | Pre-verified by V. Fix: a jsdom test that calls `hydrateRoot` over `prerenderSite` output with an `onRecoverableError` spy | patch |
| V3 | No spawned test of `scripts/prerender/run.ts` or the `prerender` npm line, unlike `og:cards` (`tests/og/card.test.ts:377-427`). A mis-guarded entry exits 0 having written nothing | medium | Pre-verified by V. Fix: mirror the two spawned og tests | patch |
| B5/E2 | `winner_team_id":"` can never match (ids are integers), in both the unit test and probe row 9. The live probe has no parsed-preload check | low | Verified: `types.ts:38` is a number. The unit test also parses the preload; the probe does not. Direct correction | patch |
| B6/V-o1 | `planSeriesPages(rows, flagshipIds)` validates against the parameter but plans pages with the global `isFlagship` | low | Verified at `plan.ts` (the `isFlagship(view.id)` call). Direct correction: decide from the parameter's set | patch |
| E8/B8 (basename part) | `BASENAME = '/predictgame7'` is hard-coded in `entry-server.tsx`, while the client uses `import.meta.env.BASE_URL` | low | Verified. `BASE_URL` resolves under both `ssrLoadModule` and Vitest (the config is merged). Direct correction | patch |
| V4 | The trailing-slash nav `isActive` has no automated test | low | Pre-verified by V. Only probe row 2 covers it. A small jsdom test | patch |
| B10 | The AGENTS.md "Coverage truth" sentence does not mention `scripts/og` / `scripts/prerender` being in `tsconfig.pipeline.json` | low | True. Agent-context file | defer |
| B11 | The home page (`dist/index.html`) has no title/OG meta, yet heads the sitemap | low | Pre-existing: the built `index.html` never had a title, and the spec keeps it byte-identical (404 parity) | defer |
| B12 | A series id that disappears from the read leaves its old page live on additive `gh-pages` publishes | low | True, a new class of the leftovers AGENTS.md already warns about. The fix is an AGENTS.md note | defer |
| B2 | `stripOutcome` is a denylist, so `status`/`updated_at`/future columns pass through | false | `SERIES_SELECT` does not select `status`; `updated_at` is a backfill timestamp that names no team. Future columns are speculative | reject |
| B4 | `robots.txt` under `/predictgame7/` is not read by crawlers | low | True, but the file is spec-mandated (epics AC) and harmless. Discovery goes through Search Console at 4.7. The fix would edit this spec | reject |
| B7 | Spec `in-review` vs sprint-status `in-progress` | false | In-flight: step 5 syncs sprint-status. The live-check record is appended at release (decision a) | reject |
| B8 (env/SITE_URL part) | `ENV_*` and `SITE_URL` are written out in more than one place | low | `src/` cannot import `scripts/`, and the absolute host cannot be derived from the base. Unifying them adds a module for no named breakage | reject |
| B9 | `as unknown as Series[]` hides a shape gap between `OgSeriesRow` and `Series` | false | `fetchSeriesAnon` selects the same `SERIES_SELECT` constant the client fetch uses, so the runtime shape is identical | reject |
| B14 | Shell test strips the template's metas; no `og:site_name` / image alt; helmet `link` tags dropped | low/false | Not required by the spec. `PageMeta` emits no `link` tags (false). The shell-test weakness is unlikely to be met | reject |
| E5 | Duplicate ids in the read | false | `series.id` is the primary key | reject |
| E6 | PostgREST max-rows truncation above 1000 rows | low | 178 rows; pre-existing in the reused og read | reject |
| E7 | A preload id failing `isSeriesId` while the path matches | false | Preload paths are built from DB uuids by the plan; no such page can be emitted | reject |

## Design Notes

**Why stripped-row rendering, not render-full and serialise-stripped.** Hydration requires server and client to render from identical input. Rendering the preview from the stripped row on both sides makes a B10 leak structurally impossible, and a mismatch cannot arise. The cost is one explicit `reveal` prop.

**Why the variant travels in the preload.** It is derived once at build time from the *full* row. The client cannot re-derive it from a stripped row.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0.
- `npm run build && npm run og:cards && npm run prerender` -- expected: exit 0 and a page count logged.
- `node scripts/probe-deep-links.mjs http://localhost:4317/predictgame7/` against `vite preview` -- expected: GREEN.
