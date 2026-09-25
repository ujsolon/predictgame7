---
name: predictgame7
date: 2026-09-25
status: approved (owner 2026-09-25 — all six calls decided, see §6)
trigger: Owner reframing post-UX-finalize (spoiler-free series pages) + OG logo-contrast defect
affected: [epics.md, prd.md FR-13/§8.1, SPEC.md CAP-8, ARCHITECTURE-SPINE.md AD-7, DESIGN.md, EXPERIENCE.md, mockups]
---

# Sprint Change Proposal — Spoiler-Free Series Pages + OG Card Fix

## 1. Issue Summary

Discovered at UX finalization review (2026-09-25), before any implementation. Three linked problems:

1. **The series page spoils its own pitch.** The finalized spec shows the final series score on the default view and the historic OG card. For a product whose core loop is "model the prediction, then compare with reality," revealing "Cavs win 4–3" before the user engages spends the payoff on the marketing surface.
2. **Positioning clarified by the owner:** the series page is *not* the main feature — it exists mainly to market the data-based prediction functionality. This also unsettles the write-up perspective (a purely retrospective write-up leaves the prediction page with no role on the page) and motivates a two-page shape.
3. **Visual defect:** the OG card's ink field (`#1A1A1A`) swallows black-bearing team logos (Miami Heat, San Antonio Spurs).

**Owner's proposed shape (2026-09-25):** split each flagship series into **(1) a 3–3 page** — before Game 7, spoiler-free, all predictions linkable — and **(2) a 4–3 page** — series done, outcome + resolution write-up, no prediction links. Reached by an explicit reveal action.

## 2. Impact Analysis

| Artifact | Verdict |
|---|---|
| **PRD** | FR-13 gains a consequence (two-page spoiler-free structure + funnel positioning); §8.1 scope line amended. FR-31, SM-3, UJs: unchanged. |
| **SPEC** | CAP-8 success text conflicts ("game-by-game scores" + per-route content rule now differ by route). Also carries the known-stale FR-13 PLANNED-GATED note (predates the pilot) — fold in now. |
| **Architecture** | **AD-7 conflicts directly:** its Rule bakes "winner" into default-route meta and the full scores table into every prerendered page. Amend in place; route set becomes per-series — featured/active series emit a preview+result pair, bare historical series keep their single full-record page (approved call 6: pairing all 177 would create 172 thin/doorway pages that risk domain-level demotion). AD-6 unchanged except which route a historic share card points at. AD-4 / `series.status`: untouched — 3–3/4–3 is a view-level editorial device for concluded series (and mirrors live truth for Active ones), not a data state. |
| **Epics** | Epic 4: Stories 4.2, 4.3, 4.5, 4.6 AC edits; reveal navigation folded into 4.3 or 4.5. Epic 4 overview page count: 177 → 182 static series pages (5 flagships paired), + active pairs inseason. No new epic. Epics 1/2/3/5 unaffected except Epic 5 copy/AA passes inherit the new surfaces. |
| **UX spines + mocks** | Update pass on both finalized files (they are days old, `status: final` → `draft` → re-final). `key-og-card.html` and `key-series-page.html` revised. This pass was already promised as the "UX-DR registration pass" — now it carries real change, not just registration. |
| **Code/infra** | None — nothing built. |

**Risk (SEO):** search-intent readers typing "2016 Finals Game 7" want the result; landing them on a suspense page is a bad search experience and risks quality-rating damage. **Guard:** both pages prerendered and indexable; the result page carries the full record and resolution write-up (the content Google ranks); the 3–3 page owns the share/OG funnel. Distinct `<title>`/meta per page; no near-duplicate risk since content differs by design.

## 3. Recommended Approach

**Direct Adjustment** (checklist Option 1). Effort: **Low–Medium** — document edits + ~2 extra short write-up halves of owner authoring. Risk: **Low** (pre-build; reversible). Timeline: unchanged; Epic 4's ≥6–8-week pre-window deploy deadline still holds.

Rejected: *Rollback* — N/A, nothing shipped. *MVP review* — scope grows slightly but serves SM-1/SM-3 better than the current spec; no reduction needed.

## 4. Detailed Change Proposals

### A. PRD (`prd.md`)

**A1 — FR-13 consequences, add third bullet:**
```
NEW consequence (after the AD-7 flow bullet):
- Featured series (flagship pilot + live Active series) present as a two-page
  pair: a default "before Game 7" view — series facts through Game 6,
  spoiler-free, with the model predictions as the featured path — and a
  "/series/<id>/result" view (final outcome + resolution write-up) reached
  only by an explicit reveal action. Neither the default view nor its share
  card discloses the Game 7 outcome. Non-flagship historical series keep the
  single full-record page (lookup/search surface; thin preview pages are an
  SEO liability). Series pages exist to market the Predict flow; predictions
  are the main material, results the payoff.
```
**A2 — §8.1 scope bullet** (line ~363): append "— each flagship ships as a spoiler-free 3–3 page plus a revealed 4–3 result page (owner decision 2026-09-25)."
**A3 — Addendum §B:** no schema change; optionally add a one-line pointer that the 3–3/4–3 split is view-level (no `series.status` implication). Low priority.

### B. SPEC (`specs/spec-predictgame7/SPEC.md`)

**B1 — CAP-8 success:** OLD "…containing real meta, game-by-game scores, and a Predict CTA…" → NEW "…one static page per historical series carrying the full record; featured/active series emit a preview+result pair — the preview route's static HTML carries facts **through Game 6** with context meta (year, round, teams — **no Game 7 outcome**), the result route carries the full record (all seven games, winner); all pages crawlable without JS; predictions never baked in."
**B2 — Constraints/Non-goals:** remove the stale FR-13-gated text (predates the 2026-09-25 pilot) — video is PLANNED for the five-series pilot, gate stands archive-wide. (Already flagged at UX close; folded here.)

### C. Architecture Spine (`ARCHITECTURE-SPINE.md`) — AD-7 Rule amendment (ID stable)

```
AD-7 Rule, OLD: "...real <title>/description/OG meta (year, round, teams, winner),
the game-by-game scores table ... a CTA into the Predict flow with that series preloaded."
NEW: "...route set is per-series, decided from DB flags at build time: a non-featured
historical series emits one static page /series/<id> with full record (all games,
winner) and winner-inclusive meta (unchanged shape); a featured (flagship) or active
series emits a pair — /series/<id> (default) with meta and facts through Game 6 —
year, round, teams, games 1–6 scores, no Game 7 outcome — plus links to each
method's prediction (deep-links only, no baked outputs) and a Predict CTA, and /series/<id>/result with the full record (all games,
winner) and the resolution write-up, indexable as the outcome-answering page. All
pages carry real <title>/description/meta and are hydration-served by the same SPA.
Prediction outputs stay interactive — nothing baked (unchanged)."
```
AD-6: one-line note — historic share cards/links default to the spoiler-free route. Log as spine `update` memlog entry (decision + reason: funnel positioning, owner 2026-09-25).

### D. Epics (`epics.md`)

**D1 — Story 4.2 (OG card) AC:** historic variant content OLD "(teams, logos, year/round, method)" card showing series score → NEW "teams, logos (each on a white chip — ink field must not swallow dark logo art), year/round context line ('2016 FINALS · GAME 7'); **no series score or winner**". Fallback/custom variants unchanged.
**D2 — Story 4.3 (prerender) AC:** "all 177 historical series have a static index.html with real content (year, round, teams, game scores, winner)" → "all 172 non-flagship historical series keep one static page with the full record (unchanged shape, winner included); the 5 flagships (and any Active series inseason) emit **two** static pages — `/series/<id>` (facts through Game 6, winner-free, method-deep-links + Predict CTA) and `/series/<id>/result` (full record + resolution); build fails non-zero if any expected page is missing/empty; all pages indexable, distinct titles/meta." Reveal navigation ("See how it ended →", AA: explicit spoiler warning on the link itself) lands as an AC here or in 4.5.
**D3 — Story 4.5 (content model) AC:** editorial content carries **two parts** — before (tension-forward) and resolution (outcome) — each with optional headline/body/images, mapped to their page; video embeds attach to either part (flagship highlight reels canonically sit on the result side, owner's call per series). Update the same-commit `CURRENT_DATA_MODEL.md` AC unchanged.
**D4 — Story 4.6 (flagship load):** authoring AC now covers both halves × 5 flagships; "doubles as marketing material" line gains "the 3–3 page is the ad, the result page the payoff — prediction links appear only on the 3–3 view".
**D5 — Epic 4 overview + FR Coverage Map:** "177 evergreen per-series pages" → "172 full-record pages + 5 flagship preview/result pairs (182 static, + Active pairs inseason)"; FR-13 line gains "two-page spoiler-free structure (featured/active only)".
**D6 — UX Design Requirements section:** register the UX-DRs and add the spine folder to `inputDocuments` (the promised pass), updated for this change.

### E. UX spines + mocks (bmad-ux Update run)

**E1 — EXPERIENCE.md:** Foundation gains the funnel-positioning line; IA table becomes two routes + reveal path; State Patterns: historic share arrival unchanged, bare-series/before-page states, result-page reveal state (approved: the generic "Model it yourself" CTA persists on both pages — only per-method links are preview-exclusive); Voice: tension-forward copy examples ("Game 7 stands", "Six games. One winner still unknown."), Do/Don't rows for spoiler discipline; Flow 2 (Rhian) rewritten to the search→result-page path; OG meta historic `og:description` unchanged (already winner-free).
**E2 — DESIGN.md:** OG card spec — series-score block replaced by context line on historic variant; logos get white/paper chips on the ink field (Do's-and-Don'ts "logos never given a container shape" relaxed to "off the ink field only"); series-page layout duplicated for the pair; reveal control spec.
**E3 — Mockups:** `key-og-card.html` (chips + context, no score), `key-series-page.html` (3–3 default + reveal entry + 4–3 page).
**E4 — Memlog:** record the pivot as a UX-run `decision`/`event` entry; frontmatter `status: draft` during edit, back to `final` at close.

## 5. Implementation Handoff

**Scope: Moderate** (backlog reorganization across five artifacts; solo repo so one agent pass + owner sign-off).

| Step | Who | What |
|---|---|---|
| 1 | Owner | Approve/adjust §6 calls + this proposal |
| 2 | Agent (bmad-architecture update) | AD-7 rule amendment + memlog |
| 3 | Agent (bmad-ux update) | Spines + mocks + memlog (E1–E4) |
| 4 | Agent | PRD A1–A2, SPEC B1–B2, epics D1–D6 (one docs commit; commit only on request) |
| 5 | Owner | Authoring work later in Epic 4, now two halves per flagship |

Sequence matters: spine → spines → downstream, so every editor works from the amended contract.

## 6. Owner Calls — APPROVED 2026-09-25

1. **Route naming:** `/series/<id>` (3–3 preview) + `/series/<id>/result` (4–3). **Approved.**
2. **Result-page CTA scope:** no per-method prediction links on the result page; the generic "Model it yourself" CTA stays on both pages. **Approved.**
3. **Two separate pages, both indexable** (rejected single-page toggle: it either hides content from JS-disabled crawlers — breaking AD-7 — or leaks the result to view-source; and two URLs capture two search intents, preview vs outcome). **Approved.**
4. **Archive lists unchanged** — final scores stay visible there; the suspense rule governs series pages and share surfaces only. **Approved.**
5. **Logo chips:** white/paper rounded chips behind logos on the ink OG field; "no container shape" rule relaxed to off-ink surfaces. **Approved provisionally — owner wants to see the revised `key-og-card.html` mock (with Miami/Spurs) before it sticks.**
6. **Pair scope: featured + active only.** The 5 flagships and live Active series get the preview/result pair; the 172 bare historical series keep single full-record pages (pairing all 177 would emit 172 thin preview pages — doorway-pattern demotion risk). **Approved (supersedes the original "same pair for all" proposal).**
