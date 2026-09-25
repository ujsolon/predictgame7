---
name: PredictGame7
status: final
description: NBA Game 7 prediction analytics. Monochrome editorial sports desk — data in tabular mono, drama in large type, team logos as the only color. Light-only.
updated: 2026-09-25
sources:
  - ../../sprint-change-proposal-2026-09-25.md
colors:
  # Ratified from src/index.css (converted HSL → hex). shadcn token names map 1:1.
  background: '#FFFFFF'
  foreground: '#262626'
  primary: '#1A1A1A'
  primary-foreground: '#FAFAFA'
  muted: '#F5F5F5'
  muted-foreground: '#808080'
  accent: '#F0F0F0'
  border: '#E6E6E6'
  form-border: '#949494'
  ring: '#262626'
  destructive: '#DC3C3C'
  destructive-text: '#B91C1C'
  on-muted: '#595959'
  success: '#22C35D'
  warning: '#F59F0A'
  info: '#1A80E6'
typography:
  display:
    fontFamily: Montserrat Variable
    fontSize: 36px   # text-4xl; md: text-6xl (60px) on heroes
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.01em
  headline:
    fontFamily: Montserrat Variable
    fontSize: 30px   # text-3xl
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body:
    fontFamily: Montserrat Variable
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label:
    fontFamily: Montserrat Variable
    fontSize: 12px   # text-xs; OG eyebrows use 10px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.1em
    textTransform: uppercase
  mono-data:
    fontFamily: ui-monospace / SF Mono / Menlo (Tailwind font-mono)
    note: 'Scores, probabilities, series scores. Always tabular-nums.'
rounded:
  sm: 0.25rem   # --radius base
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem   # Card
  2xl: 1rem     # formula blocks
  3xl: 1.5rem   # carousel
  banner: 32px  # hero banner, one-off
spacing:
  note: 'Tailwind 4-based scale inherited; no overrides.'
components:
  og-card:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    eyebrow: '#8A8A8A'   # ≥4.5:1 on the ink field; image-only pair, never reuse in-app
    logo-chip: '#FFFFFF'   # rounded white plate behind each logo on the ink field — dark logo art must not vanish
    accent: 'team logos only — full color, no treatment beyond the chip'
  series-page:
    background: '{colors.background}'
    rule: '{colors.border}'
  video-embed:
    frame-radius: '{rounded.xl}'
    credit: '{colors.muted-foreground}'
  share-button:
    variant: 'icon-only (ghost) on compact; outline with label in detailed view'
  retry-panel:
    background: '{colors.muted}'
    body-text: '{colors.on-muted}'
    border: '{colors.border}'
    radius: '{rounded.lg}'
  inline-field-error:
    text: '{colors.destructive-text}'
    field-border: '{colors.destructive}'
  empty-state:
    icon-tile: '{colors.accent}'
    radius: '{rounded.lg}'
---

## Brand & Style

PredictGame7 reads like a sports desk broadsheet, not a betting app. The drama is in the data: huge Montserrat headlines, tabular mono scores, hairline rules, and generous whitespace. The only chromatic color in the UI is team identity — logos render in full color against the monochrome surface, and nothing else competes with them. Editorial images inside series write-ups are content, not chrome: they render as shot, untinted, and are the one other source of color on the page. No gradients, no glow, no gamification shine.

The existing app already practices this system (Home hero, Predict trophy result, archive overlay, Insights icon tiles). This DESIGN.md **ratifies** it and specs the four new surfaces — OG share card, flagship series page, Share button, error/empty states — so they ship inside the same visual contract. Light mode only; the `darkMode: ['class']` config exists but dark is never activated and no dark palette is defined. Do not build dark variants.

## Colors

The palette is pure grayscale plus semantic state colors, all already in `src/index.css` as CSS variables except the three contrast tokens added 2026-09-25 (`form-border`, `destructive-text`, `on-muted`).

- **Ink (`#1A1A1A` primary / `#262626` foreground)** carries all type and the OG card background. The OG card is the one surface that inverts the palette — near-black field, white type, logos as the color event.
- **Paper (`#FFFFFF` background / `#F5F5F5` muted / `#F0F0F0` accent)** — muted and accent are structural fills only (icon tiles, formula blocks, retry panel), never decorative.
- **Hairline (`#E6E6E6` border)** separates cards and decorative regions at the lowest viable contrast. Form controls are the exception — see `form-border` below.

Semantic and contrast tokens:

| Token | Hex | Permitted use |
|---|---|---|
| `form-border` | `#949494` | Input/select borders on new and changed forms (≥3:1 on white, WCAG 1.4.11). `border #E6E6E6` stays for cards, rules, and table hairlines. |
| `destructive` | `#DC3C3C` | Error *borders and large text* only (4.42:1 on white — fails AA for small text). |
| `destructive-text` | `#B91C1C` | Small error copy (≥4.5:1). |
| `on-muted` | `#595959` | Body copy on `muted #F5F5F5` fills (~7:1) — never `muted-foreground` on muted. |
| `success` / `warning` / `info` | `#22C35D` / `#F59F0A` / `#1A80E6` | Reserved for data states (series status, pipeline indicators). Never as small text, never as the sole carrier of meaning — a status renders as an ink text label with an optional colored dot/icon meeting ≥3:1 on its fill. Never for chrome. |

Avoid: any accent color for buttons or highlights (primary ink is the CTA color), gradients, shadows heavier than the existing `shadow-2xl` overlay vocabulary, tinted backgrounds on new surfaces.

Contrast floor: `muted-foreground #808080` (~3.9:1 on white) fails AA for small text — the shared token in `index.css` changes to `0 0% 46%` (`#767676`, ≥4.5:1) app-wide at implementation (owner decision 2026-09-25); until then, meaningful small text renders at ≥4.5:1 and `#808080` is restricted to large text (≥24px) and decorative use (see EXPERIENCE.md · Accessibility Floor).

## Typography

Montserrat Variable (served from `resource-static.bj.bcebos.com`, `font-display: swap`) is the only UI face. Headings are weight 500 with -0.01em tracking — never bold-heavy, never italic. Numbers that mean something (scores, probabilities, series records) are `font-mono tabular-nums` — alignment is a data-integrity requirement, not a preference.

The label motif — `text-[10px]`–`text-xs uppercase tracking-widest font-semibold text-muted-foreground` — is the system's section voice. New surfaces use it for eyebrows ("GAME 7 · 2016 FINALS", "CUSTOM MATCHUP", "SIMILAR SERIES") so a reader can orient without reading headlines.

Type scale in practice: hero `text-4xl md:text-6xl`; section heads `text-3xl`; body 16px/1.6. The series page longform column caps at a readable measure (~65ch) even on wide viewports.

## Layout & Spacing

Tailwind's 4-based scale, inherited. Existing shell: `lg:w-64` sidebar + `h-16` header, Sidebar as Sheet on mobile — unchanged.

New surface layouts:

- **OG card** — fixed 1200×630 canvas. Two horizontal zones: upper field (context eyebrow label — "2016 FINALS · GAME 7" — and two team blocks with logos on rounded white chips + abbreviations in mono, "VS" divider; **no series score, ever**), lower band (wordmark left, tagline "Where data meets playoff drama" right, hairline rule above). Margins 64px on each canvas side; type sizes (owner-approved 2026-09-25, as mocked in `mockups/key-og-card.html`): wordmark 48px, team abbreviations 64px mono, year/round label 14px.
- **Flagship series page** (`/series/<id>` preview, `/series/<id>/result`) — single longform column, `max-w-3xl`, vertical rhythm of `space-y-16` between editorial sections. Preview: hero → score strip (Games 1–6 only) → before write-up → similar-series slot (optional) → method-link list → Predict CTA → reveal link ("See how the series ended →"). Result: hero with final score → score strip (all seven games, Game 7 box) → resolution write-up → video embeds + credit → Predict CTA. Non-flagship `/series/<id>` keeps the single full-record layout. Bare series render hero + score strip + CTA only, with no empty placeholders for absent sections.
- **Error/empty states** — centered, `max-w-md`, one icon tile → title → single helpful line → onward action. Never more than one action.

## Elevation & Depth

The existing two-level vocabulary, unchanged: flat hairline-bordered cards by default; `bg-background/95 backdrop-blur-md shadow-2xl` reserved for the archive overlay (and the series-page overlay link derived from it). New surfaces add no elevation levels. The OG card is flat — it is an image, not a UI layer. The retry panel is a `muted` fill, no shadow.

## Shapes

Base radius `0.25rem` from `--radius`; Cards at `rounded-xl` (0.75rem); feature surfaces larger (`rounded-2xl` formula blocks, `rounded-3xl` carousel, 32px banner). New surfaces follow what they sit next to: share icon buttons and inline elements use `rounded-md`; retry panel and empty-state icon tile use `rounded-lg`; the video embed frame uses `rounded-xl` to match Card. Team logos are never given a container shape on app surfaces — they render as-is. The one exception is the ink OG field, where each logo sits on a rounded white `logo-chip` for contrast (image-only treatment; does not seed in-app logo containers).

## Components

Existing shadcn primitives (Button, Card, Sheet, Sonner Toaster, and the full library in `src/components/ui/`) are used as-is. The brand-layer additions:

- **OG card** (`@vercel/og`, server-rendered PNG per AD-6) — ink field, two team blocks (each logo on a rounded white `logo-chip` so dark logo art — Miami, San Antonio — never vanishes into the field), logos as the only color, wordmark + tagline band. Three variants, one template: historic series (year · round · "GAME 7" context eyebrow, **no series score or winner**), custom matchup ("CUSTOM MATCHUP" eyebrow, no year, no series score — never prediction outputs), fallback (wordmark + tagline only, no teams). When the shared link carries a method (`?method=<slug>`), the lower band adds a label-style method line ("MODEL: {METHOD}") left of the tagline — Story 4.2; owner-approved placement, re-tunable once seen against the real UI. Rendered by the share-og Edge Function; never a client component. Companion `og:title`/`og:description` copy per variant lives in EXPERIENCE.md · Voice and Tone. *Chip treatment approved provisionally 2026-09-25 — owner to confirm against the revised mock.*
- **Series page** — hero full-bleed within the column: eyebrow label (year · round), `display` headline (the editorial `headline` field overrides the default team-words headline when present), then the score strip in `mono-data`. Non-flagship single page and the result page: final series score, Game 7 box, and a game-by-game row (**all games, hairline-ruled cells**) per CAP-8. The flagship/active **preview** strip stops at Game 6 — no Game 7 cell, no final score (behavior in EXPERIENCE.md). Below: the markdown write-up inside the longform column; editorial images render full-column-width, `rounded-xl`, with `label`-style captions and required alt text. The preview's reveal link is a text link in ink with the standard underline + focus-visible treatment — deliberately not a button, so it reads as "continue," not "click me."
- **Video embed** — each embed (one or more per page) is a 16:9 YouTube facade in a `rounded-xl` border frame: `<img alt="">` thumbnail (decorative), centered play button, credit caption below in `label` style — "Highlights via [Creator] ↗" as a real underlined link in `#767676` with the standard focus-visible ring. Activation and prerender behavior: EXPERIENCE.md · Component Patterns · Video embed. Partner creator TBD (deferred — FR-13 pilot content not yet sourced); the caption renders whatever `credit` string the editorial model carries.
- **Share button** — icon-only (ghost variant, Share2 icon, ≥44×44px hit area) beside the series header on compact widths; outline variant with "Share" label in the Predict detailed view. Copies/shares the share-og URL, never the raw deep link (EXPERIENCE.md · Component Patterns).
- **Retry panel** — persistent `muted` panel, `rounded-lg`, hairline border: warning-tile icon, one-line failure description in `on-muted #595959`, Retry button. Behavior (in-place replacement, input preservation, the AD-9 refinement): EXPERIENCE.md · Component Patterns · Retry panel.
- **Inline field error** — `destructive-text #B91C1C` under the field, `text-sm`, with `aria-describedby` wiring; the field border switches to `destructive #DC3C3C` (≥3:1 as a boundary). RHF + zod resolver (AD-9). Selected values always render in ink; placeholders in `#767676`. No alert boxes, no toasts for validation.
- **Form success confirmation** — replaces the form region: confirmation title, one line, onward path; `role="status"`. Used by the Contact rebuild (Story 3.3).
- **Empty state** — accent-tile icon (`p-2 bg-accent rounded-lg`, matching Insights tiles), `headline`-weight title, one helpful line in muted text that meets small-text contrast, single onward link/button.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep chrome monochrome — logos and editorial images are the only color | Tint, outline, or backdrop team logos to "fit" the palette (the OG logo-chip is a contrast plate, not a treatment) |
| `font-mono tabular-nums` for every score and probability | Proportional numerals for data |
| Use the uppercase label motif for eyebrows | Sentence-case micro-headers on new surfaces |
| Render bare series as hero + strip + CTA only | Show empty video/similar-series placeholders on non-flagship series |
| Put the Game 7 outcome only on result pages and non-flagship pages | Print a winner or final score on a preview page or the historic OG card |
| Preserve inputs in the retry panel | Clear a form because a fetch failed |
| Ratify — new surfaces match existing practice exactly | Introduce a new radius, elevation, or color token |
