# Epic 4 verification: the sharing round-trip in production (Story 4.7, 2026-10-08)

**Site:** https://ujsolon.github.io/predictgame7/, release **0.2.11** (`gh-pages` `90f42ed`, bundle `index-DCF4RgKj.js`).

**Scope:** Stories 4.0–4.5 and 4.8. Story 4.7's Given was amended on 2026-10-08: 4.6 (flagship content) and 4.9 (Home highlight redesign) move to post-retro scoping, and each carries its own live check when it ships.

**Result:** six of the seven acceptance criteria are met on the deployed site. Row 5 is **partial** by owner decision (b, 2026-10-08), and its gap is handed to the Epic 4 retro. One harness defect was found and fixed during the drill (§ 4).

| # | AC check | Result | Evidence |
|---|---|---|---|
| 1 | Cold deep-link GET | **ok** | § 1 |
| 2 | OG debugger card render | **ok** | § 2 |
| 3 | JS-disabled fetch: bare + flagship preview (spoiler-free) + its result | **ok** | § 3 |
| 4 | Share round-trip, with the SM-3 event in PostHog live view | **ok** | § 4 |
| 5 | Measurement continuity vs Story 4.0's before leg | **partial** (owner decision b): names and trigger points confirmed live; properties not read live | § 5 |
| 6 | Sitemap/crawl spot-check | **ok** | § 6 |
| 7 | Deploy date vs the ≥6–8-week pre-window target | **ok, ahead** (provisional: 4.6 and 4.9 not yet deployed) | § 7 |

## 1. Cold deep-link GET (agent, `curl`, 2026-10-08)

`GET /series/06715a85-…?method=elo&utm_source=share` returns:
- `301 Moved Permanently`, with `Location: …/series/06715a85-…/?method=elo&utm_source=share`, so **both query parameters are kept**;
- then `200 OK` (the prerendered file).

The live probe's row 3 then follows the client redirect to `/predict?series=…&method=elo` (§ 4).

## 2. OG debugger card render (owner, Facebook Sharing Debugger, 2026-10-08)

On `…/series/06715a85-…/`, recorded at the 0.2.9 deploy (`spec-4-8-…` Implementation Notes, `release-0-2-9-checklist.md` row 4):
- `og:title` "Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals" and the Historic `og:description`;
- `og:url` = the canonical URL, and `og:image` = `…/og/06715a85-….png`, meaning the meta comes from the prerendered page and the image from the build-time card;
- `twitter:card` `summary_large_image`;
- only the expected `fb:app_id` warning.

**Carried to 0.2.11 by a live re-read, not by inspection alone.** 0.2.10's commit `fe43c64` changes the prerender (`entry-server.tsx`, `plan.ts`, and the `SERIES_PAGE_SELECT` read with its `series_content` embed). Its only edit to `scripts/og/render.ts` is a comment. So the meta was re-read on 0.2.11 on 2026-10-08, with the Facebook crawler user agent (`curl -A "facebookexternalhit/1.1"`). The values are identical to what the debugger recorded:
- `og:title` "Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals";
- the Historic `og:description`;
- `og:url` and `<link rel="canonical">` = `…/series/06715a85-…/`;
- `og:image` = `…/og/06715a85-….png`, which returns `200` `image/png` (Last-Modified Thu, 08 Oct 2026 12:57:20 GMT);
- `og:type` `website` and `twitter:card` `summary_large_image`.

A debugger "Scrape Again" on 0.2.11 is optional confirmation.

## 3. JS-disabled prerendered fetches (agent, plain HTTP, 2026-10-08)

| Page | Headline in the raw HTML | `<title>` | `og:image` |
|---|---|---|---|
| Bare: `series/bd75741b-…/` (1973 ABA Finals) | "Pacers win Game 7" | "Indiana Pacers vs Kentucky Colonels, 1973 ABA Finals: Pacers win Game 7 · PredictGame7" | `…/og/bd75741b-….png` |
| Flagship preview: `series/06715a85-…/` | "Cavaliers and Warriors stand three games apiece" | "Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals · PredictGame7" (winner-free) | `…/og/06715a85-….png` |
| Its result: `series/06715a85-…/result/` | "Cavaliers win Game 7" | "…, 2016 Finals: Cavaliers win Game 7 · PredictGame7" | `…/og/06715a85-….png` |

**Spoiler check against live data.** The live Game 7 score was read over anon REST: 89–93. The preview file, with React's `<!-- -->` separators removed, contains:
- neither score pair;
- no "win Game 7" and no "4–3";
- no `"game_number":7` and no winner embed.

The result file does carry the pair. The live probe's row 9 repeats this for all five flagships (§ 4).

## 4. Share round-trip and SM-3

**Automated (agent):** `node scripts/probe-deep-links.mjs https://ujsolon.github.io/predictgame7/` is **GREEN, 115 rows ok** (exit 0). It ended with `GREEN: every deep-link row held.`, ran 2026-10-08 at about 13:45Z, and used the probe as committed with this record (it includes the `READ_PRELOAD` fix below). It includes row 12:
- **Series share:** the copied URL is `…/series/f16779ed-…/?method=elo&utm_source=share`. A fresh browser profile redirects to `/predict?series=…&method=elo&utm_source=share`, with "PHI vs BOS" and Elo selected, no `predict-game-7` request, and a landing `$pageview` carrying `utm_source=share`.
- **Custom share:** a `?custom=` payload restores "Montréal vs Miami Heat", all 12 scores and Bayes, with nothing run and `utm_source=share` on the landing `$pageview`.
- **Both buttons:** keyboard focus ring visible, contrast 15.13:1, size ≥44×44, "Link copied." shown, and `prediction_shared` decoded with `{surface:'predict', kind, channel:'clipboard'}`.

**Harness defect found and fixed in this drill.** The first live run was RED on 2 rows (12a "share (series)" and the fresh open that depends on it): "timed out waiting for the preloaded series and method on Predict". The cause is in the probe, not the app:
- Row 12a navigates to `/predict?series=…`, which on the live site 301s to the Story 4.8 shell at `/predict/?series=…`.
- The probe's `READ_PRELOAD` waited for a pathname ending in `/predict`, with no trailing slash.
- `vite preview` serves `/predict` without a redirect, so every local run passed.
- The app itself served `/predict/?series=…` correctly; the owner's walks on the same release show it.

`READ_PRELOAD` now accepts the trailing slash, and the re-run is the GREEN result above.

**Owner-observed (PostHog live view, 2026-10-08, `analytics-continuity-4-7.md`):** a real share of OKC vs DEN with Logistic Regression arrives with `utm_source=share` on the landing `$pageview` and restores the same series and method. `prediction_shared` fires after each "Share" click.

## 5. Measurement continuity (owner, 2026-10-08)

The full side-by-side table is in [analytics-continuity-4-7.md](analytics-continuity-4-7.md), against [analytics-continuity-before-4-0.md](analytics-continuity-before-4-0.md) and [analytics-continuity-after-4-0.md](analytics-continuity-after-4-0.md):
- **8 of the 10** §A.1 events are seen live, with names, trigger points and order unchanged. `series_selected` is seen live for the first time.
- `custom_series_selected` was not walked, and `contact_form_submitted` is skipped by design, as in both 4.0 records.
- **Both deliberate additions are seen:**
  - the archive reset, identified via its icon-only button (the property itself was not copied);
  - `prediction_shared`.
- SDK behaviour is unchanged. `Pageleave` appears only because this walk had a full page navigation.

**Partial, by owner decision (b, 2026-10-08).** The AC asks for all 10 §A.1 events with the same names, **properties** and firing conditions. What is confirmed live is the names, trigger points and order of 8 events plus both additions. Not confirmed live:
- **Properties.** The PostHog listing shows none. They rest on the unit tests (`analytics.test.ts`, the page tests) and on the probe's row 12, which decodes `prediction_shared` with the right props on the live site.
- `custom_series_selected`, which was not walked.
- `contact_form_submitted`, skipped by design.

The offered substitute was a committed headless live walk that decodes every event's properties locally (nothing reaching the PostHog project), against Story 4.0's record. It was declined for now and handed to the retro (`epic-4-retro-inputs.md` § 0).

## 6. Sitemap/crawl spot-check (agent, 2026-10-08)

- `sitemap.xml` returns `200` with `application/xml`, is well-formed, and lists 188 URLs, 183 of them series URLs. It also returns `200` to the Googlebot user agent.
- **Reproducible sample:** every 8th of the 183 series URLs in sitemap order, 23 URLs, fetched without following redirects at 2026-10-08T13:53Z. All 23 return **`200`**. The id prefixes: `3d70e36f…`, `b384fe81…`, `19b788b0…`, `2bde0c53…`, `92061e04…`, `d5b2c36e…`, `cc44a971…`, `ba05304e…`, `cdedd038…`, `071f21aa…`, `99f53a36…`, `47aacb4e…`, `476529b4…`, `575eeac3…`, `cb7fd56d…`, `7b2e1dd5…`, `f0e1ad28…`, `81aa1830…`, `6f990604…`, `051ee538…`, `2aac8857…`, `97a67297…`, `de1c3bdd…`. (An earlier random sample of 25 also returned 25 × `200`, but its URLs were not recorded.)
- **As Googlebot:** a series page (`…/series/06715a85-…/`) returns `200` to a Googlebot user agent, as does `sitemap.xml`. `robots.txt` returns `User-agent: * / Allow: /` with the `Sitemap:` line. It is never read at this path: crawlers read `robots.txt` only at the host root, so the Search Console submission is the discovery path.
- **Search Console:** the property is verified, and the sitemap was submitted 2026-10-08 (owner). The first report status was "Couldn't fetch", which is usual for a new property, while the file itself checks out as above. The report status and indexed count are an open thread, tracked in `epic-4-retro-inputs.md` § 0.

## 7. Deploy date vs the pre-window target

- **Target:** Epic 4 deployed ≥6–8 weeks before the Apr 1, 2027 Traffic Gate window, i.e. by **about Feb 4–18, 2027**.
- **Deployed:**
  - 4.0/4.1 in 0.2.8, 2026-10-07;
  - 4.2/4.3/4.8 in 0.2.9, 2026-10-08;
  - 4.4/4.5 in 0.2.10, 2026-10-08;
  - the Home empty-state withdrawal in 0.2.11, 2026-10-08.
- **Margin:** about **17 weeks ahead of the deadline**, measured from 2026-10-08 to Feb 4, 2027 (the earliest deploy deadline). That is about 25 weeks before the Apr 1, 2027 window itself.
- **Provisional:** this is "Epic 4 deployed" for Stories 4.0–4.5 and 4.8 only. 4.6 and 4.9 are not deployed, and the epic's final deploy date is the one recorded when they ship.
- **Owner note (not a slip, a dependency):** the flagship content (Story 4.6) is deferred to post-retro scoping. It **must be live by about Feb 4–18, 2027**, for social caches and crawlers to warm before the playoffs. The retro has to keep it inside that date, whichever epic it lands in. No escalation is needed today.
