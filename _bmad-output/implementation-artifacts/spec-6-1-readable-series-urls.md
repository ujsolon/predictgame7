---
title: 'Story 6.1 — Readable series URLs'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_commit: '5eba1f527effeccca74d0d69c52c8e1da670dff1'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every series page lives at `/series/<uuid>/`, a URL that says nothing to a reader in search results or chat. Those uuid URLs are already shared and indexed (since 0.2.9). GitHub Pages cannot issue server redirects, and `gh-pages` publishes are additive.

**Approach:** each series gets a canonical `/series/<year>/<slug>/` (and `…/result/` for an archived flagship). The slug is derived at build time from the two teams in stored order, home team first (Story 6.8). The old uuid paths stay emitted as stubs pointing at the slug URL, so no link breaks. `/series/` and `/series/<year>/` are no-JS redirect stubs to Historical, which learns `?year=`. Every URL the site advertises (og:url, canonical, sitemap, Share) moves to the slug, and the OG image gains alt text. Owner decisions recorded in `epic-4-retro-inputs.md` §0a and `sprint-change-proposal-2026-10-09.md` §4.7; story text in `epics.md` Story 6.1.

## Boundaries & Constraints

**Always:**
- **First task, before any routing change:** pin the two missing tests from the 4.0 deferrals.
  - **Analytics init:** `AnalyticsProvider` boots the SDK once, with the configured key and host, and does nothing without a key.
  - **Barrel purity:** `@/lib/analytics` exports only the documented surface (`EVENTS`, `track`, `identify`, `resetUser`, `captureError`, the provider) and imports nothing feature-side.

  The other three 6.1 pins (the `?custom=` supersession, the preload race, the `?series=` else-branch) already exist in `predict-arrival-characterization.test.tsx` from Story 6.0, so they are not redone.
- **Slugs:**
  - **Where they come from:** derived at build time from each team's `nickname` (falling back to `full_name`), with no stored column and no migration. The archive's historical team rows are separate era identities (Sonics ≠ Thunder), so a franchise rename does not move a historic page.
  - **Characters:** lowercase ASCII, with every run of non-alphanumerics becoming one `-` (e.g. `76ers`, `trail-blazers`, `supersonics`).
  - **One helper** (e.g. `src/lib/series-slug.ts`) is shared by the router, the prerender, Share and the probe's expectation.
  - **Uniqueness:** the prerender fails loudly on a duplicate `year/slug`. Measured 2026-10-10: 0 duplicates across 179 series.
- **Routing:**
  - `/series/:year/:slug` and `/series/:year/:slug/result` resolve the series from the preload when one matches. Otherwise they query that year's series and match the slug, which covers a series born after the last deploy.
  - `?method=` arrivals on the slug route forward to Predict exactly as the uuid route does today, with `utm_source` and other params carried.
  - The uuid routes stay. On the client they replace the URL with the slug URL, keeping the query.
  - A 4-digit `/series/<year>` and `/series` go to Historical.
  - Unknown year/slug → the existing series 404.
- **Prerender:**
  - pages, preload `path`, og:url and canonical use the slug path;
  - the sitemap lists slug URLs only: no uuid stubs, no redirect stubs (189 URLs today);
  - `og:image:alt` and `twitter:image:alt` read "Game 7 card: {A} vs {B}, {Year} {League }{Round}" through `matchupLabel` and `yearRound`, never naming the winner;
  - the B10 page-source rule is unchanged.
- **Redirect stubs** at `dist/series/index.html` and `dist/series/<year>/index.html` (one per year with a series): `<meta http-equiv="refresh">` plus a plain link, `noindex`, to `/historical/` and `/historical/?year=<year>`.
- **Historical reads `?year=`:** a valid year with series seeds the year filter; anything else is ignored. The arrival fires **no** analytics event (`historical_filter_applied` stays a user action). The page does not write the year back to the URL.
- **Share builders** (`src/lib/share.ts`) take the series and produce slug URLs: page, result and `?method=` share. Every in-app series link uses the slug path:
  - `HomePage.tsx:128`;
  - `resultHref`;
  - the `SeriesPreview` and `SeriesFullRecord` links.
- **Carry-ins (epic-6-context):**
  - the OG card's centre slot shows the league before the round for non-NBA rows, as `yearRound` does;
  - `probe-deep-links.mjs` derives its sitemap expectation from live `is_featured` and checks slug URLs, stubs and redirect stubs;
  - `probe-analytics-walk.mjs` joins the `node --check` smoke list (`tests/pipeline/venue-backfill.test.ts:600-608`).
- **AD-6 / AD-7:** append the amendment note from `sprint-change-proposal-2026-10-09.md` §4.7, with the slug rules filled in. Update `docs/CURRENT_DATA_MODEL.md` / `EXPERIENCE.md` only where they name the uuid URL as the canonical one.

**Owner decisions 2026-10-10:**
- **Slug wording (1a):** `{home}-{away}`, e.g. `/series/2016/warriors-cavaliers/`, `/2013/heat-spurs`, `/2019/raptors-76ers`, `/2025/thunder-pacers`, `/2026/thunder-spurs`. No round in the slug and no Finals alias.
- **Old uuid pages (2a):** each becomes a thin redirect stub with `rel=canonical` and `og:url` (the slug URL), a 0-second meta refresh to the slug URL, a plain link, and a tiny inline script that carries the query across (`?method=…&utm_source=share` reaches Predict). Without JS, a `?method=` link lands on the series page. The uuid result path forwards to the slug result path.
- **Spec size kept whole** (about 2,800 tokens).

**Never:**
- Add a migration or a stored slug column.
- Change event names or payloads, or the `predict-game-7` request.
- Emit a slug that names the winner differently from stored order.
- Put a stub URL in the sitemap.
- Edit AGENTS.md or the PRD addendum (log their URL wording to `deferred-work.md`).
- Deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Flagship preview | `/series/2016/<slug>/` | the prerendered preview, with og:url, canonical and Share = this URL, and an alt naming "Golden State Warriors vs Cleveland Cavaliers" | N/A |
| Old shared link | `/series/<uuid>/?method=elo&utm_source=share` | the stub forwards to Predict with `series`, `method` and `utm_source` intact | no JS: the meta refresh reaches the slug page |
| Old result link | `/series/<uuid>/result/` | ends on `/series/2016/<slug>/result/` | N/A |
| Year landing | `/series/1968/` | Historical filtered to 1968 (ABA Finals and NBA EDF), no analytics event | unknown year → Historical unfiltered |
| Unknown slug | `/series/2016/nope/` | the series 404 | N/A |
| Post-deploy series | slug route, no static file (404.html fallback) | resolved by a year query, then rendered | not found → 404 |
| Duplicate slug in a year | build-time data | the prerender fails and names both ids | deploy stops |

</frozen-after-approval>

## Code Map

- **Routes:**
  - `src/routes.tsx:66,74` maps `/series/:id` → `SeriesRoute` and `/series/:id/result` → `SeriesResultRoute`, both in `KeyedById` (:16-19).
  - The catch-all is `App.tsx:27` (Navigate to `/`).
  - `SeriesRoute.tsx`:
    - `isSeriesId` → `useSeriesRecord(id)` (`useSeriesRecord.ts:33`, a query by id);
    - `usePreload(pathname)` at :41-46;
    - the `?method=` redirect at :50-60;
    - record vs preview at :62-75.
  - `SeriesResultRoute.tsx:22-35`.
  - `/series/:id/result` (a literal) outranks a future `/series/:year/:slug`. That is safe because no slug is "result".
- **Prerender:**
  - `src/prerender/plan.ts`:
    - `seriesRoute` and `routeFile` (:48-53);
    - record pages :83-91, preview :96-108, result :109-117;
    - `historicOgTitle` :42.
  - `src/prerender/entry-server.tsx`:
    - `renderRoute` :52-67;
    - `prerenderSite` :69-136 (shells :121-124, sitemap :129-131, robots :132).
  - `src/prerender/document.ts`:
    - `ogTags` :64-77 (og:url and canonical come from `absoluteUrl(route)`; there is no image alt today);
    - `pageDocument` :100-117.
  - `src/prerender/outputs.ts:13-16` holds `SHELL_ROUTES` and `OUTPUT_PATHS` (the paths removed on failure).
  - `preload.ts`: `samePath` (:38-45) and `usePreload` (:48).
  - `scripts/prerender/run.ts:57` reads the rows.
- **Share:** `src/lib/share.ts`:
  - `seriesPredictionSharePath(id, method)` :17, called from `DetailedResult.tsx:48`;
  - `seriesPageSharePath(id, kind)` :27, called from `SeriesFullRecord.tsx:62` and `SeriesPreview.tsx:60`;
  - tests: `share.test.ts:27-44`, `share-button`, `predict-share`, `series-pages`, `series-route` and `prerender` tests.
- **Links:** `HomePage.tsx:128` and `series-view.ts:137` `resultHref`.
- **Historical:** `HistoricalPage.tsx:53` `yearFilter` is `useState('all')`. The year `Select` fires `historical_filter_applied` at :178. Reset is at :144.
- **OG card:** `scripts/og/card.ts:163` `centerSlot(year, round)` has no league. `yearRound` is at `series-view.ts:102-104`.
- **Probe** `scripts/probe-deep-links.mjs`:
  - `FLAGSHIPS` :375-381 (uuid-keyed, home-first since 6.8);
  - cold GETs :431-434;
  - `ogComplete` :467-471;
  - per-variant :475-477 and :782-784;
  - sitemap :566-582 (uses hard-coded flagships; switch it to `is_featured`);
  - share round-trips :642-645, :871, :937;
  - reveal :745-754;
  - ABA/404 :768-775.

  The smoke list is `tests/pipeline/venue-backfill.test.ts:600-608`.
- **Analytics:** `src/lib/analytics/{index.ts,provider.tsx,events.ts}`. The only test is `src/lib/__tests__/analytics.test.ts`.
- **AD-6/AD-7:** `_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md:98,106`.
- **Data:** `SERIES_SELECT` (`series-query.ts:29-31`) embeds team `nickname`; 0 are null live. The constraint is `UNIQUE(year, team_a_id, team_b_id)` (`00014`).

## Tasks & Acceptance

**Execution:**
- [x] Analytics init + barrel purity tests (first, before any other change).
- [x] `src/lib/series-slug.ts` + test: `seriesSlug(series)` and `seriesPath(series, 'page'|'result')`.
- [x] Routes: the slug routes and the year-match resolver; uuid → slug replacement; `/series` and `/series/<year>` → Historical; route tests.
- [x] Prerender:
  - slug page paths and preload paths;
  - uuid redirect stubs (decision 2a);
  - `/series/` and year redirect stubs (in `OUTPUT_PATHS`);
  - sitemap slug-only;
  - og:url and canonical on the slug;
  - `og:image:alt` and `twitter:image:alt`;
  - the duplicate-slug failure;
  - tests.
- [x] `src/lib/share.ts` and its callers, plus the in-app links; share tests.
- [x] `HistoricalPage.tsx`: `?year=` seeding with no event; test (including no `track` call).
- [x] `scripts/og/card.ts`: the league in the centre slot for non-NBA rows; card test.
- [x] `scripts/probe-deep-links.mjs`: slug URLs, stubs, redirect stubs, the `is_featured` sitemap expectation, share round-trips. Add `probe-analytics-walk.mjs` to the smoke list.
- [x] Add the AD-6/AD-7 amendment note. Add a `deferred-work.md` entry for the AGENTS.md/addendum URL wording.

**Acceptance Criteria:**
- Given `npm run gate`, then it is green.
- Given a fresh `build`, `og:cards` and `prerender` served by `vite preview`, when both probes run against it, then both are GREEN, every sitemap URL is a slug URL (189), and every uuid URL from the previous sitemap still resolves to its series.

## Verification

**Commands:**
- `npm run gate`: green.
- `npm run build && npm run og:cards && npm run prerender`, then `npx vite preview` (not `npm run preview`, which rebuilds and wipes `dist`), then `node scripts/probe-deep-links.mjs <base>` and `node scripts/probe-analytics-walk.mjs <base>`: GREEN.

## Implementation Notes

- The analytics "no key → no init" pin needed a code change: `provider.tsx` now skips `posthog.init` when `VITE_POSTHOG_KEY` is empty. Production always has a key, so live behaviour is unchanged; keyless local or test builds no longer call init. The barrel deliberately does not re-export `AnalyticsProvider` (its own comment says so), and the purity test pins that real split.
- Real run (2026-10-10, local): 184 pages, 253 stubs (179 uuid pages + 5 uuid results + `series/` + 68 year stubs), sitemap 189 slug URLs, 0 duplicate slugs. Gate: 929 tests. Probes GREEN against `npx vite preview`.

## Spec Change Log

## Review Triage Log

Three layers on `diff-6-1.patch` (213 kB): blind-hunter (B, floor 10), edge-case-hunter (E, claims = this spec), verification-gap (V). 2026-10-10.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1 | The uuid stubs carry no `og:title`/`og:description`/`og:image`/`og:image:alt`/`twitter:*`, so old links re-scraped by X, Slack or Discord unfurl bare | medium | `stubDocument` writes only canonical, og:url, script, refresh and link; those platforms read tags from the fetched URL | patch: copy the slug page's OG and Twitter tags into each uuid stub (page and result); test |
| E4 / B3 | After a `?year=` arrival the URL keeps `?year=`, so Reset or another pick then a reload restores the stale filter | medium | `HistoricalPage` reads the param once and never clears it | patch: once read, remove `year` from the URL (`replace`, no event); test that Reset and a reload stay unfiltered |
| E1 / B4 | A case-variant slug (`/series/2016/Warriors-Cavaliers`) 404s | low | the lookup is an exact compare; readable URLs invite hand typing | patch: lowercase (and decode) the slug param before matching; test |
| V1 / B5 | The "row with no slug" build failure is untested, and missing from the AD-7 note and the AGENTS deferred entry | medium | grep finds no plan test; deleting `errors.push` or `continue` stays green | patch: prerender test (errors name the id, no files); add the rule to the AD-7 note and the deferred entry |
| V2 / B6 | The probe imports `src/lib/series-slug.ts` under bare Node (type stripping); `node --check` never resolves it | medium | `venue-backfill.test.ts:600-618` parses only | patch: a bare-Node import test asserting `/series/2016/warriors-cavaliers`; note the Node type-stripping requirement in the deferred AGENTS entry |
| V3 / B7 | The barrel-purity regex misses side-effect and dynamic imports | low | the regex requires `from` | patch: also match `import '…'` and `import('…')` |
| V-other / B11 | The 5-digit-year test never awaits or asserts the second render's 404, and the no-request check runs before effects | low | `series-route.test.tsx` | patch: separate awaited 404 assertions; check no request after the 404 renders |
| B10 | The EXPERIENCE.md amendment's "read `/series/<id>` as the slug" conflicts with the deliberately legacy share-URL line | low | the two paragraphs disagree | patch: rewrite the remaining `/series/<id>` mentions explicitly and drop the blanket substitution |
| B12 | `slugify`'s diacritics class embeds invisible combining characters | low | `series-slug.ts` regex literal | patch: `/\p{M}/gu` |
| B2 | `teamSlug` falls back to the full name when `nickname` is absent, and the `home-pending` fixtures emit a URL production never does (`miami-heat-boston-celtics`) | low | every production select embeds `nickname` (0 null live), so the drift is test-only | patch: give those fixtures nicknames (expected URL `heat-celtics`). Reject the type change (it ripples through the `Team` type for a hypothetical select) |
| B8 | A "pin" task changed runtime behaviour (`if (key) posthog.init`) | low | keyless builds are local or test only; recorded in Implementation Notes | reject (the fix is a spec note, now made) |
| B9 | Spec status and checkboxes are stale | false | updated before review (`status: 'in-review'`, all tasks `[x]`); the reviewer read the pre-update diff | reject |
| E2 | A post-deploy duplicate slug resolves an arbitrary row | low | a same-year duplicate needs a nickname clash; 0 live, guarded at build | reject |
| E3 | A year stub for a year with only pending series lands on Historical unfiltered | low | Historical is archive-only, so the SPA path does the same; harmless | reject |
| E5 / E6 | The probe throws on a missing flagship or ABA embed instead of logging a failure | low | a throw still ends the probe red | reject |
| E7 | The barrel "provider" wording differs from the test | low | the code and test are right; the spec wording is explained in Implementation Notes | reject |

**Verification record (2026-10-10, after review iteration 1):** lint, typecheck, Vitest (935/935, `--maxWorkers=2`) and build all green. Two full `npm run gate` runs failed on random tests (timeouts, killed child processes) while the machine had about 120–230 MB of free memory. The failures changed between runs and passed when re-run sequentially, so they were environmental. `og:cards` 180, prerender 184 pages + 253 stubs + 189-URL sitemap. `probe-deep-links.mjs` GREEN (134 ok) and `probe-analytics-walk.mjs` GREEN against `npx vite preview`. The probe's year landing now waits for the redirect, and every evaluate and navigate is bounded (the run that hung at the year stub was caused by the stub's 0-second refresh destroying the evaluate's context).
