# Sprint Change Proposal: Story 4.3 splits into series pages (4.3) and prerender + meta + shells + sitemap (4.8) (2026-10-07, fourth proposal)

Status: **approved by the owner 2026-10-07** in conversation ("ok with split", "ok with adding it as 4.8", "ok, good with the build"). Applied the same day.

## 1. Issue summary

**Trigger:** `bmad-build`'s scope check on Story 4.3 (2026-10-07). The story bundled two independently shippable deliverables:
1. the client-side series pages: non-flagship full record, flagship and pending preview, flagship result;
2. the build-time prerender of those pages, with per-page OG/Twitter meta (Story 4.2's cards) and static shells for the app routes.

Together they made one very large spec. Most of the risk sits in (2): rendering React to HTML at build time and hydrating it, which requires every page component to render without a browser. The owner chose to split.

**Gap found while scoping:** Story 4.7's AC samples "a sitemap/crawl spot-check", but no story generated `sitemap.xml` or `robots.txt`.

## 2. Impact and changes

**Epic 4.** No goal change and no deadline change: the whole epic must be deployed 6–8 weeks before the Apr 1, 2027 Traffic Gate window, i.e. by about Feb 4–18, 2027. Execution order within the epic: 4.0 → 4.1 → 4.2 → 4.3 → **4.8** → 4.4 → 4.5 → 4.6 → 4.7. Release 0.2.9 follows 4.8, because 4.8's live checks need a deploy.

**`epics.md`:**
- **Story 4.3** is re-titled "Series pages — preview, result and full record" and re-scoped to the client-side routes:
  - non-flagship full-record page;
  - flagship and pending spoiler-free preview with the four method links and the reveal link;
  - flagship result page with focus on `<h1>`, and the 404 treatment for other ids;
  - distinct titles and the retry panel;
  - flagships come from the owner-pinned id list until 4.5's `is_featured` replaces it;
  - components must render without a browser, so 4.8 can prerender them.

  `?method=` keeps redirecting to Predict, as in 4.1.
- **New Story 4.8** carries 4.3's original acceptance criteria **verbatim**, plus a sitemap AC: `dist/sitemap.xml` with every prerendered URL and the four app routes, and a `robots.txt` pointing to it.
- The epic-list execution note gains the in-epic order.
- **Story 4.7's** Given clause becomes "Stories 4.0–4.6 and 4.8 deployed".

**`sprint-status.yaml`:** the `4-3-prerendered-series-pages-seo` key is kept, with a dated comment, as with `3-5-…` and `4-2-…`. A new row, `4-8-prerendered-series-pages-og-meta-route-shells-sitemap: backlog`, is placed right after it.

**Unaffected:**
- PRD, architecture spine (AD-7 already describes both halves) and UX docs;
- Stories 4.4–4.6;
- `deferred-work.md`. Nothing is deferred: the second half is a tracked story.

## 3. Handoff

- **This session:** the edits above in one commit, then 4.3's build resumes at planning.
- **Story 4.8:** the next `bmad-build` after 4.3.
