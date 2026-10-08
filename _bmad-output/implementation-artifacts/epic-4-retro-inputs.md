# Epic 4 retro: inputs collected during the epic

Raw material for `bmad-retrospective` on Epic 4. Nothing here is decided. Owner suggestion: take the URL topics into `bmad-party-mode` before the retro decides anything.

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
