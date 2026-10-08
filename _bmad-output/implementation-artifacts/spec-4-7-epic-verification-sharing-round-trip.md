---
title: 'Story 4.7 — Epic verification: the sharing round-trip in production'
type: 'chore'
created: '2026-10-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 4's travel path has been checked story by story (4.8's live checks on 0.2.9, the owner's Share check on 0.2.10, the owner's PostHog walks on 0.2.11), but nothing yet proves the whole epic on the deployed site in one place. Story 4.7's acceptance criteria require that record. Its Given was amended on 2026-10-08 to Stories 4.0–4.5 and 4.8, because 4.6 and 4.9 move to post-retro scoping.

**Approach:** Run the drill against https://ujsolon.github.io/predictgame7/ at release 0.2.11. Re-run every automatable check live, and record all results, with dates, in one file, `epic-4-verification-results.md`. It cites the owner-observed evidence rather than re-collecting it:
- the Facebook debugger result (`release-0-2-9-checklist.md`, 4.8 spec);
- the analytics walk (`analytics-continuity-4-7.md`);
- the deploy date against the pre-window target, with any slip escalated.

The record covers, per AC:
- a cold deep-link GET;
- the OG card render via a platform debugger;
- JS-disabled fetches of one bare page, one flagship preview (checked spoiler-free against the live Game 7 score) and its result page;
- the share round-trip with the SM-3 event in PostHog live view;
- measurement continuity, side by side with Story 4.0's before leg;
- a sitemap/crawl spot-check (a sample of prerendered series URLs resolves 200 live);
- the deploy date against the ≥6–8-week pre-window target, plus the escalation note.

No code changes and no deploy.

</frozen-after-approval>

## Implementation Notes

- **Record:** `epic-4-verification-results.md`. Six of the 7 AC checks pass on 0.2.11; row 5 (measurement continuity) is partial by owner decision b. It cites the owner-observed evidence (the Facebook debugger at 0.2.9; the PostHog walks in `analytics-continuity-4-7.md`) rather than re-collecting it, and re-ran everything automatable live on 2026-10-08:
  - `curl`: the deep link, the JS-off fetches and the sitemap;
  - a Node check of the flagship preview against the live Game 7 score (89–93), plus a random sample of 25 sitemap series URLs (25 × 200);
  - the deep-link probe against the live site.
- **Surprise: the first live probe run was RED** (row 12a and its fresh open), from a harness defect. Live, `/predict?series=…` now 301s to the 4.8 shell at `/predict/?…`, and `READ_PRELOAD` required a pathname ending in `/predict`; `vite preview` does not redirect, so local runs never saw it. Fixed in `scripts/probe-deep-links.mjs`, where `READ_PRELOAD` accepts the trailing slash. The guard sits inside a template string that is evaluated in the page, so write `\\/` (two backslashes) in the file for the page to see `\/`, and keep backticks out of the comment (a first edit with a single backslash and a backticked comment broke `node --check`). Re-run: **GREEN, 115 rows**.
- **Files:** `epic-4-verification-results.md` (new), `scripts/probe-deep-links.mjs` (the two-line `READ_PRELOAD` fix, a comment plus the guard, and a header note on the live 301), this spec, and `sprint-status.yaml`. No app code; no deploy.

## Review Triage Log

Pass 1 (2026-10-08), blind-hunter only (one-shot route).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Row 5 (measurement continuity) is marked ok, but the AC asks for **all 10** §A.1 events with the same **names, properties** and firing conditions. The owner walk saw 8 of 10 and copied no properties, and the programmatic substitute was not tried | medium | True. `epics.md` 4.7 AC; `analytics-continuity-4-7.md` "What this record does not settle". Story 4.0's headless walk was scratchpad-only and uncommitted, so there is nothing ready to re-run. The fix is a new headless live walk, which is not a simple patch | **owner decision b (2026-10-08):** row 5 recorded as partial; the headless property walk is handed to the retro (`epic-4-retro-inputs.md` § 0) |
| 2 | § 2 claimed the 0.2.10/0.2.11 diffs left `scripts/og/` alone and only added `is_featured` | medium | True. `fe43c64` changes the prerender (`entry-server.tsx`, `plan.ts`, `SERIES_PAGE_SELECT`); its only `render.ts` edit is a comment. Fixed: § 2 now carries a 0.2.11 re-read with the Facebook crawler user agent, with every tag identical to the debugger's values | patch (applied) |
| 3 | The automated evidence is unreproducible: no sample list, no probe run time or revision | low | True. Fixed: a deterministic every-8th sample of 23 listed URLs (all 200), plus the probe's run time and revision | patch (applied) |
| 4 | The probe fix loosened the path check; the labels and header describe the pre-4.8 URL shape | low | Header row 3 now documents the live 301 to `/predict/?…`, and that the rows assert the query. Adding a pathname assertion is rejected: the callers already pin the full `search`, and a wrong path cannot carry the preload query | patch (header) / reject (assertion) |
| 5 | The trailing-slash path is never exercised locally | low | True, but it needs a new probe variant row for a preview-vs-Pages difference now documented in the header. Rarely met | reject |
| 6 | The Search Console thread is untracked; Googlebot was not tried on a series URL, and `robots.txt` was not checked | low | Fixed: a series URL returns 200 as Googlebot, `robots.txt` is checked, and the thread is added to `epic-4-retro-inputs.md` § 0 | patch (applied) |
| 7 | § 7's margin is ambiguous and "Epic 4 deployed" is unqualified | low | Fixed: 17 weeks to the Feb 4 deadline (about 25 to Apr 1), marked provisional for 4.6/4.9 | patch (applied) |
| 8 | Implementation Notes misdescribe the fix: "one-line", and a single-backslash regex escape where the file needs two | low | Fixed: the note now says two lines, and that the file needs two backslashes before the slash so the page sees one | patch (applied) |
