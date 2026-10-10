# Epic 6 retro inputs

Items raised during Epic 6, for the retrospective or for an earlier decision point if noted.

## 1. Rename Historical to "Lookback" and serve the archive at `/series/` (owner idea, 2026-10-10)

**Idea.** Rename the "Historical" page to **"Lookback"**, retire the `/historical` route entirely, and make `/series/` the archive page itself, instead of a redirect stub to `/historical`. The owner's concern is that redirects can cost performance.

**Agent notes (2026-10-10, for the discussion):**
- **What redirects today:**
  - only `/series/` and `/series/<year>/`: static stubs with a 0-second meta refresh to `/historical/` (`?year=`), i.e. one extra small HTML fetch before Historical loads;
  - the old uuid links `/series/<uuid>/` (one hop, to the slug page).

  Series pages themselves (`/series/<year>/<slug>/`) never redirect, so the main reading and sharing paths have no redirect cost.
- **What the rename would touch:**
  - the route and nav label;
  - the `/historical` app shell and its sitemap entry;
  - the year stubs, which would *become* the archive pages instead of redirecting;
  - `?year=` handling, probes, tests, EXPERIENCE.md and the AD-6/AD-7 notes.
- **Analytics:**
  - the events `historical_filter_applied` and `historical_series_expanded` keep their names (renaming them needs an owner decision and breaks continuity);
  - `$pageview` paths change from `/historical` to `/series`, so path-based PostHog insights need re-pointing.
- **Old links:** `/historical` is in the sitemap and may be indexed or bookmarked, so it would itself need a stub pointing to `/series/`. That is a new redirect in place of the old one.
- **Timing caution:** this is a URL change. Epic 6's rule is that every URL change lands *before* the Feb 4–18, 2027 cache-warming window, and the retro runs after 6.7 (post-deploy, around that window). If it is wanted, the better decision point is **Story 6.3 (Home design session)**, which already covers navigation and the app shell, so that it can ship with 6.4.
