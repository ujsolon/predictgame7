# Sprint Change Proposal: Epic 6, "Discoverability & flagship launch" (2026-10-09)

Status: **approved by the owner 2026-10-09** (batch mode) and applied the same day.

## 1. Issue summary

**Trigger:** the Epic 4 pre-retro triage. That was a party-mode session on 2026-10-09 in which the owner decided every item. The record is `_bmad-output/implementation-artifacts/epic-4-retro-inputs.md` §§ 0, 0a and the orphan sweep. It followed Story 4.7's production drill, which closed 2026-10-09 with all seven ACs met (`epic-4-verification-results.md`).

**Problem (strategic re-plan, plus new requirements from the owner).** The work left after Epic 4 is no longer a tail of Epic 4. It is a new body of work:
- **Readable series URLs**, an owner decision.
- **Entry points into the series pages.** 173 of 183 pages have no in-app link (retro inputs § 3a).
- **A designed Home.** The 4.5 empty state was pulled the day it shipped (`2386b09`). Home's LCP is ~13.3 s on Slow 4G, from ~4.9 MB of background images (measured 2026-10-09).
- **The flagship content launch** (Story 4.6).

It all carries the hard date of **live by about Feb 4–18, 2027**, 6–8 weeks before the Apr 1 Traffic Gate window. Keeping 4.6 and 4.9 inside Epic 4 leaves Epic 4 permanently "in progress" behind work it was never scoped to hold.

**Evidence:**
- `epic-4-retro-inputs.md` § 0a: the owner decisions and the measured Home weight.
- `sprint-status.yaml`: 4-6 and 4-9 in `backlog`; everything else in Epic 4 `done`.
- `epic-4-verification-results.md`: Epic 4's ACs met in production.

## 2. Impact analysis (checklist summary)

| Checklist item | Status | Finding |
|---|---|---|
| 1.1 Trigger | [x] | The Epic 4 pre-retro triage and Story 4.7's close |
| 1.2 Problem type | [x] | Strategic re-plan, plus new owner requirements (readable URLs, entry points, Home redesign) |
| 1.3 Evidence | [x] | Above |
| 2.1 Current epic | [x] | Epic 4 completes without 4.6 and 4.9: every other story is `done` and 4.7's ACs are met |
| 2.2 Epic-level change | [x] | **Add Epic 6.** Move 4.6 and 4.9 into it, renumbered |
| 2.3 Future epics | [!] | Epic 5: Story 5.2 cites "flagship content pages (Story 4.6)"; 5.4 cites "Epics 1–4 verified". Epic 3: no conflict (3.4 reads SM-3 attribution, already live) |
| 2.4 Obsolete or new epics | [x] | One new epic; none obsolete |
| 2.5 Order | [x] | **Epic 4 → Epic 6 → Epic 3 → Epic 5.** Epic 6 runs before 3 and 5 because of the Feb date |
| 3.1 PRD | [x] N/A | No FR changes. FR-13 and FR-31 are unchanged in substance; only the epic that delivers part of them moves |
| 3.2 Architecture | [!] | AD-6/AD-7 name the route shape `/series/<id>`. Readable URLs amend it; the amendment note is below, and the slug rules are decided in Story 6.1's spec. AD-8 is unchanged (content stays hybrid A) |
| 3.3 UX | [!] | EXPERIENCE.md's Home empty-state row was withdrawn on 2026-10-08. A pointer note is added now; Story 6.3's design session replaces it |
| 3.4 Other artifacts | [x] | Sprint status (keys moved, Epic 6 block). `epic-4-context.md` keeps its record; Epic 6 gets its own context when its first story builds. No CI or deploy change |

**Out of scope here:** the **docs-truth commit** (AGENTS.md coverage notes, the PRD addendum §A.1 pointer for `prediction_shared`, the `share-og` wording). It happens in the Epic 4 retro window under the owner's standing rule (one batched commit, diff shown first), not in Epic 6. The retro carries it as an action item.

## 3. Recommended approach

**Direct adjustment: add an epic and move stories.** No rollback (Epic 4's shipped work stands) and no MVP reduction (the Feb scope is unchanged, only re-homed).
- **Effort:** medium. Six build stories and one verification story; one owner authoring stream (6.5).
- **Risk:** medium. The date is the risk. The owner's authoring time for five flagships is the long pole, and URL changes must land early, before the cache-warming window.
- **Timeline impact:** none on the Feb date. Epic 3 and Epic 5 start after Epic 6.

## 4. Detailed change proposals

### 4.1 `epics.md` — Epic List (line 152)

OLD:
> Execution order (owner decision 2026-10-07, `sprint-change-proposal-2026-10-07.md`): Epic 4 runs before Epic 3; numbering is unchanged. Within Epic 4 the order is 4.0 → 4.1 → 4.2 → 4.3 → **4.8** → 4.4 → 4.5 → 4.6 → 4.7 (`sprint-change-proposal-2026-10-07-d.md`).

NEW:
> Execution order (owner decisions 2026-10-07 and 2026-10-09): **Epic 4 → Epic 6 → Epic 3 → Epic 5**, numbering unchanged (`sprint-change-proposal-2026-10-07.md`, `sprint-change-proposal-2026-10-09.md`). Within Epic 4 the order was 4.0 → 4.1 → 4.2 → 4.3 → **4.8** → 4.4 → 4.5 → 4.7. Stories 4.6 and 4.9 moved to Epic 6 as 6.5 and 6.3/6.4. Within Epic 6 the order is 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7.

Plus a new Epic List entry after Epic 5's:

> ### Epic 6: Discoverability & flagship launch
> Every series page is reachable, readable and shareable by a human-friendly URL, Home is designed and fast, and the five flagship series launch with real editorial content, **all live by about Feb 4–18, 2027** (6–8 weeks before the Traffic Gate window). Created 2026-10-09 (`sprint-change-proposal-2026-10-09.md`) from the Epic 4 pre-retro triage. It takes over Stories 4.6 and 4.9. Runs after Epic 4 and before Epics 3 and 5.
> **FRs covered:** FR-13 (scoped pilot: content load), FR-31 and CAP-8 (readable URLs, entry points), FR-14 (Home); NFRs A1/U1 (new surfaces), P1 (Home weight).

### 4.2 `epics.md` — Epic 4 List entry and section intro

- Epic List entry, Epic 4 **FRs covered** line: `FR-13 (scoped pilot)` becomes `FR-13 (scoped pilot: content model; content load moved to Epic 6)`.
- `## Epic 4` intro: append "*2026-10-09: Stories 4.6 and 4.9 moved to Epic 6 (`sprint-change-proposal-2026-10-09.md`); Epic 4 closes with 4.0–4.5, 4.7, 4.8.*"
- The **Story 4.6 and 4.9 sections** stay in place as stubs (provenance, as with 3.1→4.0). Each heading gets "→ moved to Epic 6 (Story 6.5 / Stories 6.3–6.4)". Its body is replaced by a one-line pointer. The full ACs move to the new stories.

### 4.3 `epics.md` — FR coverage map (line 124)

OLD: `- FR-13: Epic 4 — flagship-five content pilot (editorial content model + content load on prerendered pages; two-page spoiler-free structure, featured/active only)`

NEW: `- FR-13: Epic 4 — editorial content model + two-page spoiler-free structure (Story 4.5); Epic 6 — flagship-five content load (Story 6.5)`

### 4.4 `epics.md` — new `## Epic 6` section (inserted before `## Epic 5`)

> ## Epic 6: Discoverability & flagship launch — every series page reachable, Home designed, flagships live
>
> Created 2026-10-09 (`sprint-change-proposal-2026-10-09.md`) from the Epic 4 pre-retro triage (`../implementation-artifacts/epic-4-retro-inputs.md` § 0a; owner decisions are not re-decided here). **Calendar-critical: live by about Feb 4–18, 2027.** Order matters inside the window: URL changes (6.1) land first, so shared links, OG caches and the Search Console index settle on final URLs, and content (6.5) lands last, onto final pages. Content storage stays hybrid (A): text and YouTube ids in `series_content`, images in `public/editorial/`. Contributor authoring is parked; if it is ever wanted, the migration is files-as-CMS (B).
>
> ### Story 6.1: Readable series URLs
> As a reader who sees a series link in search or chat, I want `/series/<year>/<slug>` URLs, so that the link says what it is.
> **Given** the prerender pipeline (4.8), **When** the build emits series pages, **Then**:
> - each series' canonical URL is `/series/<year>/<slug>/`. The slug uses the spoiler-neutral team order (`src/lib/spoiler-neutral.ts`) and is unique per year; the exact slug rules are decided in this story's spec;
> - the old `/series/<id>/` (and `/result/`) pages are still emitted, as **canonical stubs** pointing at the slug URL, so every shared or indexed uuid link keeps working and never goes stale on additive `gh-pages` publishes;
> - `/series/` and `/series/<year>/` are static stubs that redirect without JS to `/historical` and `/historical?year=<year>`, and Historical reads `?year=`;
> - `og:url`, canonical, the sitemap and the Share URL builders (4.4) use the slug URL;
> - `og:image:alt` (and `twitter:image:alt`) name the matchup and never the winner;
> - **first task:** pin the missing tests before the refactor: analytics init and barrel purity (4.0 deferrals), the `?custom=` supersession and the Predict preload race (4.4 deferrals), and the `?series=` else-branch (4.1 deferral);
> - AD-6/AD-7 get an amendment note, and the probe and the analytics walk pass live.
>
> ### Story 6.2: Series-page entry points
> As a fan in the app, I want a way into every series page, so that the 183 pages are not orphans.
> **Given** the readable URLs (6.1), **When** a reader opens a series in Historical's record overlay or has a series selected on Predict, **Then** a "Series page" link leads to its page (every series, not only flagships). Historical's filter-reset button gets an accessible name and a ≥44×44 target. AA, responsive.
>
> ### Story 6.3: Home design session (from Story 4.9)
> As the owner, I want Home designed before any Home code ships again.
> **Given** a `bmad-ux` session (or party mode with the UX designer) **When** it closes, **Then** a mockup under `ux-designs/…/mockups/` shows Home at desktop and mobile with **simulated active series** (one, several, none), the **flagship featured cards** (taken over from 4.6), and the entry points. The session decides and records in DESIGN.md / EXPERIENCE.md:
> - what Home shows when nothing is pending (replacing the withdrawn row);
> - Home's **image budget** (today ~4.9 MB of backgrounds, LCP ~13.3 s);
> - self-hosting the third-party font (`resource-static.bj.bcebos.com`);
> - the favicon path (requested at the domain root);
> - Home and app-shell `<title>`/meta/OG (4.1 and 4.8 deferrals).
>
> The stale OG mockup (`key-og-card.html`, "3 variants") is corrected in the same session.
>
> ### Story 6.4: Home build (from Story 4.9)
> As a visitor, I want a Home that loads fast and shows live and flagship Game 7s well.
> **Given** the approved 6.3 mockup, **When** Home is built, **Then**:
> - the pending card and the flagship cards match it;
> - Home's images meet the budget, the font is self-hosted, and the favicon resolves under `/predictgame7/`;
> - Home has its title and meta;
> - there is no layout shift on load;
> - AA and responsive;
> - it is verified headlessly with a synthetic pending series, and Home LCP is re-measured under the same Slow 4G and 4× CPU profile.
>
> ### Story 6.5: Flagship five content load (from Story 4.6)
> As the owner, I want the five flagship pairs live with real content, so that the pilot's SEO and share test runs on pages worth sharing.
> **Given** Stories 6.1–6.4 deployed, **When** the owner authors both halves (before and resolution) for 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers and 2026 Thunder–Spurs, **Then**:
> - a small owner-side loader (in `supabase/scripts/` or owner-local) writes `series_content` and sets `updated_at` on every write;
> - every editorial image is **openly licensed with a credit line**; the build refuses a missing credit (as it refuses missing alt text) and resizes to WebP via `sharp`;
> - all five pairs show their content live: the preview spoiler-free, the result with at least one video;
> - a sample of non-flagship pages is verified unchanged;
> - it is **live by about Feb 4–18, 2027**.
>
> ### Story 6.6: Bundle trim
> As a phone visitor, I want the app to download only what a page needs. **Given** the 2026-10-09 measurement (JS 308 KB, about 2.4 s on Slow 4G, about 0.4 s of it from 4.5's markdown renderer), **When** it is re-measured after 6.4, **Then** the owner decides whether to code-split the series routes or swap to a smaller renderer. A trim keeps the prerender's synchronous SSR intact (AD-7 no-JS content).
>
> ### Story 6.7: Epic verification in production
> As the owner, I want Epic 6 proven live before the window. **Given** 6.1–6.6 deployed, **Then** the following are recorded with dates:
> - a cold GET on a slug URL and on an old uuid link (landing via its stub);
> - the OG debugger on a slug URL;
> - JS-disabled fetches of a flagship preview (spoiler-free, with content) and its result;
> - `probe-deep-links.mjs` and `probe-analytics-walk.mjs` GREEN live;
> - a sitemap spot-check, plus the Search Console status and indexed count;
> - Home LCP re-measured;
> - the deploy date against Feb 4–18, 2027, with an escalation if slipping.

### 4.5 `epics.md` — Epic 5 references

- Story 5.2, OLD: "flagship content pages (Story 4.6) pass with video embeds included". NEW: "flagship content pages (Story 6.5) pass with video embeds included".
- Story 5.4, OLD: "Epics 1–4 verified". NEW: "Epics 1–4 and 6 verified".

### 4.6 `sprint-status.yaml`

- Remove `4-6-flagship-five-content-load` and `4-9-home-pending-game-7-highlight-redesign` from the Epic 4 block, with a dated comment pointing to Epic 6. Remove the now-superseded "remaining order" comments.
- Add an `epic-6: backlog` block between Epic 4 and Epic 3: keys `6-1-readable-series-urls`, `6-2-series-page-entry-points`, `6-3-home-design-session`, `6-4-home-build`, `6-5-flagship-five-content-load`, `6-6-bundle-trim`, `6-7-epic-verification-in-production`, and `epic-6-retrospective: optional`.

### 4.7 `ARCHITECTURE-SPINE.md` — AD-6 and AD-7 amendment notes (append, no rewrite)

> *Amended 2026-10-09 (`sprint-change-proposal-2026-10-09.md`): series pages gain readable canonical URLs `/series/<year>/<slug>/` (Story 6.1). `/series/<id>/` stays emitted as a canonical stub, so share links and indexed URLs never break; the slug rules are fixed in Story 6.1's spec. Content storage (AD-8) is unchanged.*

### 4.8 `EXPERIENCE.md` — Home empty-state row (pointer, no redesign)

Append to the "Empty Active list | Home / Historical" row: "*Home part withdrawn 2026-10-08 (owner): Home shows nothing when nothing is pending, until Story 6.3's design session decides; Historical unchanged.*"

## 5. Implementation handoff

- **Scope: moderate** (backlog reorganisation, one new epic, no replan of goals).
- **Applied by:** the developer agent in this session on approval, as one commit: `epics.md`, `sprint-status.yaml`, `ARCHITECTURE-SPINE.md` notes, the EXPERIENCE.md pointer, and this proposal.
- **Then:** the Epic 4 retro (`bmad-retrospective`). With Epic 4's stories all `done`, it judges the epic on its own criteria and carries the docs-truth commit as an action item. After that, Epic 6 starts at Story 6.1 via `bmad-build`. An Epic 6 context is compiled on its first build.
- **Success criteria:**
  - Epic 4 shows all stories `done`;
  - Epic 6 exists in `epics.md` and `sprint-status.yaml` with seven stories in the stated order;
  - Epic 5's two references point at Epic 6;
  - no PRD edit.
