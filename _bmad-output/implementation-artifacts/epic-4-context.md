# Epic 4 Context: Sharing & SEO — results that travel, series pages that rank

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic turns a completed prediction into something people pass around, and it makes the archive crawlable before the Apr–Jun 2027 Traffic Gate window. When someone shares a copied site link, it unfurls with a series-specific card and opens a working page. Every archived series gets a static page that search engines can index. Five flagship series also carry editorial write-ups and video, split into a spoiler-free preview page and a separate result page. Share arrivals become countable for the gate's share-link metric. The analytics port went first, so every new surface is instrumented from its first deploy. Epic 4 runs before Epic 3. Stories 4.0 and 4.1 are done. The deadline is a calendar one: the whole epic must be deployed at least 6–8 weeks before Apr 2027, so social caches warm and crawlers index the pages before the playoffs.

## Stories

- Story 4.0: Analytics isolation layer (AD-1 port) — done
- Story 4.1: Series deep-links + 404 SPA fallback — done
- Story 4.2: OG card rendering — build-time card renderer
- Story 4.3: Prerendered series pages (SEO)
- Story 4.4: Share button + attribution
- Story 4.5: Series editorial content model (FR-13 pilot)
- Story 4.6: Flagship five content load
- Story 4.7: Epic verification — the sharing round-trip in production

## Requirements & Constraints

- **Share links** reproduce the series or matchup and the Method with zero re-entry. They carry `utm_source=share`, which must reach PostHog on the landing `$pageview`. Any client redirect must preserve `utm_source` and every other query param except `series`/`method`.
- **Unfurl scope (owner-accepted narrowing):**
  - An archive-series link previews with that series' own card.
  - A custom-matchup link previews with the generic fallback card and meta. Static hosting cannot vary meta by query string.
  - Cards are per series, not per method.
- **Spoiler discipline:**
  - The Game 7 outcome never appears in a preview page's DOM or meta, or on any OG card.
  - Pre-reveal copy never hints at the outcome in the past tense.
  - Cards and pages never show prediction outputs.
- **Prerendered pages** must:
  - carry their full content with JS disabled
  - each have a distinct title and meta
  - fail the build non-zero if any expected page is missing or empty
- **Card build step** must also fail non-zero on any card it cannot render, including an undecodable logo. A deploy never ships a blank chip or a missing card.
- **FR-13 pilot:**
  - The flagships are 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers and 2026 Thunder–Spurs. Every other series stays bare.
  - Video is external YouTube embeds only, with no media hosting and no Supabase Storage.
- **Analytics:** the 10 existing event names stay verbatim. Share emits through `@/lib/analytics`, and there is no second tracker.
- **Accessibility and layout:** WCAG 2.1 AA, responsive on desktop and mobile, and a hit area of at least 44×44px on every new interactive target.
- **Copy:** never use "oracle", "guarantee" or "lock", or any accuracy claim, in microcopy, OG meta or CTAs.

## Technical Decisions

- **Hosting is static GitHub Pages only.** OG meta must come from prerendered HTML.
  - Supabase rewrites `text/html` to `text/plain`, so no Edge Function can serve meta.
  - The `share-og` Edge Function is retired, and Epic 4 adds no Supabase function. Nothing deploys outside `npm run deploy`.
- **URL shapes:**
  - `/series/<id>?method=<slug>` client-redirects to `/predict?series=<id>&method=<slug>`. This shipped in 4.1.
  - Custom matchups use `/predict?custom=<url-safe base64>`, following the `SharePayload` schema in `supabase/functions/_shared/contract.ts`. The encoder and the decoder both derive from that one schema.
  - `/series/<id>` and `/series/<id>/result` are real router routes that the SPA also serves.
  - `dist/404.html` is the SPA fallback. It shipped in 4.1.
- **Card renderer (4.2):**
  - It is a Node step in the `predeploy` chain, using satori, `@resvg/resvg-js` and `sharp` as devDependencies. It must be TypeScript under the gate (type-checked and linted), not an unchecked `.mjs`.
  - It reads series with the anon key and logos from `public/` on disk.
  - It writes `dist/og/<series-id>.png` for every archived series, plus `dist/og/fallback.png`. Each card is 1200×630.
- **Measured constraints from the spike:**
  - 10 of 59 logos (8 `.webp`, BLB `.gif` with a space in the filename, KCK `.avif`) render as blank chips with no error. Normalise every logo to PNG with `sharp` at render time, and leave the site files and `teams.logo_url` unchanged.
  - 15 of 17 stored round names overflow one line. Put them in a fixed ≈296px center slot that wraps; they all fit in at most 3 lines, because the longest word is 245px. Never abbreviate them.
  - The tests must render "Western Division Semifinals", "Western Conference Finals" and one converted logo, then assert the PNG dimensions and that the logo region is not blank.
  - The spike measured about 258 ms per card, about 46 s per full build and about 10 MB total. Record the actual render time and output size, with the date.
  - The fonts are Montserrat and JetBrains Mono. All round names are ASCII, so latin subsets suffice.
- **Prerender (4.3):**
  - It runs in `predeploy`, with the route list taken from the DB.
  - The archive set is `winner_team_id IS NOT NULL`. Never derive it from `status`, dates or `league`.
  - All 178 series get pages, the 18 ABA series included. Compute the non-flagship count as all series minus the flagships; don't hard-code 172.
  - Non-flagship series get one full-record page with outcome-inclusive meta.
  - Flagships, and any Active series inseason, get two pages: a winner-free preview at `/series/<id>` and a full record at `/series/<id>/result`.
  - Every page carries:
    - `og:title`
    - `og:description`
    - `og:url`
    - `twitter:card=summary_large_image`
    - an absolute `og:image` pointing at `https://ujsolon.github.io/predictgame7/og/<id>.png`
  - Static shells with generic meta and `og/fallback.png`, answering HTTP 200, cover `/predict`, `/historical`, `/insights` and `/maths`.
  - Pages hold series facts only, with no baked predictions. They hydrate the same components; the app is not forked.
  - New Active series get pages through pipeline data and then the next build.
- **Editorial model (4.5):**
  - Each series has a before part and a resolution part. Each part has a headline, a markdown write-up and images. The model also holds YouTube embed URLs with title and credit, and an `is_featured` flag.
  - You choose the table or column shape at build time.
  - Writes go through an owner script or SQL only. The client stays read-only.
  - Update `docs/CURRENT_DATA_MODEL.md` in the same commit as the schema change. Confirm the migration with the owner first.
- **4.4 inherits deferred-work D3, the `PredictPage` request-path rebuild:**
  - add a typed `Partial<PredictionInput>` form type and payload builders that retire the `any` casts
  - move the method descriptions into a `Record<MethodSlug,string>` in `src/lib/method-display.ts`
  - delete or wire the dead `invalid-input` arm, and annotate Story 1.3's Spec Change Log to match
  - collapse the duplicate validation into one request path
- **Conventions:**
  - Use the `@/` alias.
  - Use sonner for one-off notices and the retry panel for regions a user can re-attempt.
  - Use RHF + zod for new forms.
  - Never import `AuthContext`, `RouteGuard` or `SamplePage`.

## UX & Interaction Patterns

- **OG card:**
  - Ink field, with the lower band holding the wordmark and "Where data meets playoff drama".
  - Each team block is the logo on a white chip (`#FFFFFF`, 28px radius) plus the abbreviation in 64px mono.
  - The center slot reads "{YEAR}" over the round name over "GAME 7" (20px, `#8A8A8A`).
  - Essential content stays inside the 1080×540 safe zone.
  - There are two variants: historic and fallback. The fallback card is the wordmark and tagline only.
  - The card is decorative to screen readers.
- **OG meta copy:**
  - Historic title: "{TeamA} vs {TeamB} — Game 7, {Year} {Round}".
  - Fallback title: "PredictGame7 — Where data meets playoff drama".
  - Preview pages use winner-free titles. Result pages and non-flagship pages use outcome-inclusive titles.
- **Preview page:**
  - Section order: hero → score strip for Games 1–6 only → before write-up → method deep-links → Predict CTA → reveal link "See how the series ended →".
  - The reveal is a text link, not a button.
  - On arriving at the result page, focus moves to `<h1 tabindex="-1">` and `<title>` updates.
- **Result page:** final score, the Game 7 box, all seven games, the resolution write-up, video and a "Model it yourself" CTA. It has no per-method links.
- **Bare series** render the hero, the score strip and the CTA only, with no empty placeholders.
- **Video:**
  - A prerendered facade whose labeled play button is the only control.
  - On activation, the iframe (titled "{title} — via {creator}") replaces the facade and receives focus.
  - The caption reads "Highlights via [Creator] ↗".
- **Share:**
  - One affordance: `navigator.share` where available, otherwise the clipboard.
  - On copy, a toast reads "Link copied." (2s). When the clipboard is blocked, it reads "Couldn't copy — long-press the address bar to share."
  - The accessible name is "Share this series".
  - It is an icon-only ghost button in the series header and an outline button labeled "Share" in Predict's detailed view.
- **Error states:**
  - **Unknown id, or `/result` for a non-flagship:** a 404 whose `<h1>` reads "This series doesn't exist.", followed by one line and a link to Historical. The title updates and focus moves to the headline.
  - **Fetch failure:** a retry panel replaces the content region, and the hero frame stays.
- **Home highlight (4.5):** the pending Game 7 highlight is a div on Home, not a route. It links to the series preview page and into Predict, and it never reads `status`.

## Cross-Story Dependencies

- **4.0 (done)** carries all Epic 4 events. **4.1 (done)** provides the 404 fallback and the `/series` redirect that 4.3 and 4.4 sit on.
- **4.2 → 4.3:** the pages' `og:image` points at the cards the build renders. Both steps run in the same `predeploy` chain.
- **4.5 → 4.3 / 4.6:** the prerender picks up editorial content automatically, and `is_featured` drives the page pairing. 4.6 loads the content into 4.5's deployed model, and the result must be verified live before the pre-window cutoff.
- **4.7** needs 4.0–4.6 deployed. It checks:
  - a cold deep-link GET
  - a platform OG debugger on a site series URL
  - JS-disabled fetches of a bare page and a flagship preview/result pair
  - the share round-trip, with the SM-3 event observed live
  - port continuity against `analytics-continuity-before-4-0.md`
  - the deploy date against the 6–8 week target
- **Epic 3 runs after this epic.** Story 3.4's SM-3 query reads the attribution that 4.4 ships.
- **Epic 5** verifies the AA and responsive behavior of these surfaces. Structural failures it finds are filed against Epic 4.
