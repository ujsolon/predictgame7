# Sprint Change Proposal — `series.status` becomes derivation (2026-09-29)

Trigger: owner decision recorded in `_bmad-output/brainstorming/brainstorm-series-status-semantics-2026-09-29/brainstorm-intent.md` (commit `27580b6`), reached in a facilitator-mode brainstorm off Story 1.5's QA matrix §6.5 / F9.
Scope of this document: **planning artifacts only.** No code, no migration, no deploy authorized here.
**Status 2026-09-29: approved by the owner and the §4.1–§4.11 artifact edits are applied** (spine AD-4/AD-5/AD-7 + AD-9 + its tree comment, addendum §B and §E, `AGENTS.md`, `epics.md` AD summaries/Epic 2 list/Stories 2.1–2.3, 2.5, 2.7, 4.3, PRD FR-19 + the FR-26 block, `CURRENT_DATA_MODEL.md` note, `qa-matrix-1-5.md` §2.2/§6.5/F9, `deferred-work.md` F9 + the round-vocabulary entry, `sprint-status.yaml` Story 2.2 slug, and a supersession marker in the 2026-09-25 proposal).
**Owner closed the four open calls the same day:** §4.2(a) **drop** `status` + `chk_series_status` + its default; §4.2(b) **pipeline assertion + defensive read, no trigger**; §4.9 **split as recommended** (data assertion in 2.7, visual treatment in 4.5); `CurrentGame7sPage.tsx` **deleted** (gate green). §4.10's archive audit is **deferred, not dropped** — it is an AC of Story 2.1. **Nothing in this proposal is blocked on the owner any more**, and §5's "do not implement" bar is lifted for implementation work; the one standing caveat is that the derivation's no-false-positive-on-history claim stays unmeasured until 2.1 runs.
Supersedes: `sprint-change-proposal-2026-09-25.md` §"AD-4 / series.status" line only (see §2.4 — the spoiler-split decisions in that proposal stand).

---

## 1. Issue summary

**What triggered it.** Story 1.5's manual QA matrix could not exercise four client branches because **no series row has ever been anything but `status: 'historical'`** — 178/178 live rows (owner-asserted 2026-09-28). The cell was reframed by the owner: the dead branches are symptoms of an **unfinished merge**, not a missing test seed. `series` was formerly two tables (`series_historical`, `series_active`), deliberately collapsed into one row set with a `status` column, and **the merge was never cascaded through the client**.

**The core problem, typed.** *Misunderstanding of the original requirements* plus *failed approach requiring a different solution*: `status` was kept as the carrier of a distinction the data already makes better. Three documents answer the same question three ways:

| Source | What it says a series' phase is |
|---|---|
| Deployed schema (`00005_release_1_data_model.sql:33,36`) | `'historical'` default, CHECK permits `historical/active/completed`; only `'historical'` ever written |
| AD-4 (`ARCHITECTURE-SPINE.md:78-82`, adopted 2026-09-23) | two values, `active` = **from tip-off**, row exists only once active |
| The owner's intent (2026-09-29) | `active` = **exactly six games played, Game 7 still to come** |

Those are three different row sets, and `types.ts:34` unions all of them while `HistoricalPage.tsx:40` and the unrouted `CurrentGame7sPage.tsx:29` each pick a different one.

**The decision.** Phase is **derived, not stored**:

- A `series` row is created by the pipeline **only when a Game 7 is officially pending** — certified 3–3 — born **in one transaction** with its six `series_game_scores` rows and `winner_team_id NULL`. Nothing is recorded about a series at 0–0 through 3–2.
- `winner_team_id IS NULL` ⟺ Game 7 pending. `IS NOT NULL` ⟺ archive. The Game 7 result appends score row 7 and fills the winner, atomically.
- `status` is the redundant remnant; **no code path reads it for truth**.
- Game dates are **write-side scheduler metadata** — `game_date` may be added later for marketing automation, and *the app never branches on a date*. Never read `created_at` as a game date; there is no game-date column in the schema today (verified across all migrations).

**Evidence that this is a repair, not a preference.** The old two-table concept survives as a client union (`PredictPage.tsx:22`), one of three type-union members (`'completed'`) matches **no row and no comparison site** in the repo, and `PredictPage.tsx:133-136` fetches every row unfiltered so the client filters — meaning the column was already decorative on the hot path.

---

## 2. Impact analysis

### 2.1 Epic impact

**Epic 2 shrinks, it does not grow.** Story **2.2** loses two of its three deliverables (the `('active','completed')` CHECK and the `'historical'→'completed'` backfill) and gains a different job: uniqueness guards + making the read path the single source of truth. Stories **2.3, 2.5, 2.7** need AC rewording because they speak of status *transitions* that no longer exist. Epic 2 still completes; its calendar-critical purpose (drilled automation before the Apr–Jun 2027 window) is unchanged and **less** exposed, because derivation removes the archive-dark window AD-4 was written to avoid.

**Epic 1 is untouched** — it shipped no pipeline, and the four unexercised branches (§6.5) become 2.7's verification targets rather than 1.5's debt.

**Epic 4/5 surfaces.** The Home highlight the owner described (card for a pending Game 7 → its page → simulate deep-links) is a **read-path feature with no owner today**: the picker group is Story 2.2/2.7 territory, the per-series preview/result pair is 4.3/4.5 (UX-DR-2), and `EXPERIENCE.md:112` already writes the empty-state copy for Home. Proposal §4.9 places it.

### 2.2 Artifact conflicts

- **AD-4** — reversed on its birth trigger; its migration plan (drop/replace CHECK, remove default, backfill, same-release frontend flip) is mostly **deleted as work**. Must be rewritten, not annotated.
- **AD-5** — "status writes follow AD-4" is now wrong: there are no status writes. AD-5's `UNIQUE (year, round)` prerequisite also **collides with an existing index**: `00007_backfill_missing_historical_series.sql:42` created `ON series (year, round, team_a_id, team_b_id, status)` and used it as an `ON CONFLICT` target (`:57`). Adding `UNIQUE (year, round)` must decide what happens to that index — and if `status` is dropped, the index **cannot survive it** (an index over a dropped column is a migration error).
- **AD-7** — "route set decided per series **from DB flags** at build time" — the flag is now a derived predicate. Wording change only; the spoiler-pair behavior (2026-09-25) is unaffected.
- **addendum §B** (`addendum.md:43`) — records "`status` value domain is **undefined in every doc** — pipeline design must fix it". That assignment is now discharged; the line must be replaced with the resolution and a pointer, or the next agent will re-open it.
- **AGENTS.md** — the standing guardrail "`series.status` has no defined value domain yet (addendum §B) — don't build on it until pipeline work fixes the enumeration" becomes actively misleading. Needs a durable replacement rule (this is a permanent instruction file, not a task note).
- **UX** — `EXPERIENCE.md:112` and the empty-state copy are **already correct** under derivation ("No active series right now — the next Game 7 is coming"). No UX text change. One addition: the preview page's release-window behavior (§4.8) is UX, not schema.
- **`docs/CURRENT_DATA_MODEL.md:26`** — lists `status` as a stored series column. It stays true until a migration lands, so it is updated **in the same commit as that migration** (AD-4's own rule), not now.

### 2.3 Technical impact

- **Zero Edge Function impact**: `supabase/functions/predict-game-7/index.ts` reads no `series.status` — its only table read is `.from('teams')`. No redeploy of the function is implied by any of this.
- **Client changes are predicate swaps, not new capability**: `HistoricalPage.tsx:40`, the three `status === 'active'` derivations in `PredictPage.tsx` (`:167`, `:396`, `:408`), the render guard `:712-717`, the label branch `:778`, and the union at `types.ts:34`. The derivation costs **no extra query** — `SERIES_SELECT` already fetches `series_game_scores(*)` (`PredictPage.tsx:43`).
- **One user-visible site the brainstorm missed**: `HistoricalPage.tsx:310-311` renders the raw `status` string under a "Series Status" heading — today it prints "historical" to every visitor. Under derivation it renders a computed label or disappears. Either way it is a UI decision, not a refactor detail.
- **Dead code with a live hazard**: `CurrentGame7sPage.tsx` is absent from `routes.tsx` and imported nowhere (verified), yet still contains the only `.eq('status','active')` read in the client — the exact branch that would resurrect a stored-status assumption.
- **Pre-existing pipeline break, now load-bearing**: `supabase/scripts/load-games/main.py:60` writes to `game_sevens`, archived to the `archive` schema by `00013_archive_legacy_tables.sql:14-16`. It was harmless while nothing ran it; under "row birth is the pipeline's job" it is the precedent the `manual_csv` floor adapter descends from, so it must be fixed or formally retired in Story 2.3.
- **Analytics**: `series_source` is an event **property**, not one of §A.1's ten preserved **names** — no name-freeze blocks it. The property stays (FR-25's custom-vs-archive funnel split needs it); its value comes from the same derivation. Cost: one owner-local PostHog query touch. `'current'` has never been emitted, so there is no baseline to lose.

### 2.4 What does **not** change

The 2026-09-25 proposal ruled (line 27): *"AD-4 / `series.status`: untouched — 3–3/4–3 is a view-level editorial device for concluded series … not a data state."* **That clause is now false** and must be marked superseded — 3–3 becomes the row's birth condition. Everything else in that proposal (AD-7 amendment, UX-DR-2, the preview/result pair, OG chips, 172-vs-5 pairing scope) survives untouched.

---

## 3. Recommended approach

**Path: Option 1 — Direct Adjustment.** Rewrite AD-4/AD-5/AD-7 wording, discharge addendum §B, replace the AGENTS.md guardrail, and re-scope Stories 2.2/2.3/2.5/2.7 in place. No new epic, no resequencing.

- **Option 2 (rollback) — not viable.** Epic 1 shipped no pipeline and no `active` row has ever existed, so there is nothing to revert *to*. Rolling back the 2026-09-25 spoiler work would destroy the one part of the design this decision depends on.
- **Option 3 (MVP review) — not viable, and the change actually protects the MVP.** FR-2/FR-10/FR-11/FR-20/FR-21 are all still met. Scope *decreases*: 2.2 loses a migration + a backfill + a frontend status flip. The Traffic Gate (SM-1, Apr–Jun 2027) is unaffected, and the "stale Active list invalidates the measurement" risk shrinks, because a derived predicate cannot go stale relative to the data it derives from.

**Effort: Low–Moderate.** Document work is mechanical; the code work is smaller than what 2.2 planned. **Risk: concentrated in one place** — the un-measured premise (§4.10) and the index collision (§4.3).

**Risk note on release timing.** Derivation dodges AD-4's archive-dark window (the flip is a predicate change over unchanged data), but it inherits the same release-coupling discipline: if a schema change and the read-path flip ship apart, rows written under the old convention derive as **nothing at all** and vanish from both picker groups. Anything landing during a playoff window must be read-path-only and additive.

---

## 4. Detailed change proposals

### 4.1 `ARCHITECTURE-SPINE.md` AD-4 — replace wholesale

**OLD** (`:78-82`): heading `AD-4 — series.status domain [ADOPTED — owner decision 2026-09-23: two values only]`; Rule = `status text NOT NULL CHECK (status IN ('active','completed'))`, row exists only once active (created at tip-off), Active = `status='active'`, Archive = `status='completed'`, only pipeline scripts and migrations write `status`, plus the four-step migration plan and its same-release sequencing.

**NEW:**

> ### AD-4 — Series phase is derived, not stored  `[ADOPTED — owner decision 2026-09-29; supersedes the 2026-09-23 two-value decision and reverses its birth trigger]`
> - **Binds:** `series` table, FR-2/FR-10/FR-11/FR-21 acceptance, pipeline writes, archive UI, `docs/CURRENT_DATA_MODEL.md`
> - **Prevents:** a stored flag disagreeing with the scores it describes (the failure mode that left 178/178 rows on one value and four client branches un-exercised), and every consumer inventing its own Active-vs-Historical test
> - **Rule:**
>   - A `series` row is created **only when a Game 7 is officially pending** — the series is **certified 3–3** after six completed, final games. "Looks safe" is never a trigger; a 3–0 lead with a minute left is not final.
>   - Birth is atomic: the row and its six `series_game_scores` rows land in one write, with `winner_team_id NULL`. On the certified Game 7, the pipeline appends game 7 **and** fills `winner_team_id` in one write.
>   - Phase is derived: **`winner_team_id IS NULL` ⟺ Game 7 pending** (the only "Active" set the app has); **`IS NOT NULL` ⟺ historical/archive**. There is no status transition, so no story owns one.
>   - `status` and `chk_series_status` are **vestigial** remnants of the un-cascaded `series_historical`/`series_active` merge. No read path branches on them. Disposition is per §4.2.
>   - **No app code may derive phase from time.** `game_date` (if added) is write-side metadata for the owner's scheduler and marketing automation only. `created_at` is a pipeline write timestamp and must never be read as a game date.
>   - **Publication fitness is not data state.** The bare-page-then-populated release pattern (~24 h pre-game, ~72 h post-game) is a deploy/prerender concern. It reopens as a schema question **only if a row can ever be created before its content is ready** — which this AD forbids.
>   - Ship any schema change and the read-path flip in the **same release**, **outside a playoff window**, with `docs/CURRENT_DATA_MODEL.md` in the same commit (inherited from the prior decision; the reason changed, the discipline did not).

### 4.2 AD-4 open item — the owner picks one, in writing — **RESOLVED 2026-09-29: drop the column; pipeline assertion + defensive read**

**The column:** (a) **drop `status` + `chk_series_status`** in the same migration as `UNIQUE (year, round)` — cleanest, forces the index fix, and removes a value that would otherwise keep defaulting new pending rows to `'historical'`; (b) **leave it as a documented vestige** — zero migration risk, but a lying column stays in the schema doc and in `types.ts`. *Recommendation: (a), folded into the migration 2.2 already has to open.* Do **not** pick "keep it as a cache mirroring the derivation" — that reintroduces the second writer that caused this.
> **Owner verdict: (a) drop.** The column, `chk_series_status`, and the `DEFAULT 'historical'` all go in Story 2.2's migration, which also drops the `00007:42` index.

**The invariant** (that a winner cannot exist without seven decided games, and that a null winner without a pending Game 7 is an anomaly): (i) **DB trigger** enforcing `winner_team_id IS NOT NULL ⟺ COUNT(score rows) = 7` — real enforcement, and note a plain CHECK **cannot** reference another table, so this is a trigger, not a constraint; (ii) **verified read path** — the app derives defensively and a series that doesn't reconcile is excluded from both sets and reported loudly; (iii) **pipeline convention only** — the writer asserts before commit and exits non-zero (SM-4 already requires a loud failure). *Recommendation: (iii) as the guarantee plus (ii) as the safety net; (i) only if a real drift is ever observed.* A promise about a script is not a property of the database, and this is the one hole the brainstorm left open.
> **Owner verdict: the recommendation — (iii) + (ii), no trigger.** Story 2.3's runner asserts before commit and exits non-zero; Story 2.2's helper excludes and reports a non-reconciling series. **Named consequence of this pick:** the invariant is not a property of the database, so any future writer that bypasses the runner can break it silently — the read path is what keeps that from reaching a user. Reopens as a trigger only if a real drift is ever observed.

### 4.3 `ARCHITECTURE-SPINE.md` AD-5 — two edits

- **OLD:** "…adapters … Game scores upsert on `(series, game_number)`; **status writes follow AD-4**."
  **NEW:** "…Game scores upsert on `(series, game_number)`; **row creation and winner completion follow AD-4 — no step writes `status`**. A run that finds a certified 3–3 inserts the series row and its six score rows in one transaction; a run that finds a certified Game 7 appends game 7 and fills `winner_team_id` in one transaction."
- **OLD:** "`(year, round)` only becomes a real key when a prerequisite migration adds `UNIQUE (year, round)` on `series`…"
  **NEW:** same, **plus**: "…and drops the `00007_backfill_missing_historical_series.sql:42` index over `(year, round, team_a_id, team_b_id, status)` — which is also an `ON CONFLICT` target at `:57` and cannot survive the removal of `status` (see AD-4 §4.2)."

### 4.4 AD-7 — one phrase

**OLD:** "route set decided per series **from DB flags** at build time".
**NEW:** "route set decided per series **from the derived phase** (`winner_team_id` nullity + score-row count) at build time". Preview = pending Game 7 / facts through Game 6; result = winner filled. Behavior unchanged.

### 4.5 `addendum.md` §B — discharge the assignment

**OLD** (`:43`): "**The `status` value domain is undefined in every doc** — the pipeline design (FR-20/21) must fix the status enumeration and the Active-vs-Historical distinction rule; FR-2/FR-11/FR-21 acceptance criteria depend on it."
**NEW:** "`series.status` is **vestigial** — the 2026-09-29 decision (AD-4 as amended) derives phase from `winner_team_id` nullity plus `series_game_scores` instead of storing it, so no enumeration is needed; the Active-vs-Historical distinction rule is `winner_team_id IS NULL`. Column disposition and the integrity-enforcement choice are recorded in AD-4 §4.2. FR-2/FR-10/FR-11/FR-21 acceptance read the derivation."

### 4.6 `AGENTS.md` — replace the guardrail (durable rule, not task state)

**OLD:** "`series.status` has no defined value domain yet (addendum §B) — don't build on it until pipeline work fixes the enumeration."
**NEW:** "A series' phase is **derived, never stored**: `winner_team_id IS NULL` means Game 7 pending, `IS NOT NULL` means archive (AD-4, 2026-09-29). Do not branch on `series.status` in new code — it is a vestigial remnant of the un-cascaded two-table merge. Do not derive phase from dates or `created_at`."

### 4.7 `epics.md` Story 2.2 — re-scope (title, intent, AC)

**OLD** (`:269-282`): "Schema prerequisites — status domain + uniqueness guards"; migration lands `('active','completed')` CHECK; AC: rejected out-of-CHECK values, **same-release frontend status flip with "Historical unchanged"**, docs same commit, "all 177 historical series still reconcile … empty Active set shows an empty non-breaking Active list".
**NEW:** "Story 2.2: Schema prerequisites + derived phase on the read path".
- AC: `UNIQUE (year, round)` + `round` CHECK enforced; the `00007` five-column index dropped; `status` + `chk_series_status` handled per AD-4 §4.2(a); duplicate-key and bad-`round` inserts rejected by the DB.
- AC: **every client branch that read `status` now reads the derivation** — `HistoricalPage.tsx:40` → `.not('winner_team_id','is',null)`; `PredictPage.tsx:167/:396/:408` and the `:712-717` guard and `:778` label → one shared helper over score rows + winner; `types.ts:34` loses `'historical'|'active'|'completed'` and `'completed'` dies with it.
- AC: `HistoricalPage.tsx:310-311`'s "Series Status" readout decided — derived label or removed (user-visible).
- AC: `docs/CURRENT_DATA_MODEL.md` updated in the same commit; archive still reconciles (FR-19) **with the count re-measured first** (§4.10); with nothing pending, the picker shows an empty non-breaking Active group (FR-2) and `EXPERIENCE.md:112`'s copy renders.
- AC: `npm run gate` green, and the derivation helper unit-tested against fixture rows (six-and-null, seven-and-set, six-and-set as the anomaly).
- **Deleted as work items:** the `('active','completed')` CHECK, the `'historical'→'completed'` backfill, the status-domain frontend flip.
- **PRD note:** `epics.md:52,282,354,476` say 177; the live measure is 178; AD-7 says 172+5. Pick one, after §4.10.

### 4.8 `epics.md` Story 2.3 + 2.5 — transition language

- **2.3** AC add: "the runner implements AD-4's atomic birth (`certified 3-3 → series + 6 score rows, winner NULL`) and completion (`game 7 appended + winner filled, one transaction`); **it never writes `status`**; a row it would create with content not yet ready is a bug, not a state." Also folds in leftover (f): `main.py:60`'s writes to the archived `game_sevens` table must be fixed or the script formally retired here.
- **2.5** AC **OLD**: "the pipeline runner completes an offseason run or **marks any series 'active'→'completed'** during an inseason run" → **NEW**: "…or **fills `winner_team_id`** on a series (Game 7 certified) during an inseason run". Trigger changes, refresh logic and FR-12 outputs unchanged.

### 4.9 `epics.md` Story 2.7 + the Home surface

- **2.7** AC: "Active Series render distinctly from Historical (FR-2)" → verified **through the derivation**, and add the `qa-matrix-1-5.md §6.5` re-score: option **(c)** (CDP response override) now fakes **six score rows + null winner** rather than a flag — a shape the server would actually accept — and option (a)'s warning stands (the picker query is unfiltered, `PredictPage.tsx:133-136`, so a seeded row is live to every visitor the moment it exists).
- **New AC to place, and it needs the owner's choice — RESOLVED 2026-09-29: split as recommended.** The pending-Game-7 **Home highlight** (card → the series' preview page → simulate deep-links) has **no owning story**. It is a div, not a route (owner ruling, `CurrentGame7sPage.tsx` deleted). Options: fold into 2.7 as a render target, or into Epic 4's active-series surface work (4.3/4.5, UX-DR-2). *Recommendation: data-side assertion in 2.7, visual treatment in 4.5.* → **adopted**: 2.7 asserts the data reach, and an AC was added to **Story 4.5** owning the rendering, copy, NFR-A1 and NFR-U1 of the Home div.
- **Delete `CurrentGame7sPage.tsx` — AUTHORIZED AND DONE 2026-09-29.** Verified unrouted and unimported (referenced only by its own definition); it was the last `.eq('status','active')` in the repo. `git rm` + `npm run gate` green (116 tests / 11 files, build keeps the `/predictgame7/` prefix). AD-9's dead-module note records it.

### 4.10 Evidence that must exist before 2.2 is built — **DEFERRED by the owner 2026-09-29; still owned by Story 2.1**

The whole archive half of this decision rests on a premise the owner **asserted but nobody measured**: that all 178 rows have seven score rows and a non-null winner. If any row is short a game, a derived "Game 7 pending" predicate promotes a decades-old series into the live highlight. Required: one read-only count — `series` left to `series_game_scores` grouped by series, plus rows with `winner_team_id IS NULL`. Lands in **Story 2.1** (the spike already reads both tables) and it also settles the 177/178/172+5 doc discrepancy. Until it runs, §4.2's recommendation to drop the column is safe, but "derivation cannot false-positive on history" is a hope.

> **Owner call 2026-09-29: defer.** It is not dropped — it is now an acceptance criterion of **Story 2.1**, so it gets measured when that story runs, and Story 2.2's AC says plainly that if 2.2 is built first the derivation ships on an unmeasured history premise. Dropping the column is unaffected by the deferral (§4.2(a) stands on its own); what stays unproven is only the *no-false-positive-on-history* claim, and the three-way count discrepancy stays open. Where it lands if the audit finds a short series: Story 2.2's defensive read already excludes and reports a non-reconciling row, so the fix is a data correction in the pipeline, not a schema change.

### 4.11 Out of scope — surfaced by the brainstorm, filed with an owner

- **"What happened versus what was predicted" memorabilia** needs the user's own prediction stored against the series — a `predictions` **read/write path**, which addendum §B records as **not existing** and FR-23 places behind accounts. Accounts are **PLANNED-GATED** on the Traffic Gate (SM-1). This must not be smuggled into 2.2. **Lands:** addendum §E as a dependency note on FR-23; a gate-free approximation (compare against the archived spreadsheet's actual outcome, shown to everyone) can be proposed later inside Epic 4/5 without touching persistence.
- **"Will the star player exceed X points"** prop-style thresholds are **betting-adjacent** (FR-26..29, gated) and the app has no player-level data. Winner and margin simulations are unconstrained. **Lands:** PRD FR-26..29 note, so the framing doesn't reappear as a "small addition".
- **`game_date`** for marketing/scheduler automation: write-side, orthogonal, no app read. **Lands:** FR-20/21 pipeline work as its own small migration, explicitly not part of 2.2.

---

## 5. Implementation handoff

**Change scope: Moderate** — planning-artifact rewrites plus a re-scoped story, no structural replan, no rollback.

| Recipient | Responsibility |
|---|---|
| **Owner (ujsolon)** | Done 2026-09-29: approved the proposal, picked **drop** for the column, **pipeline assertion + defensive read** for the invariant, the **2.7-data / 4.5-visual** split for the Home highlight, and the `CurrentGame7sPage.tsx` deletion; **deferred** §4.10 with the audit re-anchored to Story 2.1 |
| **`bmad-architecture` / AD maintenance** | Apply §4.1–§4.6 to the spine and addendum §B — the AD-4 rewrite is the keystone; nothing else may be applied before it |
| **PO/backlog** | Apply §4.7–§4.9 to `epics.md` Story 2.2/2.3/2.5/2.7/4.5; the series-count reconciliation travels with 2.1's deferred audit |
| **Developer (Story 2.1)** | Run the §4.10 count as a story AC, record it in the spike decision doc — this is the last unmeasured premise the derivation rests on |
| **Developer (Story 2.2)** | Implement derivation helper + query flips + migration as scoped, `npm run gate` green, same-commit `CURRENT_DATA_MODEL.md` |
| **QA (Story 1.5 carry-over / 2.7)** | Re-score `qa-matrix-1-5.md §6.5` + F9 and `deferred-work.md` F9 against the derivation; §2.2's `[!]` closes only when 2.7's drill proves it |
| **FR-25 (Epic 3)** | One PostHog query touch after `series_source` is re-derived; the ten §A.1 event names are untouched |

**Success criteria:** no read path in `src/` branches on `series.status`; the picker's pending group and the archive are two halves of one derived predicate with no third definition anywhere; the archive count is measured, not asserted — deferred to Story 2.1, so this criterion stays open until that story runs; nothing shipped during a playoff window that isn't read-path-only and additive; and addendum §B + AGENTS.md no longer tell an agent the enumeration is undefined.

**§4.2 and §4.9 are resolved and §4.1–§4.9 are applied, so the implementation bar this document originally set is lifted.** Story 2.2 may be built. The one caveat it carries: Story 2.1's deferred count is still an AC of 2.1, not of this proposal — if 2.2 lands first, the derivation ships on an asserted history premise, and Story 2.2's AC says so out loud rather than pretending it settled.
