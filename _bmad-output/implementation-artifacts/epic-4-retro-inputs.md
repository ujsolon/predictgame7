# Epic 4 retro: inputs collected during the epic

Raw material for `bmad-retrospective` on Epic 4. Nothing here is decided. Owner suggestion: take the URL topics into `bmad-party-mode` before the retro decides anything.

## 0. What this retro must decide (owner, 2026-10-08)

The retro runs after Story 4.7 and **decides the home of every remaining item**. Small scope ships right after as Epic 4 follow-ups; large scope moves to a later epic. The items:
- **Story 4.6, flagship five content load:** owner authoring, plus a loader script and the archive-overlay link. It was moved behind the retro because its Home featured cards overlap 4.9. **Deadline: content live by about Feb 4–18, 2027** (6–8 weeks before the Apr 1 Traffic Gate window).
- **Story 4.9, Home pending-Game-7 highlight redesign:** a design session and a mockup with simulated active series first. It should absorb 4.6's Home featured cards, so one design covers both Home surfaces.
- **The open `deferred-work.md` entries from Epic 4.** Notably:
  - bundle size, +20% gzipped from `react-markdown`;
  - `og:image:alt`;
  - `series_content.updated_at`;
  - the PredictPage preload race;
  - the `?custom=` supersession test;
  - home-page meta;
  - stale `gh-pages` pages;
  - the AGENTS.md coverage note;
  - the PRD addendum §A.1 event row.
- **The URL and entry-point ideas below** (items 1–3a).
- **Story 4.7's partial row 5 (analytics properties):** 8 of 10 §A.1 events were confirmed live by name and trigger, but their properties were not read live, `custom_series_selected` was not walked, and `contact_form_submitted` is skipped by design. Option: a committed headless live walk (`openBrowserSession`, PostHog answered locally) that decodes every event's properties against Story 4.0's record. It was offered and declined for now (owner decision b, 2026-10-08). Decide whether it is needed before Story 3.4's SM metrics read these events.
- **Search Console status:** the sitemap was submitted 2026-10-08, and the first status was "Couldn't fetch". Before the retro, read the Sitemaps report and the Pages (indexed) count, and decide whether discovery needs more (URL Inspection on the flagships, or internal links per item 3a).

## 0a. Party-mode triage outcomes (2026-10-09, owner decisions; the retro records them)

Installed-agent room, pre-retro. Each item was tested for three things: does it still hold, what does it collide with, and when does it ship.

**Owner decisions**
- **Readable series URLs: YES.** The form is `/series/<year>/<slug>`, landing **first**. GitHub Pages cannot redirect, and uuid URLs are already shared and indexed, so every URL/meta change must land before the Feb cache-warming window. The uuid pages stay, emitted deliberately as **canonical stubs** pointing at the slug. This also resolves the stale-`gh-pages`-pages deferral: additive publishes would otherwise keep stale uuid pages.
- **`/series/` and `/series/<year>`:** a thin redirect (a static stub with a no-JS redirect) to `/historical` and `/historical?year=<year>`. Historical must learn to read `?year=`; today `yearFilter` is local state (`HistoricalPage.tsx:52`).
- **Everything below ships before Feb 4–18, 2027**, in this order:
  1. **Docs-truth commit** (this retro window, under the standing rule below):
     - the AGENTS.md coverage notes (`scripts/og`, `scripts/prerender` checked; `probe-deep-links.mjs` named; the analytics guardrail naming);
     - the PRD addendum §A.1 pointer for `prediction_shared`;
     - the `share-og` wording in the epic context.
  2. **Readable URLs.** First task: pin the three missing tests (analytics init and barrel purity, the `?custom=` supersession, the Predict preload race), because the URL work refactors `main.tsx`, routing and Predict's arrival code. Then:
     - slugs;
     - the uuid canonical stubs;
     - the `/series/` and year redirects;
     - `og:image:alt`, winner-free and naming the matchup, because the same file emits the OG tags.
  3. **Entry points:** a series-page link in Historical's record overlay for **every** series, a link from Predict's selected series, and `?year=`. The reset button gets its accessible name and a 44px target, since it is in the same file.
  4. **Story 4.9 design session** (before any Home code). It covers:
     - Home's purpose;
     - the pending-Game-7 card **and** the flagship featured cards (taken over from 4.6);
     - the Home image budget;
     - the third-party font;
     - the favicon path;
     - fixing the stale OG mockup ("3 variants" / custom VS block).
  5. **Home build** per the approved mockup.
  6. **Story 4.6:** the owner writes the five flagships (**real content required by Feb**; guidelines alone are not enough). A loader script writes `series_content`, sets `updated_at` on every write (resolves that deferral), and enforces the licensed-image rule.
  7. **As room allows:**
     - the bundle trim (measured: ~0.4 s of 2.4 s; secondary to Home images);
     - the analytics property walk (must precede Story 3.4's metrics).

     `/teams` and `/games` go to a later epic, through the PRD.
- **Content storage: keep A (the hybrid).** Text and YouTube ids stay in `series_content` rows, written by the owner. Images stay in the repo under `public/editorial/`. **Images must be openly licensed, with a credit line**, and the build refuses an image without one (as it does for missing alt text) and resizes images to WebP with `sharp`.
  - **Contributor/open-source authoring is parked:** under A it is not possible. If it is ever wanted, the migration is B, files as the CMS (`content/series/<year>/<slug>/…md`, one PR per page), with slugs as the folder names.
  - Free-form per-page styling was rejected in favour of a future block/component kit.
- **Standing rule (owner OK).** Agents edit AGENTS.md and the PRD addendum **only between epics** (retro window), in one batched commit with the diff shown to the owner first. The addendum takes pointers only. Mid-epic findings go to `deferred-work.md`. A dangerous-now statement may be fixed only with the owner's explicit OK.

**Orphan sweep after the party (2026-10-09).** Three Epic 4 deferrals were not discussed in the room. They are placed here:
- **4.1, the `?series=` else-branch test** (retiring the not-found notice on plain `/predict`) joins step 2's test pins (Predict arrival code).
- **4.1 pass 2, no document title outside the 404**, and **4.8, Home has no `<title>`/meta/OG** both go to step 4 (the 4.9 design session) and step 5 (the Home build) as Home/app-shell meta.

Already resolved by later stories, so the retro can close them:
- E14 team order (owner decision, 4.3/4.2);
- B10 preview outcome in the source (4.8);
- the silent 404 on an unshowable row (4.8 fails the build);
- the `error-envelope.ts:68` `isMethodSlug` (4.4);
- HTTP 404 on app routes (4.8 shells and series pages);
- D3 and the duplicated validation (4.4).

**Measured during the session** (live, phone viewport, Slow 4G + 4× CPU, 3 runs):
- **Home:** LCP ~13.3 s, full load ~34 s.
- **Predict:** FCP ~3.7 s.
- **Prerendered series preview:** FCP ~1.6 s (the 4.8 payoff, and an argument for prerendering Home later).
- **JS bundle:** 308 KB transfer, ~2.4 s on Slow 4G.
- **Home's weight:** `KLing_court.jpg` 1.78 MB, `KLing_trophy.jpg` 1.63 MB, `KLing_dashboards.jpg` 1.48 MB (CSS backgrounds). The LCP image is `nba_game7_moments.jpg` (314 KB).
- **Font:** loads from `resource-static.bj.bcebos.com`, a third-party CDN.
- **Favicon:** requested at the domain root `/favicon.png`, outside `/predictgame7/`.

**Still open for the retro to place:** Search Console status (the sitemap's first read failed; re-check). *Story 4.7's row 5 was closed 2026-10-09 by `scripts/probe-analytics-walk.mjs` (GREEN, 10 of 10), so the analytics property walk is no longer a leftover in step 7.*

## 1. Human-readable series URLs (owner idea, 2026-10-08)

**Proposal.** Advertise a series as `/series/<year>/<slug>` instead of the uuid:
- `…/series/2016/cavaliers-warriors`;
- for a Finals, optionally also `…/series/2016/nba-finals`.

The round should not appear in the slug except for the Finals, because round names are long and vary ("Western Division Semifinals").

**Owner's framing.** The uuid URL is REST-clean and hard to guess. Readable URLs are easier for crawlers and humans to recognise, share and type.

**Facts to weigh** (agent notes, 2026-10-08):
- **Uniqueness.** One pair of teams meets at most once per season, so `year + pair` identifies a series. The NBA/ABA overlap years still need checking for a nickname clash. `nba-finals` exists once per year, but ABA finals and pre-1950 BAA finals need their own slugs.
- **Spoiler order.** The pair in the slug must use the spoiler-neutral alphabetical order (`src/lib/spoiler-neutral.ts`), never the stored order: `team_a` is the winner in 177 of 178 rows, and a slug like `warriors-cavaliers` would name the winner in the URL of a spoiler-free preview.
- **Guessability is not security.** Every series uuid is already public in `sitemap.xml`. Access control is RLS, not obscurity, so readable URLs cost no security. They do invite hand-typed URL probing, which the 404 treatment already handles.
- **Existing links.** Shared links, Facebook/OG caches and Search Console will hold uuid URLs from 0.2.9 on. GitHub Pages cannot issue server redirects, so options are:
  - emit both paths, with the uuid page carrying `rel=canonical` to the slug;
  - a meta-refresh stub at the uuid path.

  Canonical-only is the SEO-safe one. Duplicate pages without a canonical split ranking.
- **Where slugs come from.** Either derive them at build time from nicknames (and change if a nickname changes), or store them in a column (a migration, AD-8). A rename of the franchise (Sonics → Thunder) must not move a historic page.
- **Cost.** It touches the 4.8 prerender route set, the sitemap, the 4.4 share URL builders, the OG `og:url`/canonical, and `/series/:id` routing (the slug plus the uuid fallback).

## 2. What should `/series/` and `/series/<year>` be?

- **`/series/`** today has no file, so it gets the `404.html` SPA fallback and then redirects to `/`. Owner idea: make it the index of all series, possibly replacing `/historical`. That would require the Historical/archive page to include **pending** series too (today it is archive-only by design).
- **`/series/2016`:** the archive filtered to one year. This is a natural fit if the readable-URL scheme in item 1 lands (`/series/<year>/<slug>` makes `/series/<year>` the parent).
- **Questions:**
  - Does `/historical` stay as an alias?
  - Do year pages get prerendered with their own meta (SEO: "2016 NBA playoffs Game 7s")?
  - Does the sitemap list them?

## 3. `/teams` and `/games`

Open question from the owner: should these map to anything at all? Possible readings:
- `/teams/<team>`: every Game 7 a franchise played, with its Game 7 record. This is a classic evergreen SEO page.
- `/games`: probably redundant with series.

Neither has a requirement in the PRD today, so either would be new FR scope and should go through `bmad-prd` / correct-course, not a story.

## 3a. How does anyone reach a series page? (owner, 2026-10-08, after 0.2.10)

The pages at `/series/<id>/` render as designed, but **nothing in the app links to them**. Predict and Historical do not, and Home does not since the empty state was withdrawn (cards appear only while a series is pending). Today a series page is reached only from outside: a share link (4.4), the sitemap or search, or a typed URL.

What is already planned, and what is not:
- **Planned (Story 4.6):** "flagship series are discoverable as such — Home hotspot/featured cards and archive views link through to the enriched pages". EXPERIENCE.md also specs an archive-overlay "View full series page" link, rendering only when editorial content exists. That covers the **five flagships**, and only once 4.6 ships.
- **Not planned anywhere:** an in-app path to the other 173 full-record pages. Candidates for the retro or party mode:
  - a "Series page" link in Historical's record overlay for every series;
  - a link from Predict's series card or result to the selected series' page;
  - folding this into the readable-URL / `/series/` index idea in item 1–2 above.
- **Why it matters:** the pages are the SEO asset (AD-7). Internal links are also how crawlers weigh them, so an orphaned page set ranks worse than a linked one, even with the sitemap.

## 4. Other notes from the epic

- `robots.txt` at `/predictgame7/robots.txt` is never read by crawlers; only the host root counts. Sitemap discovery depends on the Search Console submission (`release-0-2-9-checklist.md` § 5).
- `og:image:alt` is not emitted (`deferred-work.md`, 2026-10-08).
