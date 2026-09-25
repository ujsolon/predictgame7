---
name: PredictGame7
status: final
sources:
  - ../../../specs/spec-predictgame7/SPEC.md
  - ../../epics.md
  - ../../architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md
  - ../../prds/prd-predictgame7-2026-09-22/prd.md
  - ../../prds/prd-predictgame7-2026-09-22/addendum.md
  - ../../sprint-change-proposal-2026-09-25.md
updated: 2026-09-25
---

# PredictGame7 — Experience Spine (scoped: 4 new surfaces)

> Scoped run. Covers only the surfaces with no design yet: OG share card, flagship series content page, Share button + success states, error/empty states. The existing app (Home, Predict, Historical, Insights, Maths) is ratified practice — referenced where the new surfaces must match it, not re-specced. `DESIGN.md` beside this file is the visual reference; visual specs live there, behavior lives here. Composition reference: `mockups/key-og-card.html` (three OG variants + safe zone), `mockups/key-series-page.html` (flagship preview + result pages, bare series, 404), `mockups/key-error-states.html` (share toasts, retry panel, inline error, empty state). **Spines win on conflict with any mock.** Amended 2026-09-25 per `../../sprint-change-proposal-2026-09-25.md` (spoiler-free preview/result split, OG logo chips).

## Foundation

Single-surface responsive web. React 18 + TypeScript on Vite, Tailwind, Radix/shadcn primitives, react-router 7 (basename `/predictgame7/`), sonner for toasts, Supabase backend. Light-only — no dark mode despite the Tailwind class config. The visual contract is monochrome editorial with team logos as the only color (DESIGN.md · Brand & Style). Motion: the existing 0.5s fade-in / slide-in vocabulary, always behind `prefers-reduced-motion`. New and changed forms use react-hook-form + zod per AD-9; error timing follows the resolver, not per-keystroke validation.

**Positioning rule (owner, 2026-09-25):** the series page is not the main feature — it is the ad for the main feature. Predictions are the material; the Game 7 outcome is the payoff. Every series-page decision below follows from that: the default view never discloses the outcome, and the reveal of the result is the moment the comparison sells the model.

Rendering split per AD-7 (amended 2026-09-25): featured (flagship) and active series prerender as a **pair** — `/series/<id>` (preview: facts through Game 6, no Game 7 outcome in content or meta) and `/series/<id>/result` (full record + resolution, indexable as the outcome-answering page). Non-flagship historical series keep a single full-record page — lookup surface, not funnel. All these pages are prerendered static HTML with full content and meta — a JS-disabled crawler sees headline, scores, write-up, embed facades, and CTA; client behavior layers on after hydration. Custom routes (`/predict`) stay client-rendered. No prediction outputs are ever baked into the static HTML — method links on the preview are deep-links, not results.

Two audiences shape everything below: returning fans who know the app (Wang, UJ-2) and **cold visitors arriving from a social share or search** who have never seen the app (Bert, UJ-1; Rhian, UJ-3) — the OG card and series pages must orient them in under five seconds, with no assumed context. Share arrivals want suspense; search arrivals ("2016 Finals Game 7 result") want the answer — two intents, two pages, both crawlable.

## Information Architecture

Delta only — existing routes unchanged (`/`, `/predict`, `/historical`, `/insights`, `/maths`).

| Surface | Reached from | Purpose |
|---|---|---|
| Series preview `/series/<id>` (featured/active) | OG card tap (external), archive overlay "View full series page", Predict CTA links | Spoiler-free editorial on a Game 7 through Game 6; orients cold visitors and converts them to `/predict` |
| Series result `/series/<id>/result` (featured/active) | Explicit reveal on the preview; search for the outcome | The full record + resolution write-up; outcome-answering page |
| Series page `/series/<id>` (non-flagship) | OG card tap, archive overlay, Predict CTA | Single full-record editorial page (unchanged shape) — lookup surface, not funnel |
| OG card (image, not a route) | Platform link preview when any shareable URL is posted | The ad. Wordmark + matchup drama, zero chrome |
| Share affordance | Series page header, Predict detailed result | One tap → native sheet or copied link |

**Preview/result pair scope:** only the five flagship (`is_featured`) series and any live **Active** (inseason) series carry the pair. The 172 non-flagship historical series stay single full-record pages — pairing all 177 would emit 172 near-empty preview pages, a thin/doorway pattern that risks domain-level demotion (sprint-change-proposal-2026-09-25). The result page is reached only by an explicit reveal action from the preview, never by direct link from the archive list.

Shareable URLs per AD-6: `/series/<id>?method=<slug>` (historic prediction share), `/predict?custom=<base64>` (custom matchup). What users actually copy/share is always the **`share-og` Edge Function URL** — it serves per-link `og:title/description/image` to crawlers and redirects humans to the deep link with `utm_source=share` appended (FR-25/SM-3 attribution; the parameter flows through the single NFR-V1 analytics layer only, never a second tracker). The base64 custom payload follows the `SharePayload` schema owned by `supabase/functions/_shared/contract.ts` (AD-2) — Share button and `share-og` both derive from that one contract, so there is one link shape and one card per link.

**Arrival behavior:** see State Patterns for what each URL renders on arrival (`?method` → Predict preloaded; bare featured/active → the spoiler-free preview; bare non-flagship → the full-record page; unknown id → 404, never a blank page). The 404 strategy must not compromise crawlability of the prerendered set.

The pilot's five flagship series (owner-pinned 2026-09-25, FR-13): **2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs**. `is_featured` marks them: it drives the Home featured selection, the preview/result pair, and the archive-overlay "View full series page" link (the Home surface itself stays ratified as-is). The archive overlay link row renders only when editorial content exists; bare series show no link.

## Voice and Tone

Guardrail first (PRD §7): "oracle", "guarantee", "lock", or any accuracy-claiming framing never appears in product microcopy, OG meta, or CTAs — predictions are explainable estimates.

Microcopy anchors from PRD addendum §H: "Where data meets playoff drama" · "Decode the biggest game in basketball" · "Every Game 7 has a history" · "Not just who wins, but why" · "From iconic classics to hypothetical showdowns" (the final anchor spans both share surfaces — historic series pages and custom-matchup shares; natural homes: the series-page Predict CTA and the custom/fallback OG meta). The voice is a confident sports desk: declarative sentences, specific numbers, no hype punctuation.

**Spoiler discipline (2026-09-25):** on preview pages, OG cards, and any pre-reveal copy, the Game 7 outcome is never stated, hinted at in past tense, or visible in a score. The register is tension-forward, present-tense: "Game 7 stands." · "Six games. One winner still unknown." · "The models have their picks — do you?" The resolution voice (past tense, verdicts) belongs only to the result page and non-flagship full-record pages.

**OG meta copy** (`og:title` / `og:description`, served by share-og alongside the card image) — per variant:

| Variant | og:title | og:description |
|---|---|---|
| Historic | "{TeamA} vs {TeamB} — Game 7, {Year} {Round}" | "Every Game 7 has a history. Decode the biggest game in basketball on PredictGame7." — never states a predicted winner or the series result. |
| Custom matchup | "{TeamA} vs {TeamB} — a hypothetical Game 7" | "From iconic classics to hypothetical showdowns. Model this matchup on PredictGame7." |
| Fallback | "PredictGame7 — Where data meets playoff drama" | "Decode the biggest game in basketball." |

Prerendered pages carry real per-series `<title>`/`description` (CAP-8): the featured/active **preview** route's title/meta is winner-free (year · round · teams · "Game 7 stands"); the **result** route's is outcome-inclusive (final score, winner — this is the page search-intent readers land on); non-flagship pages keep outcome-inclusive meta.

| Do | Don't |
|---|---|
| "Link copied." | "✓ Successfully copied to clipboard!" |
| "Couldn't load this series." + Retry | "Error fetching data. Please try again later." |
| "No active series right now — the next Game 7 is coming." | "No results found." |
| "Every Game 7 has a history. This one's waiting." (empty archive) | "There is nothing to display at this time." |
| Numbers over adjectives: "Cavs erase 3–1" (result page) | "Amazing comeback!" |
| "See how the series ended →" (reveal link) | Spoiler hints in preview copy: "you won't believe…", past-tense leakage |
| Credit creators plainly: "Highlights via [Creator]" | Bury or omit attribution |

Error copy names what failed and what happens next; it never blames the user or the network. Empty states always offer one onward path, never a dead end.

## Component Patterns

Behavioral rules. Visual specs in DESIGN.md · Components.

| Component | Use | Behavioral rules |
|---|---|---|
| OG card | All shareable URLs | One fixed template, rendered server-side per link (AD-6). The historic variant shows teams, logos, and the year·round·Game 7 context in the center slot between the team blocks — **never the series score or winner**. Never blocks the share — platforms cache; render failure → see State Patterns · OG render failure. |
| Series preview page | `/series/<id>` (featured/active) | Spoiler-free: hero names the series in words, score strip shows Games 1–6 only, no Game 7 result anywhere. Carries the method deep-links (each prediction openable with zero re-entry) and the Predict CTA. Sections render only when content exists — absent video/write-up/similar-series leave no placeholder, no heading, no gap. An editorial `headline` overrides the default generated hero headline; markdown before-write-up and images render inside the longform column. The **reveal control** (see below) is the only path to the outcome. |
| Series result page | `/series/<id>/result` (featured/active) | Full record: hero with final score + Game 7 box, all seven games, resolution write-up, video embeds. No per-method prediction links (the outcome is known — predicting is moot); the generic "Model it yourself" CTA persists (it is the funnel). Reached by explicit reveal or direct search arrival. |
| Series page (non-flagship) | `/series/<id>` | Single full-record page as before — hero, score strip (all games + winner), Predict CTA. Not a funnel; a lookup surface. No reveal control. |
| Reveal control | Bottom of the featured/active preview | A labeled link — "See how the series ended →" — to `/series/<id>/result`. Never a bare click-target on hidden content; the destination is stated in the label. Below the fold on the preview so the prediction pitch is read first. On arrival at the result page (client nav or direct), focus moves to the result `<h1>` (`tabindex="-1"`) and `<title>` updates — same rule as the 404 treatment. |
| Video embed | Flagship series pages | One or more embeds may exist; each gets its own facade + credit caption. The **labeled play button is the only activation control** — the facade surface is not clickable. On activation the iframe (carrying `title="{video title} — via {creator}"`) replaces the facade and receives focus. The facade markup (video title, `<img alt="">` thumbnail, creator credit, outbound link) is prerendered — it satisfies the no-JS crawl requirement. Credit caption never omitted when a `credit` string exists. |
| Share button | Series header, Predict detailed | Copies/shares the **share-og URL** (never the raw deep link — GH Pages meta is static, so only share-og serves per-link previews). `navigator.share` where available (mobile), clipboard fallback (desktop) — one code path, same visual. No confirmation dialog; no menu of platforms. |
| Retry panel | Service failure with re-attemptable state | Replaces the failed region in place (not a toast). Preserves all user inputs. Retry re-fires the same request; a second failure re-renders the panel, never an infinite spinner. Deliberate refinement of AD-9's toast-only default: the panel is the treatment for re-attemptable fetch/result regions; sonner stays for one-off mutations. Add a companion note to AD-9 at implementation. |
| Inline field error | All new/changed forms (Predict custom, Contact rebuild) | RHF + zod resolver (AD-9). Errors appear on submit by default (not on keystroke); deterministic constraints (for example, score bounds) are enforced pre-submission via constrained inputs or hints where possible (Story 1.3). Clears on valid re-submit; field stays focus-visible; no toast. |
| Form success confirmation | Contact rebuild | Replaces the form region (not a toast): confirmation title, one line, onward path. Announced via `role="status"`. |
| Empty state | Any list/region with zero items | Shared pattern: icon tile → title → one line → single onward action. Content differs per surface (State Patterns). |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open from share (featured/active) | `/series/<id>` preview | Comprehensible with zero app context, spoiler-free: hero names the series in words, score strip shows Games 1–6, the method links and Predict CTA explain themselves ("Model this matchup yourself"). No outcome, no past-tense leak. No onboarding, no modal. Content is already in the prerendered HTML — no blank frame while JS loads. |
| Cold open (non-flagship) | `/series/<id>` | Single full-record page; hero names the series, score strip shows the result, Predict CTA explains itself. As ratified. |
| Reveal | `/series/<id>/result` | Reached by the preview's reveal link or search. Result `<h1>` receives focus on client nav; `<title>` is outcome-inclusive. Generic "Model it yourself" CTA present; no per-method links. |
| Historic share-link arrival | `/series/<id>?method=<slug>` | Lands on Predict preloaded with series + method applied — zero re-entry (Stories 4.1/4.4). The editorial page is not shown for this URL. Mechanism (owner decision 2026-09-25): client redirect to `/predict?series=<id>&method=<slug>`. |
| Share-attributed arrival | Any shareable URL | `utm_source=share` on the landing URL changes nothing visually; it is consumed by the single analytics layer (NFR-V1) only. |
| Unknown series id / unknown result route | `/series/<id>`, `/series/<id>/result` | 404 treatment: `<h1>` headline "This series doesn't exist." — one line ("It may have been removed, or the link is wrong.") — link to Historical archive. Document `<title>` updates to the 404 copy and focus moves to the headline (react-router doesn't do this automatically). HTTP 404 via the SPA fallback page — applied so the prerendered flagship set stays fully crawlable (real content, real 200s). A bare `/series/<id>/result` with no preview sibling (non-flagship id) is a 404. |
| OG render failure | share-og function | Generic fallback card (wordmark + tagline). Silent to the user — the shared link itself always resolves. |
| Series fetch failure | `/series/<id>`, `/series/<id>/result` | Retry panel replaces the content region; hero skeleton stays so the page frame is stable. |
| Predict service failure | `/predict` | Existing sonner toast for the mutation + retry panel around the result region; form inputs preserved. |
| Share copy success | Anywhere share exists | sonner toast: "Link copied." — 2s, no action button. Native share sheet needs no toast (the platform confirms). |
| Clipboard blocked | Anywhere share exists | sonner toast: "Couldn't copy — long-press the address bar to share." The share-og URL is always in the address bar; the share never dead-ends. |
| Empty Active list | Home / Historical | "No active series right now — the next Game 7 is coming." + link to the archive: "Every Game 7 has a history." |
| Offseason empty Insights | Insights | Same shared pattern; onward link to Historical. |

## Interaction Primitives

Mouse-first responsive web; no keyboard-shortcut layer, no drag. The new surfaces add exactly four gestures:

- **Tap Share** — one tap, no menu. Result is either the native sheet or "Link copied." Nothing in between.
- **Tap archive overlay link** — "View full series page →" navigates; the overlay closes on navigation, not before.
- **Tap video facade play button** — swaps to the YouTube iframe and autoplays. One tap only; no second confirmation step.
- **Tap reveal link** — "See how the series ended →" navigates to the result page. One tap; no interstitial confirmation ("are you sure?" gates the payoff — the label is the consent).

Banned on new surfaces: infinite scroll (archive stays paginated/scroll-complete as built), hover-only affordances (Share is always visible), auto-playing video without a tap, any interception of the browser back button. Touch targets: **every interactive target on new surfaces carries a ≥44×44px hit area** (NFR-U1) — the visual may be smaller; expand via padding or pseudo-element (icon-only Share, facade play button, reveal link, primary CTAs, onward links in empty/404 states).

## Accessibility Floor

WCAG 2.1 AA is the standing bar (NFR-A1) — behavioral requirements for the new surfaces:

- OG card content is decorative to screen readers — the shared **link text/URL** carries meaning, not the image. Alt text on any in-app rendering of card imagery describes the matchup, not the design.
- Share button has an accessible name ("Share this series") even in icon-only form; the "Link copied." toast fires in a sonner region already wired as `aria-live`.
- Retry panel announces on appearance (`role="status"`), and the Retry button is the first tab stop inside it.
- Inline field errors are wired via `aria-describedby` and announced with the field, not just visually placed.
- Video embeds carry the creator credit as visible text (not burned into the frame) and the facade's play control is a real button with a label.
- The reveal link states its destination in its accessible name ("See how the series ended"); navigating to the result page moves focus to its `<h1>` (`tabindex="-1"`) so the swap is announced. The outcome is never in the preview's DOM at all — it lives on a separate page, so no screen reader, text selection, or view-source leaks a hidden spoiler.
- All new type meets AA contrast on white; the token decisions and permitted pairs (`#767676` small-text floor, `destructive-text #B91C1C`, `on-muted #595959`, form-control borders) live in DESIGN.md · Colors. Behavior the spines add here: selected form values always render in ink (`foreground`); placeholders in `#767676`.
- Semantic state colors follow the usage rule in DESIGN.md · Colors (never text, never the sole carrier of meaning). The retry panel's warning icon is `aria-hidden` decoration — the adjacent heading carries the meaning.
- When a content region is replaced (retry panel, form-success confirmation, facade→iframe swap), focus moves to the replacement container or its heading (`tabindex="-1"`) — never silently to `<body>`; from there, Retry or the player controls are the next tab stop.
- The Contact rebuild inherits the retry-panel and inline-error announcements above.
- `prefers-reduced-motion` disables fade/slide on series page sections.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| `lg` (1024px+) | Series page is sidebar + centered `max-w-3xl` column, matching existing shell. |
| `< lg` | Sidebar → Sheet (existing). Series column goes full-width with 20px side margins. |
| Any mobile | Share renders icon-only in the header; native share sheet expected. Video facade full-width 16:9. |

The OG card itself has no responsive behavior — it is a fixed 1200×630 image; platforms crop as they will, so the template keeps all essential content inside a safe center zone of 1080×540 (owner-approved 2026-09-25 as mocked).

## Inspiration & Anti-patterns

- **Lifted from The Athletic / sports broadsheets:** longform series pages as editorial columns, eyebrow labels as section voice, hairline score strips.
- **Lifted from existing app practice:** Insights icon-tile motif reused for empty states; archive overlay blur vocabulary reused for series-page transitions; fade-in motion reused, never reinvented.
- **Rejected — probability bars / win-percentage animations on the series page:** the series page is history, not prediction; the Predict surface owns probability expression (and already shows trophy + numbers, no bars).
- **Rejected — platform share menus (Facebook/X/Reddit buttons):** one Share button, native sheet or clipboard. Menu buttons date the surface and leak third-party trackers into an analytics-isolated app (NFR-V1).
- **Rejected — dark mode for the OG card only:** the card inverts the palette (ink field) deliberately; that is an image composition choice, not a dark theme, and must not seed a dark UI.
- **Rejected — single-page toggle reveal (result folded into the preview behind a click):** it either hides the outcome from JS-disabled crawlers — breaking AD-7's crawl requirement for the richest content — or leaves it in the HTML for view-source/selection to leak. Two honest URLs also capture two search intents (prediction vs outcome) where one page can rank for only one.
- **Rejected — social-media-temperature widget on series pages:** owner idea, parked as a future concept; out of scope for this release (logged in memlog).

## Key Flows

### Flow 1 — The share round-trip (Wang, analytics-minded fan, UJ-2; playoff evening — the friend on the receiving end lives UJ-1's resolution)

1. Wang stress-tests a custom 2016-style fantasy matchup on Predict, compares methods, and taps **Share** in the detailed result.
2. Desktop: no native sheet — the **share-og URL** goes straight to his clipboard. sonner: "Link copied." He pastes into the group chat.
3. The chat's crawler hits share-og and renders the OG card: ink field, two logos, "CUSTOM MATCHUP" eyebrow, wordmark band — plus og:title/description. His friends see a shareable object, not a bare URL.
4. A friend — mid-debate, needing an answer in ninety seconds (UJ-1) — taps the card on mobile. share-og redirects to `/predict?custom=<base64>` with `utm_source=share`, counted toward SM-3 through the analytics layer. The page hydrates the exact matchup — no form re-entry.
5. **Climax:** the friend sees Wang's matchup and the "Model it yourself" path in one screen — the debate gets settled with numbers, the app earns a new visitor with zero onboarding, and the thread itself starts re-running the matchup.

Failure: clipboard API blocked (older browser) → toast becomes "Couldn't copy — long-press the address bar to share." share-og render failure → generic fallback card; the redirect still lands.

### Flow 2 — A citable angle before deadline (Rhian, newsletter writer, UJ-3; Wednesday afternoon, playoffs on)

1. Rhian searches "2016 Game 7 Cavs Warriors result" from a deadline tab. Google serves the **prerendered result page** `/series/<id>/result` — outcome-inclusive title and description, no JS needed to crawl it. (A "prediction" query would surface the preview page instead — two intents, two pages.)
2. The page answers in five seconds: hero names the series in words, the score strip gives the final score, the Game 7 box, and every game — the numbers she needs are citable without scrolling the write-up.
3. She reads two resolution paragraphs for the angle, then taps the labeled play button on the video facade — highlights play inline, creator credited below the frame.
4. The similar-series slot (when populated) gives her an "on this day in Game 7 history" second link; the Maths page linked from the methodology mention gives her a citation for the model itself.
5. **Climax:** Rhian files her newsletter with a sourced stat, a credited video, and a link her readers can open — the flagship result page turned a search into a citation, with no signup wall and no dead ends.

Failure: series fetch fails (client-side refresh path) → retry panel in place of the content region, hero frame stable, position preserved. One Retry tap recovers; a second failure keeps the panel, now with a link to Historical — never a spinner. The prerendered HTML means the cold-arrival version of this page doesn't depend on that fetch at all.
