# Sprint Change Proposal: OG cards are rendered at build time, and the `share-og` Edge Function is retired (2026-10-07, third proposal)

Status: **approved by the owner 2026-10-07** (batch review) and applied the same day. This follows `sprint-change-proposal-2026-10-07-b.md`, which moved OG meta to the prerendered pages and made `share-og` image-only.

## 1. Issue summary

**Trigger:** the Story 4.2 rendering spike, `spike-4-2-og-card-rendering.md` (2026-10-07, commits `02a904d` + `b0441ca`), run at the owner's request ("are you sure you're maximizing … or do you need a spike").

**Evidence.** The same card was rendered both ways.

| | Edge (`npm:@vercel/og`, free plan, deployed and then deleted) | Build time (Node: satori + resvg + sharp) |
|---|---|---|
| Works | yes: HTTP 200 ×8, no `546 WORKER_LIMIT` | yes: all 178 archived cards, zero failures |
| Cost | render 370–890 ms; **7.6 s on the first-ever hit**; fonts re-fetched on most hits; one invocation per crawler cache miss | 46.6 s once per deploy (258 ms/card); ≈10 MB on `gh-pages`; nothing at runtime |
| Ops | ungated owner-run `supabase functions deploy`; CI `deno check` risk on `npm:` imports (unverified, the same class as the 2026-09-30 `jsr:` incident) | none beyond the normal deploy |
| Gives up | — | a new series has no card until the next build. That costs nothing, because its prerendered page, which carries `og:image`, also appears only on the next build |

**Findings that bind any renderer:**
- **10 of 59 logos render as blank chips with no error:** 8 `.webp`, BLB `.gif`, KCK `.avif`.
- **15 of 17 round names overflow one line.** All wrap cleanly in a fixed 296 px center slot.

**Owner decisions (2026-10-07):**
- build-time cards;
- wrap round names (no abbreviation);
- the logo conversion goes into Story 4.2.

## 2. Impact analysis

- **Epic 4.** Same goal. The renderer moves from Supabase to the deploy build, and Story 4.2 is re-cut a second time. There is still no code to roll back.
- **Stories:**
  - **4.2** becomes the build-time card renderer.
  - **4.3** points `og:image` at the built files.
  - **4.7**'s wording follows.
  - 4.4 is untouched.
- **Architecture:**
  - AD-6 is amended again: the renderer's host changes, the meta source does not.
  - AD-3's binding list, AD-7's `og:image` target, the system diagram, the performance row, the tech table, the tree and the FR map follow.
- **UX:**
  - DESIGN.md: "server-rendered … by the share-og Edge Function" → "rendered at build time".
  - EXPERIENCE.md: four `share-og` references, and the "OG render failure" state, which becomes a build failure rather than a runtime fallback.
- **PRD:** none. Proposal b's narrowing note still holds.
- **Supabase:** nothing to deploy. The Edge Function list stays `predict-game-7` + `handle-contact`.

## 3. Recommended approach

**Direct adjustment.** Low effort (docs only), low risk.

**Why:**
- The spike showed both renderers work.
- The build-time renderer has no runtime limit, no cold start, no invocation count, no manual deploy step and no CI type-check exposure.
- It reads logos from disk, so `sharp` can normalise any format.

## 4. Detailed change proposals

### Proposal 1: AD-6 (`ARCHITECTURE-SPINE.md:100,104`)

**Heading tag:** append `; amended again 2026-10-07 — cards rendered at build time, share-og retired (spike)`.

**Rule paragraph, replacing everything from "Each prerendered `/series/<id>/index.html` (AD-7) carries its own" through "returns the generic fallback card, never a 500.":**

> Each prerendered `/series/<id>/index.html` (AD-7) carries its own `og:title/description/url` and `twitter:card`, with `og:image` = the absolute site URL of a **card rendered at build time**: `https://ujsolon.github.io/predictgame7/og/<series-id>.png` (1200×630 PNG), plus `og/fallback.png`.
> - The renderer runs in the `predeploy` chain beside the prerender: Node, satori + resvg, with `sharp` normalising every logo to PNG.
> - It reads logos from `public/` on disk and series data with the anon key.
> - **Any card it cannot render, including an unreadable logo, fails the build.** A deploy never ships a blank or missing card.
>
> A Supabase Edge Function renderer (`share-og`) was measured and retired (`spike-4-2-og-card-rendering.md`): it works, but costs a 7.6 s first hit, one invocation per crawler cache miss and a manual deploy step, and carries a `deno check` risk on `npm:` imports.

**In the same paragraph:**
- "Custom-matchup links unfurl with the **generic fallback card** from the static app-route shells (AD-7)" stays.
- The rejected list gains: "an Edge-rendered card (`share-og`, spike 2026-10-07)".

### Proposal 2: the other spine touchpoints

| Location | Old | New |
|---|---|---|
| `:32` diagram | `FN3[share-og — planned FR-31]` | remove the node, and any edge into it. FR-31's card is a build artifact, not a function |
| `:70` AD-2 | "(`share-og` takes only a series id since the 2026-10-07 AD-6 amendment)" | "(the build-time card renderer takes only a series id — AD-6, 2026-10-07)" |
| `:74` AD-3 binds | "any new function (`share-og`, FR-17 notification path)" | "any new function (FR-17 notification path)" |
| `:110` AD-7 | "`og:image` = `share-og?series=<id>` (AD-6)" | "`og:image` = `og/<id>.png`, rendered in the same `predeploy` chain (AD-6)" |
| `:110` AD-7 shells | "`og:image` = the `share-og` fallback card" | "`og:image` = `og/fallback.png`" |
| `:134` Performance | "`share-og` card render (crawler-side only; humans never wait on it) — measured in Story 4.2 against Edge Function CPU limits" | "OG cards are static files rendered at build time (≈46 s per full build, spike 2026-10-07); nothing renders at request time" |
| `:152` tech table | "an `@vercel/og`-compatible `ImageResponse` … in the image-only `share-og` function (AD-6)" | "satori + `@resvg/resvg-js` + `sharp` (devDependencies) in the build-time card step (AD-6)" |
| `:172` tree | `predict-game-7/ handle-contact/ share-og/   # share-og = FR-31 OG card PNG (AD-6)` | `predict-game-7/ handle-contact/` |
| `:195` FR map | "prerendered OG meta + `share-og` card PNG" | "prerendered OG meta + build-time card PNGs" |

### Proposal 3: `epics.md`

**Inventory and coverage:**
- `:73` and `:141` NFR3: "`share-og` card render measured in Story 4.2" → "OG cards built at deploy time (no request-time render; spike 2026-10-07)".
- `:91` AD-6 line: "`share-og` is an anonymous image-only Edge Function (`?series=<id>` → 1200×630 PNG, fallback card on any failure) because Supabase rewrites `text/html` to `text/plain`" → "the card image is a static 1200×630 PNG per series rendered at build time (`og/<id>.png` + `og/fallback.png`; the Edge renderer was measured and retired, spike 2026-10-07) — Supabase rewrites `text/html` to `text/plain`, so meta can never come from a function".
- `:168`: "P1 (`share-og` render time)" → "P1 (build-time card cost)".

**Epic 4 summary (`:167`).** Replace the `share-og` link of the chain ("`share-og` Edge Function — image-only card renderer (…) →") with:

> "build-time OG card renderer (`og/<id>.png` per series + fallback, satori + resvg + `sharp` in the `predeploy` chain; meta in the prerendered pages — amended 2026-10-07, spike) →"

**Story 4.2, replaced whole.** The sprint key `4-2-og-card-rendering-share-og-edge-function` is kept and gets a dated comment, as `3-5-…` did.

> ### Story 4.2: OG card rendering — build-time card renderer
>
> *Re-cut twice on 2026-10-07: image-only by `sprint-change-proposal-2026-10-07-b.md`, then moved from a Supabase Edge Function to the build by `sprint-change-proposal-2026-10-07-c.md` (spike `spike-4-2-og-card-rendering.md`). The OG tags that reference these cards land in Story 4.3.*
>
> As a content creator pasting a link (Rhian, UJ-3),
> I want every archive series to have a series-specific card image (teams, logos, year/round context) published with the site,
> so that the pages Story 4.3 prerenders can make shared links unfurl as something worth clicking.
>
> **Acceptance Criteria:**
>
> **Given** a build-time card step in the `predeploy` chain (Node: satori + `@resvg/resvg-js` + `sharp` as devDependencies; type-checked and linted by the gate, not an unchecked `.mjs`)
> **When** it runs against the series archive (derived phase, AD-4 — never `status`)
> **Then** it writes `dist/og/<series-id>.png` for every archived series and `dist/og/fallback.png`, each 1200×630, matching DESIGN.md · OG card:
> - the historic card has teams, each logo on a white chip, abbreviations in mono, and "{YEAR}" over the stored round name over "GAME 7" in a **fixed-width (≈296 px) center slot that wraps** the round name;
> - **no series score or winner** (AD-7 spoiler-free amendment) and never prediction outputs;
> - the fallback card has the wordmark and tagline only.
>
> **And** every logo is normalised to PNG with `sharp` before rendering, whatever its source format (today 8 `.webp`, 1 `.gif`, 1 `.avif` of 59 render blank otherwise). The site's files and `teams.logo_url` are unchanged.
> **And** any card that cannot be rendered, or a logo that cannot be decoded, **fails the step non-zero**. A deploy never ships a blank chip or a missing card.
> **And** a test renders the longest stored round names ("Western Division Semifinals", "Western Conference Finals") and a converted-format logo, and asserts PNG dimensions and that the logo region is not blank.
> **And** full-archive render time and total output size are recorded with date.
> **And** no Supabase Edge Function is added; nothing is deployed outside `npm run deploy`.

**Story 4.3:**
- "`og:image` = `share-og?series=<id>`" → "`og:image` = the absolute `og/<id>.png` built by Story 4.2".
- "`og:image` = the fallback card" → "`og:image` = `og/fallback.png`".

**Story 4.7:** "image from `share-og`" → "image from `og/<id>.png`".

### Proposal 4: UX docs

**DESIGN.md `:150`:**
- "**OG card** (`@vercel/og`, server-rendered PNG per AD-6)" → "**OG card** (satori + resvg, a static PNG rendered at build time per AD-6)".
- "Rendered by the share-og Edge Function; never a client component." → "Rendered at build time; never a client component."

**DESIGN.md `:134`:** append "The round name keeps its stored wording and wraps inside a fixed-width center slot (≈296 px); it is never abbreviated (owner 2026-10-07)."

**EXPERIENCE.md:**
- `:42`: "the card image from the `share-og` Edge Function (AD-6, amended 2026-10-07 — Supabase cannot serve HTML)" → "the card image from a static `og/<id>.png` rendered at build time (AD-6, amended 2026-10-07)".
- `:56`: "the image comes from share-og" → "the image is the build-time card".
- `:108` state row: "| OG render failure | share-og function (image only) | Generic fallback card (wordmark + tagline). Silent to the user — the shared link itself always resolves. |" → "| OG render failure | card build step | The build fails, so no deploy ships a blank or missing card. Pages without their own card (app-route shells) use the fallback card. Users never see a render failure. |"
- `:173` Flow 1 failure: "share-og render failure → generic fallback card; the link itself is the site, so it always lands." → "the link itself is the site, so it always lands."

### Proposal 5: records

- **`sprint-status.yaml`:** above the 4.2 row, the comment becomes `# 2026-10-07: re-cut to image-only (proposal b), then to a build-time renderer (proposal c); key kept.`
- **`spike-4-2-og-card-rendering.md`:** append "**Decision (owner, 2026-10-07):** build-time cards; round names wrap; logo normalisation in Story 4.2 — applied by `sprint-change-proposal-2026-10-07-c.md`."
- **`epic-4-context.md`:** recompiled by the next `bmad-build`.

## 5. Implementation handoff

**Scope: Moderate.** Documents only.

| Who | Does what |
|---|---|
| Developer agent (this session) | Applies Proposals 1–5, re-reads every edited region, and makes one commit: `Render OG cards at build time and retire share-og (FR-31, AD-6, AD-7)`. |
| Owner | Nothing until 4.2 ships. There is no Supabase step. |
| Next | `bmad-build` on Story 4.2, in a fresh session. |

**Success criteria:**
- `grep -n "share-og" ARCHITECTURE-SPINE.md epics.md DESIGN.md EXPERIENCE.md` hits only dated history ("retired", "spike") and the done Stories 2.0/2.11.
- Story 4.2's ACs name no Edge Function.
