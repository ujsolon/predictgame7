# Spike: where the OG card is rendered (Story 4.2, 2026-10-07)

**Question.** After AD-6's amendment (`sprint-change-proposal-2026-10-07-b.md`), the card is the only thing a renderer must produce: a 1200×630 PNG per series, referenced as `og:image` from Story 4.3's prerendered pages. Is a Supabase Edge Function (`share-og`, AD-6 as amended) the right place to render it on the free plan, or is the build step better?

**Method.**
1. **Local (Node 24, native).** satori 0.35.1 + @resvg/resvg-js 2.6.2 + sharp 0.35.5 rendered the DESIGN.md historic and fallback cards with Montserrat + JetBrains Mono (fontsource woff) and real repo logos. The script ran from the scratchpad, so the repo was untouched.
2. **Edge.** A throwaway function (`spike-og`) built on Supabase's documented recipe (`npm:@vercel/og@^0`, `npm:react@^19`) rendered the same CLE–GSW card. The owner deployed it with `--no-verify-jwt` on 2026-10-07. Logos were fetched from the live site and fonts from jsdelivr. The function timed its own font load and render (`Server-Timing`), and the client timed the round trip.

## Results

**Local, Node native:**

| Case | satori | resvg | total | PNG |
|---|---|---|---|---|
| first render (cold) | 121 ms | 930 ms | 1,051 ms | 62 KB |
| 2016 CLE–GSW | 14 ms | 643 ms | 657 ms | 62 KB |
| 2013 MIA–SAS | 12 ms | 479 ms | 491 ms | 48 KB |
| webp + jpg logos (DNR–CAC) | 8 ms | 457 ms | 465 ms | 75 KB |
| fallback | 6 ms | 398 ms | 404 ms | 27 KB |
| **180 cards in a loop** | | | **46.4 s total, 258 ms/card** | ≈10 MB |

**Edge, deployed on the free plan:** HTTP 200 on all 8 hits, with no `546 WORKER_LIMIT`.

| Hit | Client round trip | Fonts | Render (incl. logo fetch I/O) |
|---|---|---|---|
| first ever | 7,606 ms | 2,034 ms | 888 ms |
| warm ×6 | 1,272–4,308 ms | 83–505 ms | 373–437 ms |
| after 90 s idle | 1,573 ms | 83 ms | 564 ms |

The edge PNG is 1200×630 RGBA and 63.8 KB. It is visually identical to the local render.

**Findings that bind whichever path is chosen:**
1. **A raw webp logo renders blank, with no error.** satori embeds the `data:image/webp` image, and resvg then draws an empty box. 8 of the 57 `teams.logo_url` files are `.webp` (Denver Rockets, Minneapolis Lakers, Minnesota Pipers, New Orleans Hornets, New York Nets, …). They must be PNG or JPEG at render time.
2. **Long round names break the layout.** "ABA Western Division Semifinals" pushes the right-hand team off the canvas. The center slot needs a fixed width (≈300 px) with wrapping.
3. **`teams.logo_url` is a site-relative path** (`assets/teams/hawks.png`). An edge render has to fetch every logo from GitHub Pages; a build-time render reads the files from disk.

## What the numbers say

- **Edge is feasible, with no CPU-limit failures.** But:
  - The very first unfurl of a deploy took **7.6 s**: cold boot, module fetch, and 2 s of font download. Crawlers time out on slow images, so the first share after a deploy risks a card-less unfurl.
  - The isolate rarely kept the font cache: fonts were re-fetched (≈85 ms) on most hits.
  - Every crawler cache miss spends an invocation and a render.
  - The documented recipe imports via `npm:`. With this repo's `package.json` present, CI's `deno check` may resolve `npm:` against `node_modules`, the same class of failure as the 2026-09-30 `jsr:` incident. That is unverified, and it would be the first thing to settle if Edge is chosen.
  - It also keeps an ungated, owner-run `supabase functions deploy` step in every card change.
- **Build time is cheap and has no runtime.** About 46 s per full build for ~180 cards, adding ≈10 MB to `gh-pages`. GitHub's CDN serves the cards as static files with real 200s, so there is no cold start, no CPU cap, no invocation count and no deploy step. sharp converts webp at build time, which settles finding 1 in code.
  - **What it gives up:** a new series has no card until the next build. That costs nothing, because its prerendered page (AD-7), which is what carries `og:image`, also appears only on the next build.

## Recommendation

**Render the cards at build time, in Story 4.3's prerender chain.** Emit `dist/og/<series-id>.png` plus `dist/og/fallback.png` and point `og:image` at them on `ujsolon.github.io`. Retire the `share-og` Edge Function before it is built.

This is a third, smaller amendment to AD-6. The meta source stays the same (prerendered pages, decided in proposal b), and only the renderer's host moves from Supabase to the build. Story 4.2 becomes "card renderer as a build step (Node: satori + resvg + sharp, as devDependencies)", feeding 4.3.

Findings 1 and 2 become 4.2 ACs on either path.

**If Edge is preferred anyway:**
- Bundle the fonts as static function files, not fetched.
- Pre-convert the 8 webp logos.
- Add `Cache-Control`.
- Verify `deno check` on the `npm:` import before anything else.

## Cleanup

The throwaway function is still deployed. Remove it with:

```
supabase functions delete spike-og --project-ref zfhtbamvmqztvztyokyf
```

The spike code stays in the session scratchpad and is not committed.
