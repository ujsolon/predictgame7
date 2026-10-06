# Epic 4 Context: Sharing & SEO — results that travel, series pages that rank

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn a completed prediction into a circulating artifact and make the archive crawlable before the Apr–Jun 2027 Traffic Gate window. Copied links unfurl as series-specific OG cards and land on a working page; every archived series gets a static, indexable page; five flagship series carry editorial write-ups and video as a spoiler-free preview + revealed result pair. The epic opens with the analytics isolation port so every new surface (deep links, series pages, Share) is instrumented through it from its first deploy, and share arrivals become countable for the gate's share-link metric. Execution order: Epic 4 runs before Epic 3. Calendar-critical: the whole epic must be deployed at least 6–8 weeks before Apr 2027 so social caches warm and crawlers index ahead of the playoffs.

## Stories

- Story 4.0: Analytics isolation layer (AD-1 port)
- Story 4.1: Series deep-links + 404 SPA fallback
- Story 4.2: OG card rendering — `share-og` Edge Function
- Story 4.3: Prerendered series pages (SEO)
- Story 4.4: Share button + attribution
- Story 4.5: Series editorial content model (FR-13 pilot)
- Story 4.6: Flagship five content load
- Story 4.7: Epic verification — the sharing round-trip in production

## Requirements & Constraints

- **Analytics continuity:** the 10 existing event names stay verbatim (`prediction_generated`, `series_selected`, `custom_series_selected`, `prediction_method_selected`, `detailed_analysis_viewed`, `prediction_reset`, `banner_hotspot_clicked`, `contact_form_submitted`, `historical_series_expanded`, `historical_filter_applied`) with identical trigger points. The one sanctioned addition is the archive reset emitting `historical_filter_applied {filter_type:'reset'}`. The owner's live-view **before** leg is already recorded (`analytics-continuity-before-4-0.md`); Story 4.7 records the after leg against it.
- **Share links** reproduce the inputs, Method and result with zero re-entry. They unfurl with per-link OG title, description and image, and arrivals are attributable through `utm_source=share` on the landing `$pageview`.
- **Deep links must survive a cold GET** on the real gh-pages URL under `/predictgame7/`. Today every non-root path returns GitHub's 404, so the fallback has to serve all existing routes (`/predict`, `/historical`, `/insights`, `/maths`), not just the new ones. Verification against the live deploy is an acceptance criterion, not a follow-up.
- **Prerendered pages** carry full content with JS disabled and have distinct titles and meta. The build fails non-zero if any expected page is missing or empty.
- **Spoiler discipline:** the Game 7 outcome never appears in a preview page's DOM or meta, on the historic OG card, or in pre-reveal copy. The OG card never shows prediction outputs.
- **FR-13 pilot scope:** the five pinned flagships are 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers and 2026 Thunder–Spurs. Every other series stays bare. Video is external YouTube embeds only, with no media hosting and no Supabase Storage. Archive-wide video stays gated.
- **Performance:** the `share-og` redirect target is about 1s but has not been verified against Edge Function CPU limits, so measure it.
- **Accessibility:** every new or changed UI is WCAG 2.1 AA and responsive on desktop and mobile.
- **Security:** the personal PostHog API key is used only in owner-local tooling and never appears in the bundle, the repo or a `VITE_*` var. `share-og` holds no secrets beyond what rendering needs.
- **Copy guardrails:** no oracle, guarantee, lock or accuracy framing anywhere: microcopy, OG meta or CTAs.

## Technical Decisions

- **Analytics port:** `src/lib/analytics/` is the only place `posthog-js` or `@posthog/react` may be imported. It exposes a typed `EVENTS` registry and `track`, `identify`, `resetUser` and `captureError`. `provider.tsx` handles bootstrap and is what `main.tsx` mounts. The module also documents and types the owner-local metric-query surface. Feature code imports only `@/lib/analytics`, and Story 1.3's `captureError` calls route through it. `utm_source` is consumed only here, with no second tracker.
- **URL shapes:**
  - `/series/<id>?method=<slug>` is a historic prediction share. It client-redirects to `/predict?series=<id>&method=<slug>`.
  - `/predict?custom=<url-safe base64>` is a custom matchup share.
  - `/series/<id>` and `/series/<id>/result` are real router routes that the SPA also serves client-side.
  - The link users copy is always the `share-og` URL (`…/functions/v1/share-og?p=<payload>`), never the raw deep link.
- **One shared payload shape:** `SharePayload` and its base64 encoding live in `supabase/functions/_shared/contract.ts`, the same file that owns `MethodSlug`. The Share button and `share-og` both derive from it. If encoded custom URLs grow unwieldy, choose the scheme at build time.
- **`share-og`:**
  - It is anonymous with no JWT check: a crawler without auth gets a 200.
  - It renders the card with `@vercel/og` (satori + resvg) and serves a minimal HTML page with per-link `og:*` meta.
  - It redirects humans to the deep link with `utm_source=share`.
  - Unknown ids or render failures get a generic fallback card, never a 500.
  - Errors use the envelope `{ "error": string }`, and CORS goes through the `_shared` helper.
  - Repo convention overrides the spine's `jsr:` wording: third-party SDKs in `supabase/functions/**` are imported via `https://esm.sh/…`, because `jsr:` resolution against `node_modules` reddened CI. Only CI's `deno check` type-checks function entry points, so never claim it passes from local work.
  - Function deploys are a separate, ungated `supabase functions deploy`.
- **`404.html`:** the build chain emits `dist/404.html` as a copy of `index.html`.
- **Prerender:**
  - It is a build-time step in the `predeploy` chain, producing hydration-only HTML with the same routes and components and no app fork.
  - Derive the route list from the DB using the derived phase (`winner_team_id IS NOT NULL` means archive), never from `series.status`, dates or `league`.
  - The live table holds 178 series (160 NBA/BAA + 18 ABA), and all of them get pages, ABA included. Compute the non-flagship count as "all minus flagships" rather than hard-coding 172.
  - Non-flagship series get one full-record page with outcome-inclusive meta. Flagships, and any Active series inseason, get a preview + result pair.
  - Pages contain series facts only, with no baked prediction outputs. Active-series pages refresh by pipeline data → next build.
- **Editorial content model (4.5):**
  - Shape it as a table or columns, decided at build time.
  - Fields: a before part and a resolution part, each with headline, markdown write-up and images, plus YouTube embed URLs with title and credit, and an `is_featured` flag.
  - `is_featured` drives the preview/result pairing, Home featured selection and the archive-overlay "View full series page" link.
  - Writes happen through owner script or SQL only, since the client is read-only through `src/db/supabase.ts`. Owner tooling stays local or under `supabase/scripts/`.
  - Update `docs/CURRENT_DATA_MODEL.md` in the same commit as the schema change. The migration must be confirmed with the owner.
- **Story 4.4 also inherits deferred-work D3, the `PredictPage` request-path rebuild:**
  - add a typed `Partial<PredictionInput>` form type and payload builders that retire the `any` casts
  - move method descriptions into a `Record<MethodSlug,string>` in `src/lib/method-display.ts`
  - delete or wire the dead `invalid-input` failure arm
  - collapse `validateScores` duplication into one request path
- **Frontend conventions:** use the `@/` alias, inline try/catch + sonner for one-off mutations, the retry panel for re-attemptable regions, and RHF + zod for new forms. Never import from `AuthContext`, `RouteGuard` or `SamplePage`.

## UX & Interaction Patterns

- **OG card:**
  - One fixed 1200×630 template on an ink field, with essential content inside the 1080×540 safe zone.
  - Each team block is a logo on a white `#FFFFFF` chip (28px radius) plus the abbreviation in 64px mono.
  - Variants:
    - Historic: the center slot reads "2016 FINALS" over "GAME 7", with no score and no winner.
    - Custom: a "CUSTOM MATCHUP" eyebrow with "VS" in the center.
    - Fallback: wordmark + tagline only.
  - The lower band holds the wordmark and "Where data meets playoff drama". When the link carries a method, the band also gets a "MODEL: {METHOD}" label line.
  - og:title and og:description per variant are fixed in EXPERIENCE.md · Voice and Tone.
- **Series preview page:** hero (eyebrow year · round, with an editorial headline that overrides the default) → score strip for Games 1–6 only → before write-up → method deep-links → Predict CTA → the reveal link "See how the series ended →". The reveal is a text link, not a button. On arriving at the result page, focus moves to the result `<h1 tabindex="-1">` and `<title>` updates. Sections render only when content exists, with no empty placeholders.
- **Series result page:** final score, Game 7 box, all seven games, resolution write-up, video and the generic "Model it yourself" CTA. It has no per-method links.
- **Non-flagship page:** one full-record page with no reveal control.
- **Video embed:**
  - The thumbnail facade is prerendered, and a labeled play button is the only activation control.
  - On activation, the iframe (titled "{title} — via {creator}") replaces the facade and receives focus.
  - The credit caption "Highlights via [Creator] ↗" is always shown when a credit exists.
- **Share button:**
  - One affordance with no platform menu: `navigator.share` where available, otherwise the clipboard.
  - Feedback: on clipboard copy, toast "Link copied." (2s, no action). When the clipboard is blocked, toast "Couldn't copy — long-press the address bar to share."
  - The accessible name is "Share this series".
  - It is icon-only (ghost) in the series header and outline + "Share" in Predict's detailed view.
- **404 page:**
  - It applies to an unknown `/series/<id>` and to `/series/<id>/result` for a non-flagship id.
  - The `<h1>` reads "This series doesn't exist.", followed by "It may have been removed, or the link is wrong." and a link to Historical.
  - The document title updates and focus moves to the headline.
- **Series fetch failure:** the retry panel (`role="status"`, Retry as the first tab stop, inputs preserved) replaces the content region, and the hero frame stays.
- **Home highlight (4.5):** the pending Game 7 highlight is a div on Home, not a route. Its card resolves to `/series/<id>` (the preview) and deep-links into Predict, and it never reads `status`.
- **Token floor (in `src/index.css` when these surfaces build):** small text `#767676`, never `#808080`; `destructive-text #B91C1C`; `on-muted #595959`; `form-border #949494`.
- **General UI rules:** every interactive target is at least 44×44px, motion respects `prefers-reduced-motion`, light mode only, and no new radius, elevation or color token.

## Cross-Story Dependencies

- **4.0 comes first:** every Epic 4 event (deep-link arrivals, series pages, Share, attribution) emits through the port.
- **4.1 → 4.3, 4.4:** the `404.html` fallback and the `/series/<id>` routes underpin both prerendered pages and share landings.
- **AD-2 contract → 4.2 + 4.4:** both consume the same `SharePayload`, so define it once in `_shared/contract.ts` before either diverges.
- **4.2 + 4.4:** Share copies the `share-og` URL, so 4.4's round-trip needs 4.2 deployed.
- **4.5 → 4.3 / 4.6:** the prerender picks up editorial content automatically, and 4.6 loads content into 4.5's deployed model. Pairing depends on `is_featured`.
- **4.7:** needs 4.0–4.6 deployed. It records the port continuity after-leg against the before leg, the cold GET, the OG debugger, JS-disabled fetches, the share round-trip with the share-link arrival seen in PostHog live view, and the deploy date against the 6–8 week target.
- **Epic 3 (runs after):** Story 3.4's share-link arrivals query reads the attribution 4.4 ships, and its contact events emit through 4.0's port.
- **Epic 2 (done):** Active-series pairs depend on the pipeline's pending rows plus a rebuild.
- **Epic 5:** it verifies AA and responsiveness of these surfaces. Structural failures found there are filed against Epic 4.
