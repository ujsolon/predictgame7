# Reconciliation: APP_FUNCTIONALITY_OVERVIEW.md → PRD + Addendum

- **Input:** `APP_FUNCTIONALITY_OVERVIEW.md` (253 lines; source purpose: "support marketing, brand strategy, content planning, and social media brainstorming")
- **Compared against:** `prd.md` (baseline, reconstructed 2026-09-22) + `addendum.md`
- **Reviewer scope:** content in the INPUT that is MISSING from or CONTRADICTED by PRD+addendum, with special attention to qualitative depth the FR structure silently drops (tone/voice, marketing positioning, segment nuances, aspirational features, page-level details, feel/intent statements).
- **Verdict:** functional coverage is excellent — every LIVE feature, all four journeys, all four models, custom-mode logo matching, placeholder logos, computation time, contact form, and the elevator pitch are present and accurate (vision even reuses "searchable, explainable, shareable" verbatim). All gaps are in the qualitative/marketing layer, plus one structural consequence gap ("shareable" has no requirement). 12 findings below, ranked by importance.

---

## F1. "Shareable" is a vision promise with no requirement behind it — potential contradiction

- **Source says:** elevator pitch: "turns the biggest game in basketball into a searchable, **explainable, and shareable** analytics experience"; social formats include "matchup prediction cards", "probability reveal graphics"; strengths list "visual recognizability through team logos and famous matchups".
- **Where absent/conflicting:** PRD §1 vision copies the "shareable" claim, but the only thing making sharing possible is an accident: §7 Non-Goals reduces it — "sharing means screenshots/links" — and no FR produces a shareable artifact (card, deep-link with preloaded result, OG image). SM-3 and FR-25 measure share-link visits, and addendum D lists "per-matchup shareable prediction pages published *before* a series reaches 2-2 so they index during the spike" as a *winning SEO pattern* — yet that pattern was never converted into a requirement anywhere. The addendum research identified the lever; the PRD left it unowned.
- **Recommended disposition:** ADD to PRD — a new **[PLANNED]** FR in §4.1 (shareable result deep-link / prediction-card presentation) or, at minimum, §8.1 candidate scope for the pre-playoff release, since SM-3 (>5% share-driven visits) is otherwise unvalidatable by any feature. If the owner judges screenshots sufficient, record that as an addendum G deferred decision instead of leaving the promise unsupported. **Highest-priority finding.**

## F2. Emotional/tone thesis dropped from the vision

- **Source says:** "one of the most emotionally charged situations in sports"; "Game 7 is not just entertainment. It is a moment where history, pressure, momentum, and probability collide"; the Insights framing "probability versus emotion".
- **Where absent:** PRD §1 is entirely functional/strategic (archive, models, transparency, 538 niche). §6 Brand/voice exists but is marked `[ASSUMPTION: tone inferred from existing marketing sections of APP_FUNCTIONALITY_OVERVIEW.md]` — and §11 reconfirms "brand voice inferred" — yet the inferred document's actual affective language was never carried into the baseline. The one line that comes closest ("a serious analytics tool with fan passion") is a gloss, not the source's claim.
- **Recommended disposition:** ADD a single sentence to PRD §1 (or quote the "history, pressure, momentum, probability collide" line inside §6 Brand/voice to replace the bare assumption marker). Cheap, and it converts an inferred assumption into a sourced baseline fact.

## F3. Product identity as "storytelling and discovery experience" is missing

- **Source says:** "The product is **not only a calculator**. It also works as a sports storytelling and discovery experience." "This page [Historical] supports both discovery and research behavior."
- **Where absent/conflicting:** PRD §1 frames the product as "an indie, opinionated **analytics destination**, not a betting market." The storytelling self-conception — which is what justifies Home's "product story" (FR-14) and the content surfaces — appears only as one of five *unselected* positioning options in the source. Risk: a future triage reads "analytics destination" as license to cut narrative/branding surfaces that the source treats as core identity.
- **Recommended disposition:** ADD one clause to PRD §1 ("…analytics destination that works as a sports storytelling and discovery experience") and note the discovery/research dual behavior in §4.2 description.

## F4. Five messaging themes / voice exemplars dropped entirely

- **Source says:** "Good Messaging Themes" — "Where data meets playoff drama", "Decode the biggest game in basketball", "Every Game 7 has a history", "Not just who wins, but why", "From iconic classics to hypothetical showdowns".
- **Where absent:** nowhere in PRD or addendum. FR-18 (release-quality copy) sets a *negative* standard (no mojibake, "read as intentional") with no positive voice reference; §6's "Polished, credible, explanatory" is the PRD's own invention.
- **Recommended disposition:** ADD to addendum (a short "copy voice anchors" note next to the §6 brand-voice constraint, or addendum G material). Do not put taglines in the PRD body; do let FR-18's copy pass reference them.

## F5. Sports-bettor audience segment silently demoted to "curiosity"

- **Source says:** primary audience explicitly includes "**sports bettors** and prediction-minded users".
- **Where conflicting:** PRD §2.2 lists "Punters seeking guaranteed picks, tips, or a place to wager" as non-users, and §2.1 keeps only "**Betting-adjacent curiosity** — *not yet committed*". Defensible as an owner decision, but the PRD never acknowledges it is narrowing a source-stated segment; a bettor who wants *explainable probability* (the source's framing) is arguably in scope and is now ambiguously caught by the non-user wording.
- **Recommended disposition:** ADD a clarifying half-sentence to §2.2 ("bettors seeking transparent projections remain users; those seeking guaranteed picks/wagering do not"). No new surface needed.

## F6. Three whole marketing sections (story angles, strengths, social formats) have no home

- **Source says:** "Content and Story Angles the App Naturally Supports" (8 items: Game 7 history, probability vs emotion, famous upsets and collapses, momentum and home-court debates, fan hypotheticals…), "Marketing-Relevant Product Strengths" (8 hooks: "a clear niche: Game 7 only", "built-in historical content for recurring posts", "custom mode for interactive audience participation"…), "Social Media Content Opportunities" (8 recurring formats incl. "What would the model say?" posts, anniversary posts, fan-submitted matchups).
- **Where absent:** zero coverage in PRD/addendum. FR-25 only measures channels; §4.2 description mentions SEO substance but not content operations. These are the source's stated *purpose* (it exists "to support marketing, brand strategy, content planning, and social media brainstorming"), so §0 citing it purely as a fact source drops the document's own intent.
- **Recommended disposition:** **INTENTIONALLY OMIT from the PRD body** — a requirements document is the wrong vessel for a content calendar — but ADD a compact "Content-marketing levers" subsection to the addendum consolidating the three lists, cross-referenced from FR-12 (Insights as "short-form insight language… especially useful for marketing, social content, and educational storytelling" — see F7) and SM-3. Without this, the only surviving trace of the source's purpose is lost.

## F7. Insights page's marketing role dropped

- **Source says:** Insights "translates historical data into simpler patterns and talking points"; "summary pattern cards that turn stats into readable takeaways"; "This page is especially useful for **marketing, social content, and educational storytelling** because it already surfaces short-form insight language."
- **Where absent:** FR-12 covers the three patterns and cache mechanics; §4.2 description justifies the page via "SEO substance" and "evidentiary backbone". The *shareable-takeaway* rationale (the page as a content factory, "stat-of-the-day") is gone.
- **Recommended disposition:** ADD one sentence to §4.2 description (or fold into F6's addendum subsection). Low effort; keeps the reason pattern-card wording quality matters (ties to FR-18).

## F8. Positioning treated as decided when the source treats it as open

- **Source says:** "**Depending on brand direction**, the app could be positioned as:" — five options (analytics platform / prediction engine / history archive / fan engagement and debate tool / sports storytelling product).
- **Where conflicting:** PRD §1 asserts one committed positioning (analytics destination in the post-538 transparency niche) with no note that the source left direction open, nor any record of the owner choosing. This is a reconstruction, so the choice may have been made in the 2026-09-22 conversation — but §11's confirmed list doesn't include it.
- **Recommended disposition:** either record "positioning = transparent analytics destination, chosen 2026-09-22" in §11/addendum G, or list the five source options in addendum G as considered-and-narrowed. Current state is an unlogged decision.

## F9. Page-level detail: Home's links into data surfaces (minor)

- **Source says:** Home highlights "the main prediction workflow" and "**links into historical data and insights**" alongside mission, moments, product story, contact form.
- **Where absent:** FR-14 enumerates mission, iconic-moment hotspots, featured Series deep-links, and contact — but navigation into the Historical archive and Insights pages is not in its list or testable consequences.
- **Recommended disposition:** ADD "and navigates to Historical/Insights" to FR-14's consequence line. Mechanical fix.

## F10. Team logos in prediction results (minor)

- **Source says:** prediction features include "support for **team logo display in prediction results**".
- **Where absent:** FR-5's output enumeration (winner, probabilities, factors, confidence, computation time) omits logos; they appear only as custom-mode fallback in FR-3 and as `teams.logo_url` in addendum B.
- **Recommended disposition:** ADD a consequence bullet to FR-5 (result renders canonical team identities/logos). Trivial; preserves the visual-branding consequence of FR-19 that the source explicitly flags ("team identity is a visible part of nearly every page" — matters "for both product quality and visual branding", also uncaptured).

## F11. "Modern and historical franchise coverage" (trivial)

- **Source says:** team identity support includes "modern and historical franchise coverage".
- **Where absent:** addendum B describes the `teams` schema but never states the coverage claim; FR-19 only counts 177 migrated series.
- **Recommended disposition:** ADD as a line in addendum B next to the teams entry, or intentionally omit — implied by the 177-series archive.

## F12. No contradictions found on functional facts

Spot-checks all reconcile: four methods and their Maths-page formula/title/concept treatment (FR-15), prediction modes (FR-1/2/3), full-name/nickname/abbreviation matching incl. `BOS`-style examples (FR-3), placeholder logos (FR-3), winner/probabilities/factors/confidence/computation time (FR-5), Detailed Analysis view (FR-6), deep-link preload (FR-1/FR-14), archive search/filter/expand (FR-10/11), Supabase Edge Function engine (addendum A), normalized data model (FR-19/addendum B), contact form for "questions, feedback, and future collaboration" (FR-16), and the elevator pitch (PRD §1). The PRD also *adds* live-only realities the source predates or omits (manual active-series updates, pipeline FR-20/21, issues mapping) — additive, not conflicting.

---

## Summary of dispositions

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| F1 | "Shareable" promise has no FR; SEO pattern (shareable prediction pages) never converted | High | Add PRD §4 FR (or §8.1 scope); else addendum G decision record |
| F2 | Emotional/tone thesis dropped; brand voice left as bare assumption | High | Add to PRD §1/§6 |
| F3 | Storytelling & discovery identity missing | Medium | Add clause to PRD §1 |
| F4 | Five messaging themes absent | Medium | Add to addendum (voice anchors) |
| F5 | Sports-bettor segment demoted without acknowledgment | Medium | Clarify PRD §2.2 wording |
| F6 | Story angles / marketing strengths / social formats orphaned | Medium | Intentionally omit from PRD; consolidate in addendum |
| F7 | Insights-as-content-factory rationale dropped | Low | Add to PRD §4.2 description or addendum |
| F8 | Positioning recorded as decided; source left it open | Low | Add decision record (§11) or addendum G |
| F9 | Home links to Historical/Insights not in FR-14 | Trivial | Extend FR-14 consequence |
| F10 | Logos in prediction results not in FR-5 | Trivial | Extend FR-5 consequence |
| F11 | Franchise-coverage / visual-branding rationale | Trivial | Addendum B or omit |
| F12 | Functional facts fully reconcile | — | No action |
