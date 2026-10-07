# Sprint Change Proposal: OG meta moves to the prerendered pages, and `share-og` becomes an image renderer (2026-10-07, second proposal)

Status: **approved by the owner 2026-10-07** (batch review) and applied the same day, all eight proposals, Proposal 6 kept. This is the second proposal dated 2026-10-07. The first (`sprint-change-proposal-2026-10-07.md`) moved the analytics port to Story 4.0.

## 1. Issue summary

**Trigger:** a feasibility finding while planning Story 4.2 (`bmad-build`, step 2, 2026-10-07). AD-6's `share-og` design depends on the Edge Function serving an **HTML page** that carries per-link `og:title`, `og:description` and `og:image`, and redirects people to the site. Supabase's own documentation rules that out on the default domain:

> "HTML content is not supported. `GET` requests that return `text/html` will be rewritten to `text/plain`."
> — https://supabase.com/docs/guides/functions/http-methods

Social crawlers (Facebook, X, Slack, iMessage, Discord) read OG tags only from `text/html`, so the HTML half of `share-og` would unfurl as nothing. The **image** half is unaffected: `image/png` responses are not rewritten.

**Why it was not caught earlier:** AD-6 deferred its own validation to an "FR-31 spike" ("unverified against Edge Function CPU limits — measure in the FR-31 spike"), and that spike never ran. This is a technical limitation found before any code was written.

**Owner decision (2026-10-07), option A of four.** The other options:
- **(B)** a free edge host for the HTML page: adds a vendor, which AD-6 forbids;
- **(C)** a Supabase custom domain: a paid add-on, breaking the zero-cost constraint;
- **(D)** trusting a `text/plain` response empirically: brittle, and against the docs.

Option A in brief:
- `share-og` becomes an **image-only PNG renderer**.
- Per-series OG tags come from **Story 4.3's prerendered `/series/<id>/index.html`** on GitHub Pages, with `og:image` pointing at the `share-og` PNG.
- The shared link is the **plain site URL** plus `utm_source=share`, with no redirect hop.
- Cards are **per series**. GitHub Pages serves one file per path, whatever the `?method=`, so the per-method "MODEL: …" line goes.
- **Custom matchups unfurl with the generic fallback card.**

## 2. Impact analysis

**Epic impact.** Epic 4 only. Its goal still holds: links unfurl as cards and land on a working page. The mechanism changes, and so does the split of work between 4.2, 4.3, 4.4 and 4.7. No epic is added or removed. The order 4.2 → 4.7 stands, and 4.2 gets smaller.

**Story impact**

| Story | Change |
|---|---|
| 4.2 | Re-cut to the PNG renderer: historic + fallback variants, anonymous GET, `image/png`, never a 500. The platform-debugger AC moves to 4.3, which is the first point at which a crawler can see the tags. |
| 4.3 | Gains: per-page `og:*` / `twitter:*` tags with `og:image` → `share-og?series=<id>`. Also (Proposal 6, droppable) static shells for `/predict`, `/historical`, `/insights` and `/maths`, so those routes, and custom-matchup shares, answer **200** with the generic card. This settles 4.1's deferred HTTP-404 finding (B14). |
| 4.4 | The Share button copies the **site URL** plus `utm_source=share`, not a `share-og` URL. The `/series/<id>?method=` redirect must carry `utm_source` through, which closes the 4.4 note in 4.1's deferred entry. `SharePayload` now serves only the `/predict?custom=` encoding. |
| 4.7 | Its debugger check targets the site URL, and its round-trip has no redirect hop. |

**Artifact conflicts**

| Artifact | Effect |
|---|---|
| PRD FR-31 | Narrowed for one case: custom-matchup shares unfurl with the generic card, not a per-matchup card. This is an owner-accepted narrowing, noted inline (Proposal 7). Nothing else changes. |
| Architecture spine | AD-6 rule rewritten (Proposal 1). AD-2, AD-7, the Performance row, the tech table, the tree comment and the FR map are touched (Proposal 2). |
| UX DESIGN.md | OG card variants drop to two (historic + fallback). The custom variant and the MODEL line go. The Share button copies the site URL. |
| UX EXPERIENCE.md | The share-URL paragraph, the OG meta copy table, the component rows, the state rows and Flow 1 change (Proposal 4). |
| `epics.md` | Requirements inventory lines, UX-DRs, the coverage map, the Epic 4 summary, and Stories 4.2/4.3/4.4/4.7 (Proposal 3). |
| `deferred-work.md` | Annotations only (Proposal 8). |
| `epic-4-context.md` | Goes stale automatically when `epics.md` is newer. The next `bmad-build` recompiles it. |

**Technical impact:**
- No code exists yet for 4.2, so there is nothing to roll back.
- Story 4.1's shipped behaviour is unchanged.
- **Removed:** the `?p=` share payload and the HTML/redirect path.
- **Added:** `og:image` absolute URLs to `*.supabase.co/functions/v1/share-og`, deployed with `--no-verify-jwt`.

## 3. Recommended approach

**Direct adjustment** within Epic 4. Effort: low to moderate, all documentation. Risk: low.

| Risk | Mitigation |
|---|---|
| Per-series unfurls arrive only when 4.3 deploys, not when 4.2 does | 4.2 → 4.3 is already the planned order, and the 6–8-week pre-window deadline covers the whole epic |
| Platforms cache an `og:image` per URL | The card is per series and stable, so caching is a benefit |
| Card render cost on the free tier | One render per series per crawler cache miss, far less than per-share HTML would have been; still measured in 4.2 |

**Trade-offs accepted by the owner:**
- no per-method card line;
- a generic card for custom matchups;
- one fewer hop for humans, who now land on the site directly instead of through a redirect. NFR-P1's "≈1s redirect" concern disappears.

## 4. Detailed change proposals

### Proposal 1: AD-6 rule (`ARCHITECTURE-SPINE.md:104`)

Replace the whole `**Rule:**` paragraph of AD-6 with:

> - **Rule:** a Share Link is a **site deep-link**:
>   - `/series/<id>?method=<slug>` for archive series (the prerendered per-series route, AD-7);
>   - `/predict?custom=<url-safe base64 of {teams, scores, method}>` for Custom Matchups, following the `SharePayload` schema owned by `_shared/contract.ts` (AD-2).
>
>   Opening either re-renders without re-entry. Share links carry `utm_source=share` (FR-25 attribution), and any client redirect must preserve it.
>
>   **Build chain must emit a `404.html` SPA fallback** (copy of `index.html`), so GitHub Pages serves the app on every client-rendered deep-link (shipped in 4.1).
>
>   **Per-link OG meta comes from static HTML on GitHub Pages, never from an Edge Function:** Supabase rewrites `GET` `text/html` responses to `text/plain` on `*.supabase.co` (supabase.com/docs/guides/functions/http-methods, verified 2026-10-07), and crawlers read OG tags only from HTML.
>   - Each prerendered `/series/<id>/index.html` (AD-7) carries its own `og:title`, `og:description`, `og:url` and `twitter:card`. Its `og:image` is the absolute URL of the **`share-og` Edge Function**, an **image-only renderer**: `GET …/functions/v1/share-og?series=<id>` → a 1200×630 `image/png`. It uses an `@vercel/og`-compatible `ImageResponse`, imported by URL per the AGENTS.md esm.sh/no-`jsr:` convention.
>   - `share-og` is **anonymous/public, with no JWT verification** (deployed `--no-verify-jwt`). Its only input is a public series id. An unknown or missing id, or any render failure, returns the generic fallback card, never a 500.
>   - Because GitHub Pages serves one file per path, **cards are per series, not per method**.
>   - The **historic card carries matchup context only** (teams, logos, year·round·Game 7), never the series score or winner (AD-7 spoiler-free amendment).
>   - Custom-matchup links unfurl with the **generic fallback card** from the static app-route shells (AD-7). Static hosting cannot vary meta per query string, and that is accepted (owner, 2026-10-07).
>
>   Rejected:
>   - prerender SaaS and Vercel OG hosting (cost/vendor);
>   - an HTML-serving `share-og` (Supabase `text/plain` rewrite);
>   - a Supabase custom domain (paid);
>   - a third-party edge host for the HTML page (vendor).
>
>   *Amended 2026-10-07 by `sprint-change-proposal-2026-10-07-b.md`; the original rule had `share-og` serve an HTML page that redirected people to the site.*

The AD-6 heading's tag gains `amended 2026-10-07 — OG meta from prerendered pages; share-og image-only`.

### Proposal 2: the other spine touchpoints

- **AD-2 (`:70`):** "The contract is also the single owner of the **share payload schema** (`SharePayload` + its url-safe base64 encoding, AD-6) so the Share button and `share-og` can never derive divergent shapes." → "…so the Share button's encoder and the `/predict?custom=` decoder can never derive divergent shapes (`share-og` takes only a series id since the 2026-10-07 AD-6 amendment)."
- **AD-7 (`:110`):** after "real `<title>`/description/OG meta (year, round, teams, winner)", add "— `og:image` = `share-og?series=<id>` (AD-6)". Then add one sentence at the end of the rule:

  > The prerender also writes static shells, copies of `index.html` with generic meta, `og:image` = the `share-og` fallback card and real 200s, for the app's own routes `/predict`, `/historical`, `/insights` and `/maths`, so those routes and custom-matchup shares are not served through the 404 fallback (amended 2026-10-07).

- **Performance row (`:134`):** "`share-og` redirect target ≈ 1s — unverified against Edge Function CPU limits, measure in the FR-31 spike" → "`share-og` card render (crawler-side only; humans never wait on it) — measured in Story 4.2 against Edge Function CPU limits".
- **Tech table (`:152`):** "`npm:@vercel/og` (satori + resvg) in the `share-og` function (AD-6)" → "an `@vercel/og`-compatible `ImageResponse` (satori + resvg), imported by URL per AGENTS.md, in the image-only `share-og` function (AD-6)".
- **Tree (`:172`):** `# share-og = FR-31 (AD-6)` → `# share-og = FR-31 OG card PNG (AD-6)`.
- **FR map (`:195`):** "`/series/<id>` deep-links + `share-og` + `404.html` fallback" → "`/series/<id>` deep-links + prerendered OG meta + `share-og` card PNG + `404.html` fallback".

### Proposal 3: `epics.md`

**Inventory and coverage.**
- `:73` NFR3: "`share-og` ≈ 1s, measure in FR…" → "`share-og` card render measured in Story 4.2 (crawler-side only)".
- `:87` AD-2: "…and `SharePayload` schema…" → "…and `SharePayload` schema (the `/predict?custom=` encoding)…".
- `:91` AD-6, replace with: "AD-6 (amended 2026-10-07): Sharing — share links are site deep-links (`/series/<id>?method=<slug>`, `/predict?custom=<base64>`) carrying `utm_source=share`; per-series OG meta lives in AD-7's prerendered pages; `share-og` is an anonymous image-only Edge Function (`?series=<id>` → 1200×630 PNG, fallback card on any failure) because Supabase rewrites `text/html` to `text/plain`; **build chain emits `404.html` SPA fallback**."
- `:104` UX-DR-1: "three variants" → "two variants (historic, fallback; the custom-matchup variant was dropped 2026-10-07, AD-6)".
- `:106` UX-DR-3: "copies the share-og URL" → "copies the site URL with `utm_source=share`".
- `:141` NFR3: "`share-og` ≈1s measured in spike" → "`share-og` card render measured in Story 4.2".
- `:168` "P1 (share-og timing)" → "P1 (`share-og` render time)".

**Epic 4 summary, `:167`.** Replace "`share-og` Edge Function (anonymous — no JWT; `@vercel/og` card; `SharePayload` from `_shared/contract.ts`; redirect with `utm_source=share`) →" with:

> "`share-og` Edge Function — image-only card renderer (anonymous; `@vercel/og`-compatible; per-series PNG + fallback; OG meta lives in the prerendered pages because Supabase rewrites HTML to `text/plain` — amended 2026-10-07) →"

**Story 4.2, replaced whole.** The sprint key is kept.

> ### Story 4.2: OG card rendering — `share-og` Edge Function
>
> *Re-cut 2026-10-07 by `sprint-change-proposal-2026-10-07-b.md`: image-only; the OG tags that reference it land in Story 4.3.*
>
> As a content creator pasting a link (Rhian, UJ-3),
> I want every archive series to have a series-specific card image (teams, logos, year/round context) at a stable public URL,
> so that the pages Story 4.3 prerenders can make shared links unfurl as something worth clicking.
>
> **Acceptance Criteria:**
>
> **Given** the anonymous `share-og` Edge Function (AD-6 as amended), imported per the AGENTS.md esm.sh/no-`jsr:` convention
> **When** `GET …/functions/v1/share-og?series=<id>` is requested with no auth header
> **Then** it answers 200 `image/png` at 1200×630: the historic card (DESIGN.md · OG card) with teams, each logo on a white chip, abbreviations in mono, and the "{YEAR} {ROUND}" over "GAME 7" context in the center slot. **There is no series score or winner** (AD-7 spoiler-free amendment) and never prediction outputs.
> **And** a missing, malformed or unknown id, or any render error, answers 200 `image/png` with the fallback card (wordmark + tagline), never a 500
> **And** responses carry a long-lived `Cache-Control` (the card for a series never changes), and the function holds no secret beyond the public anon read it needs
> **And** render time is measured cold and warm against the deployed function and recorded with date (NFR-P1, AD-6)
> **And** a committed probe fetches a known id, an unknown id and a malformed id from the deployed URL and asserts status, `content-type` and PNG dimensions. It is run by the owner after `supabase functions deploy share-og --no-verify-jwt` and recorded with date.
> **And** CI's `deno check` covers the new function (its entry point is type-checked nowhere else)

**Story 4.3, one AC added** after "all emitted pages are indexable with distinct titles/meta…":

> **And** every emitted page carries `og:title`/`og:description`/`og:url` and `twitter:card=summary_large_image`, with `og:image` = `share-og?series=<id>` (AD-6). Preview pages use the winner-free copy (EXPERIENCE.md · OG meta copy). The prerender also writes static shells for `/predict`, `/historical`, `/insights` and `/maths`, with generic meta, `og:image` = the fallback card, and HTTP 200 (AD-7 amendment). The deployed card is verified with at least one platform debugger (Facebook Sharing Debugger or X card validator) on a series URL, recorded with date.

**Story 4.4.**
- The `:852` clause "custom matchups encode via the AD-2 SharePayload contract" stays.
- In UX-DR-3's line, and in the AC wording if it mentions share-og: the copied URL is the site URL with `utm_source=share`.
- Add the AC:

  > **And** the `/series/<id>?method=` client redirect (Story 4.1) carries `utm_source` (and any other non-`series`/`method` query params) through to `/predict`, so attribution survives the redirect.

**Story 4.7.** "OG debugger card render" → "OG debugger card render on a site series URL (meta from the prerendered page, image from `share-og`)".

### Proposal 4: `EXPERIENCE.md`

- **`:42`:**
  - Replace "What users actually copy/share is always the **`share-og` Edge Function URL** — it serves per-link `og:title/description/image` to crawlers and redirects humans to the deep link with `utm_source=share` appended" with "What users copy/share is the **site URL itself** with `utm_source=share` appended; per-series `og:*` tags come from the prerendered page (AD-7) and the card image from the `share-og` Edge Function (AD-6, amended 2026-10-07 — Supabase cannot serve HTML)".
  - The sentence "Share button and `share-og` both derive from that one contract, so there is one link shape and one card per link" → "…so there is one link shape; cards are per series".
- **`:56`:** "(`og:title` / `og:description`, served by share-og alongside the card image)" → "(`og:title` / `og:description`, emitted by the prerendered pages and app-route shells; the image comes from share-og)".
- **OG meta table, Custom matchup row:** "A custom matchup link unfurls with the **Fallback** row (static hosting cannot vary meta per query string — AD-6, 2026-10-07)." The two titles stay as drafted for any future per-matchup surface.
- **`:84`, OG card row:** "One fixed template, rendered server-side per link (AD-6)" → "One fixed template, rendered server-side per series (AD-6)".
- **`:90`, Share button row:** "Copies/shares the **share-og URL** (never the raw deep link — GH Pages meta is static, so only share-og serves per-link previews)" → "Copies/shares the **site URL** with `utm_source=share` (the prerendered page carries the preview meta)".
- **`:108`, OG render failure row:** "Generic fallback card (wordmark + tagline). Silent to the user — the shared link itself always resolves." stays. The state column `share-og function` gains "(image only)".
- **`:112`:** "The share-og URL is always in the address bar" → "The share URL is the page's own address".
- **Flow 1, steps 2–4 and Failure, rewritten:**
  - Step 2: "…the **page URL** (with `utm_source=share`) goes straight to his clipboard…"
  - Step 3: "The chat's crawler reads the link's preview: for a custom matchup that is the generic PredictGame7 card and copy (static hosting cannot vary meta per query string, AD-6 2026-10-07); a historic series share would show that series' card."
  - Step 4: "…taps the card on mobile and lands directly on `/predict?custom=<base64>&utm_source=share`, counted toward SM-3…"
  - Failure: "…share-og render failure → generic fallback card; the link itself is the site, so it always lands."

### Proposal 5: `DESIGN.md`

- **`:134`, OG card layout:** delete "; the custom card puts "VS" there under a "CUSTOM MATCHUP" eyebrow".
- **`:150`, OG card component:**
  - "Three variants, one template: historic series (…), custom matchup (…), fallback (…)" → "Two variants, one template: historic series (year · round · "GAME 7" context in the center slot — no eyebrow — **no series score or winner**) and fallback (wordmark + tagline only, no teams). The custom-matchup variant and the per-link "MODEL: {METHOD}" line were dropped 2026-10-07 (AD-6 amendment: cards are per series, served as `og:image` from static pages)".
  - "Rendered by the share-og Edge Function" stays.
- **`:153`, Share button:** "Copies/shares the share-og URL, never the raw deep link" → "Copies/shares the page URL with `utm_source=share`".

### Proposal 6: static shells for the app routes (droppable)

This is the shell sentence in Proposal 2's AD-7 amendment, and its half of the Proposal 3 AC for Story 4.3. **Why:** without it, `/predict?custom=…` shares answer HTTP 404 through the fallback, and many unfurlers show no preview for a 404, not even the generic card. It also settles 4.1's deferred B14 finding for those four routes. **Cost:** four copied files and one generic-meta template in 4.3's prerender. Drop it if you would rather keep 4.3 to series pages; custom shares then may not unfurl at all.

### Proposal 7: PRD FR-31 (`prd.md`)

Under FR-31's consequence "Link previews render card metadata on major social/chat surfaces", append:

> *(2026-10-07, AD-6 amendment: archive-series links preview with a per-series card; custom-matchup links preview with the generic card — owner-accepted narrowing, `sprint-change-proposal-2026-10-07-b.md`.)*

### Proposal 8: tracking and records

- **`deferred-work.md`:** append a dated annotation to 4.1's B14 entry ("resolved for the app routes by Story 4.3's static shells — Proposal 6") and to its 4.4/utm note ("now a Story 4.4 AC").
- **`sprint-status.yaml`:** no key changes. Add a dated comment on the 4.2 row: `# 2026-10-07: re-cut to image-only (sprint-change-proposal-2026-10-07-b)`.
- **`epic-4-context.md`:** recompiled by the next `bmad-build`, because the edit makes it stale.

## 5. Implementation handoff

**Scope: Moderate.** An architecture amendment plus a reorganization of story content. No code exists yet, so nothing is rolled back.

| Who | Does what |
|---|---|
| Developer agent (this session) | Applies Proposals 1–8 and re-reads every edited region. One commit: `Amend AD-6: OG meta from prerendered pages, share-og image-only (FR-31, AD-6, AD-7)`. |
| Owner | No action until Story 4.2's build. After it: `supabase functions deploy share-og --no-verify-jwt`, then the committed probe. Then, in 4.3, the platform-debugger check. |
| Next | Resume `bmad-build` on Story 4.2 (fresh session recommended); it re-plans from the new ACs. |

**Success criteria:**
- `grep -n "share-og URL\|redirects humans\|?p=" ARCHITECTURE-SPINE.md epics.md EXPERIENCE.md DESIGN.md` returns only dated history lines.
- Story 4.2's ACs mention no HTML or redirect.
- Story 4.3 owns the OG tags and the debugger check.
- Story 4.4 owns utm preservation.
