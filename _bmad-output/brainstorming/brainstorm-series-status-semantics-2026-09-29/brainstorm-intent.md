# Series Status Semantics — Decision Document

Session: `brainstorm-series-status-semantics-2026-09-29` · Facilitator mode · source: `.memlog.md` (62 entries)
Scope: what `series.status` means, whether "Game 7 pending" is stored or derived, how such a series surfaces. **No code was changed in this session and none is changed by this document.**

---

## 1. Decision reached

**The series row *is* the announcement.** A `series` row is created by the pipeline only when a Game 7 is officially pending: certified 3–3, born together with its six `series_game_scores` rows and `winner_team_id NULL` (`.memlog.md:47`, `:52`, `:70`).

- `winner_team_id IS NULL` ⟺ "Game 7 pending."
- `winner_team_id IS NOT NULL` ⟺ archive / historical (`.memlog.md:59`, `:64`).
- `status` is the **redundant remnant** of the pre-merge two-table design; the app derives and does not store (`:69`).
- Nothing about a series is recorded before a 3–3 is official: a 2–2 or 3–2 series does not exist in the app at all (`:47`). Predication is "six games each CERTIFIED final + 3–3", never "looks safe" — staleness tolerance is the product's virtue, not a workaround (`:25`).

What this overturns, stated plainly:

1. **It reverses AD-4's birth trigger.** AD-4 (`ARCHITECTURE-SPINE.md:78-82`, adopted 2026-09-23) says a row exists "once it is active" = **from tip-off**. The owner's rule moves row creation to certified 3–3, so the table holds only Game 7 series — pending or played (`:50`).
2. **It supersedes the three-value CHECK.** `chk_series_status CHECK (status IN ('historical','active','completed'))` with `DEFAULT 'historical'` (`supabase/migrations/00005_release_1_data_model.sql:33,:36`) is not the two-value CHECK AD-4 wanted either; under derivation none of the three values is authoritative.
3. **The owner's original `active` semantics** — "exactly six games played, Game 7 to come" (`qa-matrix-1-5.md:255`) — is now served by the derivation (six score rows + NULL winner), not by a stored value. It is *more* faithful than a flag, because the flag can lie and the rows cannot.
4. **Archive membership** is `winner_team_id IS NOT NULL`, replacing `.eq('status','historical')` (`HistoricalPage.tsx:40`; `.memlog.md:64`).

Contradiction worth keeping visible, not smoothing: `sprint-change-proposal-2026-09-25.md:27` ruled "AD-4 / `series.status`: untouched — 3–3/4–3 is a view-level editorial device … not a data state." This session makes 3–3 the *birth condition of the row*. The spoiler pair survives; the "not a data state" clause does not.

## 2. The option space as brainstormed, and why the others lost

- **(A) Coarse stored lifecycle + derived pending** (`status IN ('active','completed')` per AD-4, pending computed from scores). Loses because the stored value would carry no information the rows do not already carry, while adding a second writer to keep in sync — exactly the desync that produced today's dead branches.
- **(B) A dedicated stored value for the decisive game** (`'game7_pending'` alongside 'active'). Loses because it binds a *word* to a *state of the world*: every pipeline run must move it correctly, and a missed move is invisible. Cost is one migration plus a permanent write obligation; benefit is a cheaper read.
- **(C) Pure derivation, no stored status** — chosen. Nothing to sync; the CHECK that mattered (`chk_game_number`, `00005:51`) and `unique_series_game` (`00005:55`) already constrain the evidence.
- **(D) A view / generated column / partial index as the single derivation site** — a *packaging* option for (C), not an alternative to it. It binds one place where "pending" is spelled; it costs a migration either way and can be added after the derivation exists. Deliberately not decided in-session; left to Story 2.2 ([ASSUMPTION]: the memlog raises the "single derivation site" question for the schema layer but records no pick between SQL-side and app-side).
- **(E) Status derived from timestamps** — killed outright. The owner ruled the app **never acts on a date** (`:42`), and the schema has no game-date column to derive from anyway (see §3).

## 3. Two axes, kept separate

**Axis A — data lifecycle (pipeline-owned, derived).** Row existence plus score rows plus `winner_team_id`. Event-driven on certified facts: certified 3–3 opens preview coverage; certified Game 7 opens the result record and the archive entry (`:29`, `:32`). The insight behind it: what a 1962 series shares with a live one is "it awaits a certified fact" — live-ness is a *missing next fact*, not a phase (`:33`, `:34`). The owner's own harvest: the awaiting window is hours, not indeterminate (`:35`).

**Axis B — publication fitness (surfaced, then waived).** Mid-session the owner introduced staged publication: the preview page releases **first as a bare page**, then the populated version on a ~24h tentative timeline; after Game 7 the 7th score row lands, the winner is computed, `/result` is created, bare-then-populated again on a more forgiving ~72h timeline (`:53`, `:54`, `:55`). The asymmetry is deliberate: preview is tight (pre-game attention), result is loose (evergreen).

**Ruling:** the owner **waived** publication as a stored state (`:59`, `:70`). The condition that reopens it, in the owner's words: *if a row can ever be created before its content is ready* — the waiver rests on the pipeline's atomic "row lands official" birth (`:70`). Bare-page publication is then an orphan-state concern for the deploy/prerender layer, not for the schema.

**Axis C — the third consumer of time: game dates.** Raised for the owner's marketing/scheduler automation (`:38`-`:41`). Hard ruling: **the app never acts on a date, only on certified scores**; `game_date` is write-side ops metadata and must not become a second authority (`:42`, `:43`). Verified: there is **no game-date column anywhere** in the schema — `00005:21-22,:34-35,:50,:65-66` carry only `created_at`/`updated_at` `TIMESTAMPTZ` row-bookkeeping, and a scan of every migration in `supabase/migrations/` finds no date/time column for when a game was played. So `game_date` would be a *new*, orthogonal column (FR-20/21), not a clarification of an existing one — and `created_at` must never be read as a game date.

## 4. Cascade cost, re-scored per option

Under the derivation decision the Epic-2 cascade **shrinks**, and some of it becomes dead-code cleanup rather than migration.

| Site | Today | Under derivation |
|---|---|---|
| `00005:33,:36` `status` + `chk_series_status` | three values, DEFAULT `'historical'` | no longer load-bearing; a migration is optional (see below) |
| `HistoricalPage.tsx:38-40` `.eq('status','historical')` | archive filter | becomes `.not('winner_team_id','is',null)` |
| `HistoricalPage.tsx:310-311` "Series Status" readout | prints raw `status` for every row → renders the word "historical" | renders a derived label or disappears; **user-visible either way** |
| `PredictPage.tsx:167`, `:396`, `:408` `status === 'active' ? 'current' : 'historical'` | **three** sites, not the two usually quoted | one helper over score rows + winner; already feasible for free — `SERIES_SELECT` fetches `series_game_scores(*)` at `:43` |
| `PredictPage.tsx:361`, `:408` `series_source` event property | emitted from the status branch | the property stays (FR-25 funnel); its value comes from the helper, and AD-1 moves the call behind `src/lib/analytics` (`ARCHITECTURE-SPINE.md:60`) |
| `PredictPage.tsx:22` `SeriesSource` union | `'current'/'historical'/'custom'` | value domain **free to change**; `'current'` has never been emitted (owner-asserted, §4.1) |
| `PredictPage.tsx:133-136` unfiltered picker query + client-side filter | no status filter server-side | unchanged; a seeded/derived row is still immediately visible to every visitor (`qa-matrix-1-5.md:249`) |
| `PredictPage.tsx:712-717` "Current Game 7s" group guard | `.some/.filter(status==='active')` | guard flips to the pending predicate; the `.some()` render-guard shape survives |
| `PredictPage.tsx:778` `Current` vs `View Series` | status branch | flips to the same helper |
| `src/types/types.ts:34` `'historical' \| 'active' \| 'completed'` | three members | `'completed'` **matches nothing** in DB or code (`:71(g)`); `'historical'` is what every row actually carries |
| `CurrentGame7sPage.tsx:27-29` `.eq('status','active')` | unrouted dead page, absent from `routes.tsx:17-48` | **delete** (`:68`) — verified dead: no route, no import anywhere in `src/` |
| `supabase/functions/predict-game-7/index.ts` | reads no `series.status` (its only table read is `.from('teams')` at `:344`) | **no-op** |
| `supabase/scripts/load-games/main.py:19,:60` | inserts into `game_sevens` — a table moved to the `archive` schema by `00013_archive_legacy_tables.sql:8-18` | still broken today; fix belongs to the pipeline runner story, not to status |
| `docs/CURRENT_DATA_MODEL.md:26` | lists `status` as a stored series column | update in the same commit as any CHECK change (AD-4's own rule, `ARCHITECTURE-SPINE.md:82`) |

**Is a migration still needed at all?** Not for surfacing. `chk_series_status` is not *blocking* anything under derivation — nothing reads it for truth. Two things can still require SQL: (i) replacing the CHECK with an integrity guard (§5), (ii) `game_date` (§3, orthogonal). If neither lands, the honest end state is a vestigial column still present with a still-enforced CHECK — [ASSUMPTION: leaving `chk_series_status` in place is acceptable; the memlog rules status redundant but never rules on dropping the column, so "no migration required" should not be read as "the column is deleted"].

**Shipping during a playoff window.** AD-4's sequencing rule (`ARCHITECTURE-SPINE.md:82`) exists because the archive query flip and the migration can desynchronize: if the CHECK/backfill lands before the deploy, `HistoricalPage`'s `.eq('status','historical')` returns nothing and the site's SEO asset renders **empty with no error** — the failure the architecture review already named (`reviews/review-rubric.md:36`). Derivation dodges the archive-dark window entirely (the flip is a *predicate change on unchanged data*), but it inherits the same release-coupling discipline, and adds one risk of its own: mid-window, rows written under the old convention (`status` set, no score rows) would derive as *nothing at all* and vanish from both picker groups. [ASSUMPTION: no such status-only, score-less row exists — the owner's verdict 4 asserts all 178 have seven score rows, which would cover it, but that count is not re-measured.]

### 4.1 Live-DB facts (owner-asserted, not re-measured in this session)

- **178/178 rows carry `status:'historical'`**; no `active` row has ever existed; therefore `series_source:'current'` has **never been emitted** (`:65`, `qa-matrix-1-5.md:21`). Labelled owner-asserted; the reproducible check is `GET /rest/v1/series?select=id,status` paged with `Range` (`qa-matrix-1-5.md:55`).
- The owner **asserts** all 178 rows have seven score rows and a decided winner — recorded as owner-confirmed but **NOT re-measured** (`:65`, `:71(b)`). Keep that caveat: verdict 4 ("derivation cannot false-positive on history") rests on it, and it is the premise the whole archive side depends on.
- Row-count drift across docs: `epics.md:52,:282,:354,:476` say **177**; `qa-matrix-1-5.md:21` measures **178**; AD-7 counts 172 non-flagship + 5 flagships. Whatever the answer, it should be re-counted once and written down consistently.

## 5. What Story 2.2 becomes

`epics.md:269-282` currently casts Story 2.2 as: land the `('active','completed')` CHECK, land UNIQUE(year,round) + round CHECK, backfill `'historical'→'completed'`, flip the frontend in the same release, and verify that "with an empty Active set the Predict flow shows an empty non-breaking Active list (FR-2)" (`:282`). This is exactly the enumeration `addendum.md:43` (§B) declared undefined and handed to pipeline work (FR-20/21), and Epic 2's story order puts it second, right after the Q-4 spike and before the runner (`epics.md:157`). **The first and third of those AC get replaced by derivation.** Story 2.2 becomes "make the read path the single source of truth", and its real content is the residue:

- The UNIQUE(year,round) + `round` CHECK half survives untouched — AD-5 needs it regardless (`ARCHITECTURE-SPINE.md:88`).
- The backfill and the frontend status flip are deleted as work items.
- The "empty Active list" AC survives and gets *more* honest: under derivation, an empty pending set is the normal offseason state rather than a state a flag has to be parked in. The copy is already written for it (`EXPERIENCE.md:112` — "No active series right now — the next Game 7 is coming." / "Every Game 7 has a history."), and the same line is what Home's highlight div renders when nothing is pending (`:68`).
- **The residual integrity choice moves to correct-course**, per the owner (`:71(a)`). Three candidates: (i) a CHECK enforcing `winner_team_id IS NOT NULL ⟺ seven score rows`; (ii) a **verified read path** — the app derives defensively and reports the mismatch loudly; (iii) **pipeline convention only** — no enforcement at all. [ASSUMPTION: a plain table CHECK cannot express "seven rows in `series_game_scores`", since CHECK constraints cannot reference other tables; option (i) therefore means a trigger or an equivalent, which is a materially bigger thing to adopt than the CHECK it replaces.]

Why this matters: `winner_team_id` is itself derived — the pipeline computes it from the Game 7 score row — so "a winner with only six games" *should* be impossible (`:63`). That is a promise about a script, not a property of the database. **"Derived but stored" needs one of the three above to be more than a promise**: derivation only protects users if the data can't drift, and drift with no constraint and no verification is precisely the failure mode this session exists to escape. Verdict 6 covers the *legitimate* stall (a postponed Game 7 keeps a row null-winner forever, tolerated silently, no state invented for it — `:67`); it does not cover an *illegitimate* one.

## 6. Named leftovers, each with a landing spot

From `:71`, with the memlog's own assignments:

| Leftover | Lands in |
|---|---|
| (a) `winner_team_id` derivation is a pipeline promise, not a DB guarantee — pick CHECK / verified read path / convention | AD-4 amendment via **Story 2.2** |
| (b) The 178-row seven-score-rows completeness count, owner-asserted and un-re-measured | **Story 2.1** or the Q-4 spike |
| (c) `game_date` for scheduler/marketing automation — separate, non-status, write-side only | **FR-20/21 pipeline work** |
| (d) `series_source` decoupled from `status`; changing the value costs one PostHog query touch | **FR-25 / AD-1** |
| (e) Delete `CurrentGame7sPage.tsx`; Home highlight stays a div, not a route (`:68`) | **Story 2.1 / 2.7** |
| (f) `main.py` still writes the archived `game_sevens` table | **Story 2.1 pipeline runner** |
| (g) `types.ts:34` `'completed'` union member matches nothing | **Story 2.2 frontend pass** |
| (h) `qa-matrix-1-5.md §6.5` (a)/(b)/(c) become the *verification* plan for the derivation | **Story 1.5 / 2.7** |

On (h): §6.5's three options were never chosen (`qa-matrix-1-5.md:255`), and F9 is parked on Epic 2 (`:275`). Under derivation they are re-scored and **option (c) gets easier**: a CDP response override no longer has to fake a flag that means nothing on the server — it fakes **six score rows and a null winner**, which is the shape the app will actually read (`:71(h)`, `qa-matrix-1-5.md:251`). Option (a) keeps its warning: the picker query is unfiltered (`PredictPage.tsx:133-136`), so a seeded row is live to every visitor the moment it exists.

On (d): `series_source` is a **property**, not one of the 10 preserved event names (`addendum.md:20-31`); the names (`prediction_generated`, `series_selected`, `custom_series_selected`, …) survive untouched. The property is load-bearing for FR-25's custom-vs-archive funnel split, the value domain is free, and the derivation currently lives in feature code at `PredictPage.tsx:167,:361,:396,:408` where AD-1 (`ARCHITECTURE-SPINE.md:60`) will move it behind `src/lib/analytics` (`.memlog.md:58`).

## 7. Open questions left to the owner

Genuinely undecided by the session:

1. Which of §5's three integrity options to adopt (nothing was chosen; `:71(a)` only assigns who decides).
2. Whether the derivation is spelled in SQL (view / generated column / partial index) or only in app code — §2(D) was packaged, not picked.
3. Whether `status` and `chk_series_status` are eventually dropped, renamed, or left as a documented vestige — §4's [ASSUMPTION].
4. The new value domain of `series_source` once decoupled (the owner delegated the *principle* to the coach at `:60`; the concrete values and the one PostHog query touch are unowned).
5. The re-measurement itself: the 178-row count, the per-row score-count, and the 177-vs-178-vs-172+5 doc discrepancy.
6. When publication fitness (§3 Axis B) reopens — by rule ("if a row can ever be created before its content is ready") rather than by date, so nobody has re-litigated it.

## 8. Next step

The owner runs `bmad-correct-course` from this document to land the AD-4 / addendum §B / epics / EXPERIENCE cascade. **Do not implement.**
