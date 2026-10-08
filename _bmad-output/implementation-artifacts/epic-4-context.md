# Epic 4 Context: Sharing & SEO — results that travel, series pages that rank

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make a completed prediction a circulating artifact and the Game 7 archive a crawlable SEO asset. Shared links unfurl as series-specific OG cards and land on a working page. Every archived series gets a prerendered static page, with spoiler-free preview/result pairs for the five flagship series and any Active series. Arrivals from shares are attributable (SM-3). All of this is instrumented through a single analytics port. The epic is calendar-critical: it must be **deployed 6–8 weeks before the Apr 1, 2027 Traffic Gate window (about Feb 4–18, 2027)**, so social caches warm and crawlers index before playoff traffic arrives. Epic 4 runs before Epic 3.

## Stories

In-epic execution order: 4.0, 4.1, 4.2, 4.3, 4.8, 4.4, 4.5, 4.6, 4.7. Release 0.2.9 follows 4.8, because 4.8's live checks need a deploy.

- Story 4.0: Analytics isolation layer (AD-1 port)
- Story 4.1: Series deep-links + 404 SPA fallback
- Story 4.2: OG card rendering — build-time card renderer
- Story 4.3: Series pages — preview, result and full record (client-side routes)
- Story 4.8: Prerendered series pages, OG meta, route shells and sitemap
- Story 4.4: Share button + attribution
- Story 4.5: Series editorial content model (FR-13 pilot)
- Story 4.6: Flagship five content load
- Story 4.7: Epic verification — the sharing round-trip in production

## Requirements & Constraints

- **Share links** reproduce the series, Method and result state with zero re-entry when opened in a fresh browser. They carry `utm_source=share`, and that parameter must survive every client redirect so it reaches the landing `$pageview`.
- **Custom-matchup shares** unfurl with the generic fallback card. This narrowing was accepted by the owner.
- **Spoiler discipline.** A preview page (flagship or pending) must never carry the Game 7 outcome in its DOM, `<title>`, meta or OG card. The historic OG card never shows the series score or winner, and it never shows prediction outputs.
- **No baked predictions.** Prerendered pages hold series facts only. Method links are deep-links (`/predict?series=<id>&method=<slug>`), never computed results.
- **Fail loud at build time.** A missing or empty prerendered page, an unrenderable card, or an undecodable logo fails the build non-zero. No deploy may ship a partial result.
- **Flagship five** (pinned by the owner): 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs.
  - Until the `is_featured` flag lands, the flagships come from a pinned id list.
  - Every other series stays bare. It renders with no empty sections or placeholders.
- **Video** is YouTube external embeds only. There is no media hosting and no Supabase Storage.
- **Accessibility and layout.** Every new surface meets WCAG 2.1 AA and is responsive on mobile and desktop:
  - hit areas of at least 44×44px;
  - visible focus;
  - an accessible name on the Share button ("Share this series");
  - iframe titles on video embeds.
- **Voice.** Never use "oracle", "guarantee", "lock" or accuracy-claiming framing in microcopy, meta or CTAs.
- **Analytics.** The 10 existing event names are preserved verbatim. There are two deliberate additions:
  - the archive reset's `historical_filter_applied {filter_type:'reset'}` (Story 4.0, D1);
  - Story 4.4's `prediction_shared` (owner decision 2026-10-08, option a), the registry's one new name. It fires once per share that reaches the native sheet or the clipboard, with `{ surface: 'predict' | 'series', kind: 'series' | 'custom', channel: 'native' | 'clipboard' }`; a cancel or a failed copy emits nothing.

  Story 4.0 recorded the measurement-continuity before leg; Story 4.7 records the after leg and the side-by-side comparison, and lists both additions.
- **Live verification is an acceptance criterion, not a follow-up.** Record each check with its date:
  - a cold deep-link GET;
  - a platform OG debugger check on a series URL;
  - a JS-disabled fetch of the prerendered pages;
  - a sitemap 200 spot-check.

## Technical Decisions

- **Analytics port (AD-1).** `posthog-js` / `@posthog/react` may be imported only inside `src/lib/analytics/`. Feature code calls `track` / `identify` / `resetUser` / `captureError` from `@/lib/analytics`. The owner's personal PostHog key stays in owner-local tooling only and is never bundled.
- **Share links (AD-6).**
  - `/series/<id>?method=<slug>` client-redirects to `/predict?series=<id>&method=<slug>`. Any other query param is dropped today; Story 4.4 is what makes `utm_source` survive the redirect.
  - `/predict?custom=<url-safe base64>` follows the `SharePayload` schema in `supabase/functions/_shared/contract.ts` (AD-2), which is the single source for both the encoder and the decoder.
  - The build emits `404.html` as the SPA fallback.
- **OG meta never comes from an Edge Function.** Supabase rewrites `text/html` responses to `text/plain`. The `share-og` function is retired, and **no Edge Function is added in this epic**.
- **OG cards** are static 1200×630 PNGs rendered at build time in the `predeploy` chain:
  - one `dist/og/<series-id>.png` per phase-deriving series — archive **and** pending, never `status`, dates or `league` — plus `dist/og/fallback.png`;
  - the step uses satori + `@resvg/resvg-js` + `sharp` as devDependencies and must be type-checked and linted by the gate (not an unchecked `.mjs`);
  - `sharp` normalises every logo to PNG, because `.webp`, `.gif` and `.avif` logos otherwise render blank;
  - round names keep their stored wording and wrap in a center slot of about 296px;
  - cards are per series, not per method;
  - a full build takes about 46 s, and the output is about 10 MB.
- **Prerender (AD-7).**
  - The route list comes from the database at build time through the derived phase (AD-4): `winner_team_id IS NULL` means pending, `IS NOT NULL` means archive. Never read `series.status`, `league` or dates.
  - Derive the route set from the live archive (measured at 178 rows) plus the flagship list. Do not reuse the "172 + 5" arithmetic. All 178 series are included, the 18 ABA series among them.
  - A non-flagship series gets one page at `dist/series/<id>/index.html`.
  - A flagship or Active series gets a pair: `/series/<id>/index.html` (preview) and `/series/<id>/result/index.html`.
  - The same routes and components serve the SPA, with hydration only and no fork of the app. Page components must render without `window` / `document` access.
  - The prerender also writes static shells for `/predict`, `/historical`, `/insights` and `/maths`. They carry generic meta, use `og:image` = `og/fallback.png` and answer HTTP 200.
  - It also writes `dist/sitemap.xml`, with absolute URLs under `https://ujsolon.github.io/predictgame7/`, and a `robots.txt` that points to the sitemap.
- **OG tags.** Every emitted page carries `og:title` / `og:description` / `og:url`, `twitter:card=summary_large_image`, and an absolute `og:image`.
- **Data boundary (AD-8).**
  - The client reads only through `src/db/supabase.ts` (anon key).
  - The build steps read series data with the anon key.
  - Editorial content is written only by owner-side scripts or SQL.
  - A schema change updates `docs/CURRENT_DATA_MODEL.md` in the same commit.
- **Frontend conventions (AD-9).**
  - Use the `@/` alias.
  - A re-attemptable fetch failure renders the in-place retry panel, not a toast. Sonner is used for one-off notices.
  - New forms use react-hook-form + zod.
- **Deploys.** Everything ships through `npm run deploy` (gh-pages). Nothing is deployed outside it, and deploys run only when the owner asks for a release.

## UX & Interaction Patterns

- **Non-flagship full-record page** (`/series/<id>`):
  - hero with an eyebrow (year · round) and a headline in team words;
  - a mono score strip with all seven games and a Game 7 box;
  - the winner;
  - a Predict CTA with the series preloaded;
  - no reveal control.
- **Preview page** (flagship or pending), in this order:
  - hero;
  - score strip with games 1–6 only;
  - the before write-up;
  - four method links;
  - Predict CTA;
  - the reveal text link **"See how the series ended →"**, below the fold, styled as a link in ink and not as a button.

  Copy is tension-forward and in the present tense ("Game 7 stands.").
- **Result page** (`/series/<id>/result`):
  - hero with the final score and Game 7 box;
  - all seven games;
  - the resolution write-up and video;
  - a generic "Model it yourself" CTA, with no per-method links.

  On arrival, focus moves to the `<h1>` (`tabindex="-1"`) and the `<title>` updates. A result URL for a non-flagship, pending or unknown id gets the 404 treatment.
- **Titles and meta.**
  - Each page has a distinct document title. Preview titles are winner-free; result and non-flagship titles include the outcome.
  - OG title format: "{TeamA} vs {TeamB} — Game 7, {Year} {Round}".
  - The fallback title is "PredictGame7 — Where data meets playoff drama".
  - The per-variant `og:title` and `og:description` strings are fixed in `EXPERIENCE.md · Voice and Tone · OG meta copy`. This doc does not restate the descriptions.
- **404 treatment.** The heading reads "This series doesn't exist.", followed by one line and a link to the Historical archive. Focus moves to the heading.
- **Share.**
  - A single affordance: `navigator.share` where available, otherwise the clipboard.
  - On success the toast reads "Link copied." for 2s, with no action.
  - If the clipboard is blocked, the toast reads "Couldn't copy — long-press the address bar to share."
  - The button is icon-only (ghost) in the series header and labelled with an outline in the Predict detailed view.
- **Video.** A 16:9 facade with a labelled play button, which is its only activation control. The iframe replaces the facade and takes focus. The facade and its creator credit are prerendered.
- **Token floor.** Small text uses `#767676`, never `#808080`. Other tokens: `destructive-text #B91C1C`, `on-muted #595959`, `form-border #949494`. The UI is light mode only, these surfaces add no new radius, elevation or color token, and motion sits behind `prefers-reduced-motion`.

## Cross-Story Dependencies

- **4.0 is done.** Every Epic 4 event emits through its port. Story 3.4's SM-3 query, which runs after this epic, reads 4.4's attribution data.
- **4.1 is done.** It shipped the 404 fallback and the `/series/<id>?method=` redirect. 4.3 replaces 4.1's interim bare-id redirect with real routes. 4.4 makes the redirect carry `utm_source`.
- **4.2 is done.** Its card PNGs are what 4.8's `og:image` references.
- **4.3 → 4.8.** 4.8 prerenders 4.3's components, so 4.3 must keep page render free of browser access.
- **4.4** builds Share on top of a rebuild of the `PredictPage` request path (deferred work D3): a typed form type and payload builders, a `Record<MethodSlug, string>` of method descriptions, and one validation and failure vocabulary.
- **4.5** adds the content schema and `is_featured`, which replaces 4.3's pinned list. Content appears in the prerendered HTML automatically. 4.5 also owns the Home pending-Game-7 highlight: a div, not a route, linking to `/series/<id>`.
- **4.6** depends on 4.5 being deployed.
- **4.7** depends on 4.0–4.6 and 4.8 being deployed. Its sitemap spot-check samples 4.8's `sitemap.xml`.
