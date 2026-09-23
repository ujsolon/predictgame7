# Review — Web Verification Lens

- **Artifact:** `ARCHITECTURE-SPINE.md` (draft, 2026-09-23)
- **Reviewer lens:** verify every committed decision reflects web-researched reality as of September 2026, not training-data assumptions.
- **Method:** live web searches/fetches against official sources (vite.dev, npm registry, supabase.com, jsr.io, resend.com, vitest.dev, reactrouter.com/InfoQ, docs.github.com) plus the repo's `package.json`.
- **Overall verdict:** MOSTLY CONFIRMED — the platform assumptions (Supabase free tier, GitHub Pages static behavior, Resend free tier, OG-image pattern, Deno/jsr imports) all check out against current sources; the one genuinely stale committed item is the Stack table's `npm:rolldown-vite@latest` alias, which is now a **deprecated migration shim** superseded by Vite 8 (Rolldown-powered, released March 2026).

---

## Check log

### C1 — rolldown-vite status (Stack table: `vite: npm:rolldown-vite@latest`)
- **Verified:** `rolldown-vite` latest on npm is **7.3.1** and carries a deprecation notice: "Use this package to migrate from Vite 7 to Vite 8. For the most recent updates, migrate to Vite 8 once you're ready." Vite 8.0 shipped 2026-03-12 with "Rolldown as its single, unified, Rust-based bundler"; the rolldown integration guide on vite.dev now 301-redirects to the archived v7 docs.
- **Sources:** https://registry.npmjs.org/rolldown-vite/latest · https://vite.dev/blog/announcing-vite8 · https://vite.dev/blog/announcing-vite8-beta · https://vite.dev/guide/rolldown (→ v7.vite.dev)
- **Verdict:** FAIL (stale). The alias still installs and builds, but the spine ratifies a deprecated package as the stack's Vite. The correct September-2026 posture is `vite@^8` (Rolldown included) — the alias exists only as a Vite 7→8 migration bridge.

### C2 — Vitest ↔ rolldown-vite compatibility (Deferred §: "compatibility with rolldown-vite must be verified before binding")
- **Verified:** Vitest 4.1 (released 2026-03-12, same day as Vite 8) "adds support for the new Vite 8 version" and reuses the installed `vite`. The deferral's open question is now answerable: Vitest 4.x works with Vite 8/Rolldown.
- **Sources:** https://vitest.dev/blog/vitest-4-1.html · https://vitest.dev/guide/migration/
- **Verdict:** PASS with note. The spine correctly deferred rather than asserted; the answer exists now and should be recorded when FR-30 build starts (contingent on the C1 migration).

### C3 — @supabase/supabase-js 2.x currency (Stack: pinned 2.103.1; AD-3: `jsr:@supabase/supabase-js@2`)
- **Verified:** npm latest is **2.117.0**; JSR `@supabase/supabase-js` also at 2.117.0 and documents the `jsr:@supabase/supabase-js@2` import form used in `predict-game-7`. 2.x remains the current major.
- **Sources:** https://registry.npmjs.org/@supabase/supabase-js/latest · https://jsr.io/@supabase/supabase-js
- **Verdict:** PASS. Pin at 2.103.1 is ~14 minors behind but same major; AD-3's jsr import convention is current and correct.

### C4 — react-router-dom 7.x (Stack: ^7.9.5, BrowserRouter + basename)
- **Verified:** **React Router v8 released 2026-06-17** ("deliberately boring release", ESM-only; InfoQ coverage 2026-08-19). v7 remains the installed major in this repo; nothing in the spine claims v7 is the latest, but the spine's stack table has no note that a new major exists.
- **Sources:** https://remix.run/blog/react-router-v8 · https://www.infoq.com/news/2026/08/react-route-v8/ · https://reactrouter.com/upgrading/v7
- **Verdict:** PASS with note. ^7.9.5 is a supported, working choice; flag v8 (ESM-only) as a future upgrade decision, not a spine error.

### C5 — posthog-js / @posthog/react currency (Stack: ^1.376.4 / ^1.9.1)
- **Verified:** posthog-js latest is **1.434.9** — inside the `^1.376.4` caret range, so installs stay current. PostHog remains an active SaaS; AD-1's port design is vendor-agnostic by construction, so no currency risk to the architecture itself.
- **Source:** https://registry.npmjs.org/posthog-js/latest
- **Verdict:** PASS.

### C6 — Supabase official OG-image guide; satori + resvg on Deno Edge Functions (AD-6)
- **Verified:** The official guide **still exists** at supabase.com/docs/guides/functions/examples/og-image. Nuance: the current guide generates images via `npm:@vercel/og@^0` (Vercel's wrapper, which bundles satori + @resvg/resvg-wasm internally) rather than importing raw satori and resvg separately. Deno `npm:` specifiers work in Edge Functions either way; the pattern (Edge Function returns PNG / HTML with og: meta) is unchanged.
- **Sources:** https://supabase.com/docs/guides/functions/examples/og-image · https://vercel.com/docs/og-image-generation
- **Verdict:** PASS with minor correction. AD-6's phrase "satori + resvg — Supabase's official OG-image pattern" is directionally right but the official example now uses `@vercel/og`; implementation should follow whichever import style the current guide shows.

### C7 — Supabase free tier permits the assumed usage (AD-6 invocation budget; Deferred § staging = second project; keepalive assumption)
- **Verified against supabase.com/pricing (Free plan):** Edge Functions **500,000 invocations/month included**; org limit of **2 active projects** (a staging project is permitted); free projects **pause after 1 week of inactivity**; 500 MB database; 50,000 MAU. The spine's keepalive cron and its staging note ("watch its inactivity-pause") both match documented reality. share-og at modest traffic is far inside 500k/mo.
- **Source:** https://supabase.com/pricing
- **Verdict:** PASS. All three free-tier assumptions confirmed.

### C8 — Edge Function runtime limits vs. OG rendering cost (AD-6 "redirect in under a second", Performance row)
- **Verified:** Supabase documents wall-clock and **CPU-time limits** for Edge Functions (limits page + CPU-limits troubleshooting guide). OG rasterization via resvg-wasm is CPU-bound and typically fits, but the spine's <1s claim is untested against the default CPU limit; it should be measured during the FR-31 build.
- **Sources:** https://supabase.com/docs/guides/functions/limits · https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits
- **Verdict:** PASS with note (assumption plausible but not yet empirically checked; spine does label the perf row provisional elsewhere).

### C9 — Resend free tier (AD-3: "free tier required (PRD §6)")
- **Verified:** Resend free tier = **3,000 emails/month, capped at 100/day, 3 domains**, full REST API access. Sufficient for FR-17's low-volume delivery notifications.
- **Sources:** https://resend.com/pricing · https://resend.com/docs/knowledge-base/account-quotas-and-limits
- **Verdict:** PASS.

### C10 — GitHub Pages behavior (AD-6 "GH Pages cannot vary <meta> per URL"; AD-7 prerender; deploy via `gh-pages` branch)
- **Verified:** GitHub docs describe Pages as a **static site hosting service** taking HTML/CSS/JS straight from a repository — no server-side processing, so per-request meta variation is indeed impossible (AD-6's premise is sound); publishing from a branch (e.g. `gh-pages`) is the standard configurable source, matching the `npm run deploy` → `gh-pages -d dist` flow. AD-7's build-time prerender is the only way to get per-route meta there — reasoning confirmed.
- **Source:** https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- **Verdict:** PASS.

### C11 — Tailwind 3 vs 4 (Stack: tailwindcss ^3.4.11, shadcn new-york, HSL tokens)
- **Verified:** Tailwind CSS current major is **v4 (latest 4.3.3)**; v3.4.x is the legacy line. v4 changes config model (CSS-first) and replaces v3-era plugins this repo uses (`tailwindcss-animate` → `tw-animate-css`; container queries now built in). The spine ratifies the existing v3 setup — legitimate as a SEED/convention ratification — but never acknowledges that v4 is the current major or whether staying on v3 is a decision.
- **Sources:** https://registry.npmjs.org/tailwindcss/latest · https://tailwindcss.com (v4 docs)
- **Verdict:** PASS with gap. No false claim, but an unremarked divergence; a one-line note ("v4 exists; v3 retained deliberately / upgrade deferred") would close it.

### C12 — Deno runtime conventions (AD-3: `Deno.serve` + `jsr:` imports)
- **Verified:** `jsr:@supabase/supabase-js@2` confirmed live (C3). `Deno.serve` is the standard Deno HTTP API and is supported by the Supabase Edge Runtime; the legacy `deno.land/std serve` shape in `handle-contact` is indeed the outdated one, so AD-3's migration direction is correct.
- **Sources:** https://jsr.io/@supabase/supabase-js · https://supabase.com/docs/guides/functions
- **Verdict:** PASS.

---

## Findings

| # | Severity | Finding |
| --- | --- | --- |
| F1 | **HIGH** | Stack table commits to `vite: npm:rolldown-vite@latest`, but rolldown-vite (7.3.1) is now a **deprecated Vite 7→8 migration shim**; Vite 8.0 (2026-03-12) is Rolldown-powered and is the supported path. `@latest` on a deprecated package is also a floating-pin hazard. Recommend: plan migration to `vite@^8` and update the Stack row + the Deferred Vitest note (Vitest 4.1 already supports Vite 8, resolving that open question). (C1, C2) |
| F2 | **MEDIUM** | AD-6 cites "satori + resvg — Supabase's official OG-image pattern", but the current official guide uses `npm:@vercel/og` (satori + resvg-wasm wrapped). The pattern and free-tier feasibility hold; the named libraries should be re-pointed at implementation time to match the live guide. (C6) |
| F3 | **LOW** | React Router v8 shipped 2026-06-17 (ESM-only). Spine's ^7.9.5 is fine today, but the stack table gives no signal that a new major exists — worth a Deferred/note so the v7→v8 decision is made consciously. (C4) |
| F4 | **LOW** | Tailwind v4 (4.3.3) is the current major; spine ratifies v3.4.11 without recording that staying on v3 is a choice (plugin implications: `tailwindcss-animate`, `@tailwindcss/container-queries` are v3-era). Add a one-line note. (C11) |
| F5 | **LOW** | AD-6's "redirect in under a second" for OG generation is untested against Supabase Edge Function **CPU-time limits** (resvg rasterization is CPU-bound). Plausible, but should be measured in the FR-31 spike; cite https://supabase.com/docs/guides/functions/limits. (C8) |
| F6 | **INFO** | Everything else verified current: Supabase free tier (500k Edge Function invocations/mo, 2 active projects, 1-week inactivity pause — matching the spine's keepalive and staging notes), supabase-js 2.x (2.117.0, jsr import valid), posthog-js (1.434.9 within caret), Resend free tier (100/day, 3k/mo), GitHub Pages static-only + branch publishing, `Deno.serve` convention. (C3, C5, C7, C9, C10, C12) |

## Verdict summary

The spine's *platform and vendor assumptions* were reality-checked and hold as of September 2026. Its *version commitments* are the weak spot: one (rolldown-vite) has gone stale-to-deprecated since authoring, and two majors (React Router 8, Tailwind 4) shipped without the spine acknowledging them. No finding invalidates an architectural decision (AD-1…AD-9 all stand); F1 is a Stack/Deferred correction, F2 is an implementation-detail correction to AD-6's wording.
