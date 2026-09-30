# Sprint Change Proposal — series identity moves from `(year, round)` to `(year, team_a_id, team_b_id)` (2026-09-30)

Trigger: Story 2.1's read-only archive audit, run against the live `series` table on 2026-09-30 (`scripts/spike-2-1/audit-archive.mjs`, `scripts/spike-2-1/audit-unique-key.mjs`, `scripts/spike-2-1/audit-slot-semantics.mjs`). Recorded as an open action in `_bmad-output/implementation-artifacts/sprint-status.yaml` (`story-2-1-spike-unique-year-round-will-not-apply-to-the-real-table`) and in `decision-2-1-q-4-data-source.md`.
Scope of this document: **planning artifacts only** — the architecture spine and `epics.md`. No code, no migration, no deploy authorized here.
**Status 2026-09-30: approved by the owner in the same session — Call A = **A1** (plain `UNIQUE (year, team_a_id, team_b_id)` + runner-side identity assertion), Call B = **B1** (no `round` CHECK; Story 2.4's adapter owns the vocabulary) — and the §4.1–§4.5 artifact edits are applied, together with the two additional edits recorded in §4.7.**
Supersedes: nothing. It **amends** `sprint-change-proposal-2026-09-29.md` §4.4's AD-5 wording and Story 2.2's AC in the direction that proposal explicitly left to the spike ("adapter internals still pending Q-4 spike"); AD-4's derivation decisions stand unchanged.

---

## 1. Issue summary

**What triggered it.** Story 2.1 was a time-boxed feasibility spike whose AC also required a read-only audit of the archive before Story 2.2 wrote a migration against it. The audit ran. AD-5's idempotency key — `UNIQUE (year, round)`, carried into Story 2.2's acceptance criteria verbatim — **cannot be created on the production table**, and Story 2.2's migration as AC'd fails on the first run.

**The core problem, typed.** *Technical limitation discovered during implementation* — specifically, an architectural decision written before the data was measured. `(year, round)` was chosen to make adapter upserts idempotent, but it identifies *a round of a postseason*, not *a series*. Two different matchups can reach Game 7 in the same year and the same round name, and in the archived data they do.

**Evidence (all measured 2026-09-30 against the live `series` table, 178 rows, anon-key read path with `Prefer: count=exact` and `Content-Range` verified):**

| Candidate key | Groups | Duplicate groups | Extra rows | Verdict |
|---|---|---|---|---|
| `(year, round)` — AD-5 as specified | 157 | **19** | **21** | **violated** — sizes `{2: 17, 3: 2}` |
| `(year, team_a_id, team_b_id)` — owner's proposal | 178 | 0 | 0 | valid on all 178 rows |
| `(year, unordered pair)` | 178 | 0 | 0 | valid |
| `(year, round, team_a_id, team_b_id)` | 178 | 0 | 0 | valid (superset of a valid key) |

Worst collisions: `2014 | Western Conf First Round` and `2026 | Eastern Conf First Round` — **three** seven-game series each. Example from the earlier pass: `1969 | Western Division Semifinals` holds 2 rows.

Two further measurements bear on the design:

1. **The five-column index that already exists is the working key.** `00007_backfill_missing_historical_series.sql:42` creates `CREATE UNIQUE INDEX IF NOT EXISTS idx_series_identity ON series (year, round, team_a_id, team_b_id, status)` with a matching `ON CONFLICT (...) DO NOTHING` at `:57`. So the live table has **never** been keyed on `(year, round)` alone, which is why the collisions went unnoticed. Story 2.2's AC proposes dropping that index and replacing it with a **strictly narrower** constraint that the same data violates.
2. **The team slots carry a convention, not a canonical ordering.** `team_a_id > team_b_id` in 80 of 178 rows (so no id-sort invariant), but `team_a_id` is **game 1's home team in 178 of 178** rows, and the series winner in 177 of 178. `round` carries **17 era-dependent spellings** (7 West conference-stage variants, 6 East, 2 neutral — `Semifinals` / `Finals`).

**Why this matters beyond the migration.** AD-5's stated reason for pairing the key with a `round` CHECK was "without both, adapters silently duplicate rows." Once `round` leaves the key, that hazard is gone with it — and the CHECK's own cost rises, because a CHECK over 17 historical spellings pins era-specific text as canonical, while a CHECK over a clean canonical vocabulary requires rewriting archive copy that users read on the Historical page and in every OG card.

## 2. Impact analysis

### 2.1 Epic impact

**Epic 2 still completes; Story 2.2 changes shape, not size.** The migration is still subtractive-plus-one-constraint: drop `status` + `chk_series_status` + its default, drop the `00007` five-column index, add one UNIQUE. The read-path flip to AD-4's derivation is untouched, and the sequencing rule (one release, off-playoff window, `CURRENT_DATA_MODEL.md` in the same commit) is untouched.

**Story 2.4 gains one named responsibility.** The `round` vocabulary stops being a schema guard and becomes an adapter mapping: the nba.com adapter derives a canonical display value per series from the bracket, and maps the higher seed to `team_a_id`. This is already routed in `deferred-work.md` ("round-vocabulary derivation → Story 2.4"); this proposal promotes it into the story's AC so it has a home rather than living only in a decision record.

**Story 2.3 gains one assertion clause.** The runner's pre-commit assertion (AD-4 §4.2(b)) now also covers identity: before inserting a series row, check the pair in **either** slot order. Its AC already says "no step ever writes `series.status`" — the identity assertion is the same class of guard and belongs beside it.

**Stories 2.5, 2.6, 2.7 unaffected.** No cache, workflow, or alerting AC names the key.

**Epic 1 unaffected.** Its read paths use the derived phase and never keyed on `(year, round)`.

### 2.2 Artifact conflicts

| Artifact | Site | Conflict |
|---|---|---|
| `ARCHITECTURE-SPINE.md` | `:128` Consistency Conventions, "IDs & data" | asserts "Series identity = `(year, round)`" |
| `ARCHITECTURE-SPINE.md` | `:97` AD-5 rule | specifies `UNIQUE (year, round)` + `round` CHECK as the prerequisite |
| `ARCHITECTURE-SPINE.md` | `:86` AD-4 bullet | refers to "the same migration that adds `UNIQUE (year, round)`" |
| `epics.md` | `:90` AD-5 summary | repeats key + CHECK |
| `epics.md` | `:157` Epic 2 narrative | "prerequisite migration (`UNIQUE (year, round)` + `round` CHECK)" |
| `epics.md` | `:312, 318, 320` Story 2.2 | intent line, the "duplicate (year, round) insert / out-of-CHECK round value" AC, and the index-drop parenthetical |
| `epics.md` | Story 2.4 AC | does not yet name the round mapping or the seed→slot rule |
| `docs/CURRENT_DATA_MODEL.md` | post-migration | must document the new constraint (already required by the same-commit rule) |
| PRD / addendum | — | **no conflict.** No FR or addendum decision names the key; FR-19/20/21 speak of freshness, not identity |
| UX design docs | — | **no conflict.** `round` stays a display string; `getRoundImportance` (`src/lib/nba-utils.ts:49-65`) is substring-tolerant and unchanged |
| `reviews/review-adversarial.md` Attack 7 | — | the architecture's own adversarial pass predicted this failure ("`(year, round)` is not a key yet… HIGH") and proposed the canonical-enum fix. **Do not rewrite the review** — it is audit trail, and it is the record that the hazard was foreseeable. Cite it. |

### 2.3 Technical impact

- **Migration `00014` (next free number)**: `ALTER TABLE series DROP COLUMN status` (which drops `chk_series_status` with it), `DROP INDEX idx_series_identity`, `ALTER TABLE series ADD CONSTRAINT series_year_matchup_key UNIQUE (year, team_a_id, team_b_id)`. Order matters and is stated in the AC: the index must go before or with the column drop, since it depends on `status`.
- **Replay safety, checked:** dropping `status` in a later migration does not break `00007` on a fresh `supabase db reset`, because migrations replay in order and `00007` runs while `status` still exists (`00005:33,36`). No rewrite of `00007` is needed.
- **`ON CONFLICT` addressability.** A plain column UNIQUE is addressable by supabase-js's `.upsert(..., { onConflict: 'year,team_a_id,team_b_id' })`, which is what Story 2.3's runner will use. This is the deciding constraint against an expression index (see §4.6 Call A).
- **Data risk: none.** The new UNIQUE is satisfied by all 178 existing rows as measured, so the migration cannot fail on current data — the opposite of the AC'd version, which fails with 21 violations.
- **Nothing in `series_game_scores` changes.** Its key stays `(series, game_number)`, already verified duplicate-free (1,246 rows, every series exactly 7).

## 3. Recommended path

**Option 1 — Direct adjustment. Selected.** Effort: **Low** (three artifact edits plus one AC clause each in 2.3 and 2.4). Risk: **Low** — the replacement constraint is measured valid, and the change removes an enforced-failure path rather than adding one.

Why not the alternatives:

- **Option 2 (rollback)** — nothing to roll back. Story 2.1 shipped no production code, and Story 2.0's gate is unrelated. The `00007` index is live and correct; the *plan* was wrong, not the deployed schema.
- **Option 3 (MVP reduction)** — not implicated. Epic 2's MVP purpose (drilled automation before the Apr–Jun 2027 window) is unaffected in either direction; if anything this fix protects it, because the AC'd migration would have failed mid-preparation.

**Framing note for the owner.** Your correction is the substance of the change, and my earlier action item was drawn wrong: I described re-scoping `(year, round)` as though it were being *extended*, when the point is that pair alone identifies nothing — two teams meet each other at most once per postseason, so the pair *is* the instance. The measurement confirms your formulation on 178/178 rows and explains why the current five-column index has never collided.

## 4. Detailed change proposals

### 4.1 `ARCHITECTURE-SPINE.md` — Consistency Conventions, "IDs & data" (`:128`)

**OLD:**
> Series identity = `(year, round)` (UNIQUE constraint + `round` CHECK domain — prerequisite migration per AD-5)

**NEW:**
> Series identity = `(year, team_a_id, team_b_id)` (UNIQUE constraint — prerequisite migration per AD-5). `round` is descriptive text **outside** the key, normalized by the adapter, not by a CHECK.

**Why:** the table row is the fast lookup an agent reads first; leaving `(year, round)` there re-seeds the mistake.

### 4.2 `ARCHITECTURE-SPINE.md` — AD-5 rule (`:97`)

**OLD (the two affected sentences, verbatim):**
> Writes are idempotent upserts — but `(year, round)` only becomes a real key when a prerequisite migration adds `UNIQUE (year, round)` on `series` **and** pins `round`'s domain with a CHECK constraint (today `round` is free TEXT with no enumeration; without both, adapters silently duplicate rows).

> The prerequisite migration also **drops the `00007_backfill_missing_historical_series.sql:42` index over `(year, round, team_a_id, team_b_id, status)`** (an `ON CONFLICT` target at `:57`), which `UNIQUE (year, round)` supersedes and which cannot survive the removal of `status` (AD-4).

**NEW:**
> Writes are idempotent upserts keyed on **`UNIQUE (year, team_a_id, team_b_id)`**, added by the prerequisite migration (Story 2.2). `round` is **not** in the key and gets **no CHECK** — measured against the live table on 2026-09-30, `(year, round)` collides in **19 groups / 21 extra rows of 178** (two matchups can reach Game 7 in the same year and round name; `2014` and `2026` Western/Eastern Conf First Round each hold three), and `round` carries **17 era-dependent spellings**, so keying on it would make upsert idempotency depend on free text. Two teams meet at most once per postseason, so the pair identifies exactly one series: duplicate-free on all 178 rows as measured. **Slot convention:** `team_a_id` is game 1's home team in 178/178 rows and `team_a_id > team_b_id` in 80, so there is no canonical id ordering for the constraint to lean on. The adapter maps the higher seed to `team_a_id`, and the runner asserts the pair is absent **in either slot order** before inserting (Story 2.3's identity assertion) — the constraint cannot enforce the convention, so a slot-swapped re-insert of the same matchup would land as a new row. A real observed swap reopens this as a generated-key decision.

> The prerequisite migration **replaces the `00007_backfill_missing_historical_series.sql:42` index over `(year, round, team_a_id, team_b_id, status)`** (an `ON CONFLICT` target at `:57`) with that UNIQUE — the same identity minus `round` and `status`, so it is valid today and the replacement is valid on the measured data too. The index cannot survive the removal of `status` (AD-4), so drop-and-add ships as one migration.

**Why:** AD-5 is the decision Story 2.2's migration and Story 2.4's adapter both read. It must carry the corrected key *and* the measurement, or the next reader has no reason not to re-narrow it.

### 4.3 `ARCHITECTURE-SPINE.md` — AD-4 bullet (`:86`)

**OLD:**
> **Owner decision 2026-09-29: drop both**, in the same migration that adds `UNIQUE (year, round)` (Story 2.2)

**NEW:**
> **Owner decision 2026-09-29: drop both**, in the same migration that adds `UNIQUE (year, team_a_id, team_b_id)` (Story 2.2, key corrected 2026-09-30 by this proposal)

**Why:** one cross-reference pointing at the superseded key would be enough to reintroduce it during implementation.

### 4.4 `epics.md` — AD-5 summary (`:90`) and Epic 2 narrative (`:157`)

**OLD (`:90`):**
> prerequisite migration adds `UNIQUE (year, round)` + `round` CHECK domain before upserts (and drops the `00007` five-column `status` index)

**NEW (`:90`):**
> prerequisite migration adds `UNIQUE (year, team_a_id, team_b_id)` before upserts and drops the `00007` five-column `status` index (key corrected 2026-09-30 after Story 2.1's audit — `round` is excluded from the key and carries no CHECK; the adapter owns its vocabulary)

**OLD (`:157`):**
> → prerequisite migration (`UNIQUE (year, round)` + `round` CHECK) + the read-path flip to AD-4's derived phase

**NEW (`:157`):**
> → prerequisite migration (`UNIQUE (year, team_a_id, team_b_id)`) + the read-path flip to AD-4's derived phase

### 4.5 `epics.md` — Story 2.2 intent and AC (`:312, 318, 320`)

**Intent (`:312`)** — OLD:
> I want the uniqueness guards the pipeline depends on — UNIQUE(year, round) + round CHECK on `series` (AD-5)

NEW:
> I want the uniqueness guards the pipeline depends on — UNIQUE(year, team_a_id, team_b_id) on `series` (AD-5 as amended 2026-09-30; `round` deliberately outside the key, no CHECK)

**Enforcement AC (`:318-319`)** — OLD:
> **When** a duplicate (year, round) insert or an out-of-CHECK `round` value is attempted
> **Then** both are rejected by the database

NEW:
> **When** a duplicate `(year, team_a_id, team_b_id)` insert is attempted, and separately when the *same* matchup arrives with the team slots swapped
> **Then** the duplicate is rejected by the database, and the slot-swapped insert is rejected by **the runner's pre-commit identity assertion** — the constraint cannot enforce the `team_a` = game-1-home convention, so this half of the guard is pipeline-side and exits non-zero (AD-4 §4.2(b)'s mechanism, not a trigger)
> **And** `round` values outside the adapter's mapping are **not** rejected by the database; no `round` CHECK ships in this story, and the vocabulary is Story 2.4's responsibility

**Index-drop AC (`:320`)** — OLD:
> **And** the `00007` five-column index on `series` is dropped (its `ON CONFLICT` target is replaced by UNIQUE(year, round))

NEW:
> **And** the `00007` five-column index `idx_series_identity` is dropped in the same migration that adds the UNIQUE, and the new constraint is **satisfiable by all 178 existing rows** — that measurability is what makes the migration safe, and the pre-flight check is `node scripts/spike-2-1/audit-unique-key.mjs` re-run against the live table immediately before applying

**Added AC (regression guard):**
> **And** the migration is applied and verified in a throwaway database from a full `supabase db reset` replay **before** touching production, to confirm `00007`'s `ON CONFLICT` target still resolves while `status` exists at its own point in the replay order.

**Unchanged ACs:** the `status`/`chk_series_status`/default drop, the shared derivation helper, `HistoricalPage.tsx:310-311` removal, the unit-test fixtures, `CURRENT_DATA_MODEL.md` same-commit, and `npm run gate` all stand as written.

### 4.6 Owner calls (resolved 2026-09-30: **A1** and **B1**)

**Call A — which mechanism enforces identity?**

| | Mechanism | ON CONFLICT-addressable from supabase-js? | Enforces the slot convention? | Cost |
|---|---|---|---|---|
| **A1 — selected 2026-09-30** | plain `UNIQUE (year, team_a_id, team_b_id)` | **yes** — `onConflict: 'year,team_a_id,team_b_id'` | no (runner assertion covers it) | one DDL line |
| A2 | unique expression index on `(year, LEAST(a,b), GREATEST(a,b))` | **no** — PostgREST/supabase-js cannot target an expression index, so the runner would have to hand-write SQL | yes | breaks the port's upsert path; a second write style to maintain |
| A3 | stored generated `matchup_key` column + UNIQUE | yes (a normal column) | yes | new column in every read shape; the payload must never include it; a second identity representation to keep from drifting |

**Selected: A1** (owner, 2026-09-30). Rationale: it is what the measurement validates, it keeps the single upsert path Story 2.3's port depends on, and the residual hazard — a *slot-swapped* duplicate — is a single-writer risk that the runner can catch with one indexed lookup before commit, failing loudly through the SM-4 mechanism that already exists. This mirrors the owner's own AD-4 §4.2(b) precedent: convention plus assertion in the pipeline, DB enforcement where the DB is actually capable, and "a real observed drift reopens this."

**Call B — does any `round` guard ship, and when?**

| | Approach | What it costs |
|---|---|---|
| **B1 — selected 2026-09-30** | **No CHECK now.** Story 2.4's adapter maps source round → one canonical display value; the 17 historical spellings stay as-is. Reopen a CHECK only after 2.4 publishes its vocabulary. | zero data change; nothing rejects a bad value at the DB until 2.4 is the writer, which is the only time it can matter |
| B2 | CHECK over the **17 observed** spellings | enshrines era text as canonical; a new-era spelling from a live source is rejected by production, i.e. it makes the pipeline fail on real data |
| B3 | CHECK over a **canonical** set + one-time backfill of the 178 archive rows | changes wording users see on Historical pages and in already-shared OG cards (`Eastern Division Semifinals` → canonical), i.e. a visible product change nobody asked for, in the same release as the key fix |

**Selected: B1** (owner, 2026-09-30). Rationale: the CHECK existed to protect the key. With `round` out of the key, its only remaining job is display consistency, and that belongs to the reader/adapter rather than to a constraint that would have to be backfilled across user-visible copy. Ship the key fix alone, in the smallest migration.

### 4.7 Additional edits applied beyond §4.1–§4.5

Five more sites became stale once the audit's numbers and the corrected key landed, and leaving them would have contradicted the ACs above:

1. **`epics.md` Story 2.2 "Given" and the post-migration verification AC** still said the §4.10 archive audit was **deferred and unmeasured**, and told the builder to fall back to a fresh count because "the 177/178/172+5 discrepancy is still unresolved." The audit has now run: **178 series / 1,246 score rows / every series exactly seven / zero anomalies**, so both clauses now cite the measured numbers and point at `audit-unique-key.mjs` as the pre-flight. (Story 2.1 itself stays at `review` — the numbers are reported as measured, not as owner-signed-off.)
2. **A new Story 2.2 AC**: apply `00014` first in a throwaway database from a full `supabase db reset` replay, to confirm `00007`'s `ON CONFLICT (year, round, team_a_id, team_b_id, status)` target still resolves at its own point in the replay order. Ordered replay means a later `status` drop cannot break the earlier backfill, but the AC now *tests* that instead of relying on the argument.
3. **`epics.md` Epic 2 narrative** (`:157`) still listed the adapter chain as "`fantrax` adapter → `nba_com` adapter", which Story 2.1's evidence and the owner's 2026-09-30 call contradict. It now reads "automated adapter per the spike decision (nba.com primary, one keyed provider as alternate — fantasy Fantrax ruled out)".
4. **AD-7's `[Count caveat 2026-09-29]`** said the three figures "have never been reconciled" and that 2.1's audit would pin the number. It ran, so the caveat now records the pinned live total (178), states that the `172 + 5 = 177` split does not cover the table as it stands, and distinguishes the **source-spreadsheet** `177` (a claim about `NBASeriesResults.xlsx`, never reconciled row-by-row) from the live count — the audit did not establish *why* they differ, and this proposal does not claim to. The open item stays open and is now routed rather than implied: the prerender route list must be derived from the measured 178 plus the owner's flagship list, not inherited as 172.

5. **`docs/CURRENT_DATA_MODEL.md:19`** named the `00007` index drop without naming what replaces it, so the doc the Story 2.2 builder must update in the same commit carried no key; it now states `UNIQUE (year, team_a_id, team_b_id)` and points here. And **`decision-2-1-q-4-data-source.md`** offered `UNIQUE(year, round, series_number)` as a possible fix under blocker 1 — that guess is marked resolved by A1 rather than left standing for the review session to re-litigate, and blocker 2's vocabulary question now points at Story 2.4 per B1.

**Not swept here:** the `177` figure still appears as a live-table claim in PRD FR-19's wording, `epics.md:52/:542/:594`, and `EXPERIENCE.md:40`. Reconciling that wording across five documents is a documentation-consistency task with a consumer (Story 4.3's route list), so it is recorded as a tracked action item rather than done silently in this proposal.

**Deliberately not changed:** AD-5's adapter roster still *names* `fantrax` as a port adapter, and Story 2.3's `SERIES_SOURCE` enumeration still lists it. Removing an adapter name from the port is a sign-off decision that belongs to the owner's Story 2.1 review, not to this proposal — so the roster question stays open there, with the narrative pointing at the ruling-out. `reviews/review-adversarial.md` Attack 7 is also left exactly as written: it predicted this failure, and rewriting an audit trail to look prescient is not evidence.

## 5. Implementation handoff

**Change scope: Moderate** — planning-artifact amendments plus two stories' ACs, no epic restructuring, no PRD change, no rollback.

| Who | Does |
|---|---|
| **Owner** (also PO + architect here) | Decided Calls A and B on 2026-09-30 (A1, B1) and approved this proposal. Still owed later: authorize the actual migration run against production when Story 2.2 is built, and sign off Story 2.1 in its own review session. |
| **Developer agent (this session)** | Applied §4.1–§4.5 plus the five §4.7 edits to `ARCHITECTURE-SPINE.md`, `epics.md`, `docs/CURRENT_DATA_MODEL.md` and the Story 2.1 decision record; closed the `story-2-1-spike-unique-year-round-...` action item in `sprint-status.yaml` as done with a pointer to this proposal, and closed `epic-1-retro-item-5` (both owner actions complete); opened `story-2-1-audit-pin-the-archive-total-in-the-docs-that-still-say-177` with Story 4.3 as its owner; re-read every edited region in the same turn (Biome's `files.includes` covers `src/**` only, so markdown breakage passes all four gates) |
| **Story 2.2 build (`bmad-build`)** | Writes migration `00014`, the shared derivation helper, the read-path flip, `CURRENT_DATA_MODEL.md`, the unit tests — gated by `npm run gate`, and **applies nothing to production without the owner's go-ahead** |

**Success criteria for the change itself:** Story 2.2's ACs are satisfiable on measured data (0 violations against 178 rows); no artifact still asserts `(year, round)` as a key — verified by grep, not by memory, over `_bmad-output/` and `docs/` (the surviving hits must be historical/proposal text quoting the superseded wording, plus the spike scripts' own labels); `round`'s ownership is named in Story 2.4 and Story 2.3's identity assertion is stated rather than implied.

**Sequencing:** this proposal must land **before** Story 2.2 is picked up, since its ACs are the story's contract. Story 2.1 stays at `review` for the owner's separate review session; this proposal cites its measurements but does not sign the story off.

**Standing constraints unchanged:** migration + read-path flip ship in one release, off-playoff window (currently satisfied — 2026-09-30 is offseason), `docs/CURRENT_DATA_MODEL.md` in the same commit, owner confirms before any migration or deploy, never push on the owner's behalf.

---

### Appendix — how to re-run the measurements

| Script | Reports |
|---|---|
| `scripts/spike-2-1/audit-archive.mjs` | 178 series / 1,246 score rows / every series exactly 7 rows / zero integrity anomalies / `status='historical'` on all 178 / years 1948..2026 |
| `scripts/spike-2-1/audit-unique-key.mjs` | the four candidate keys above, the 19 collision groups with examples, the 17-value `round` domain with year ranges, the era-family grouping |
| `scripts/spike-2-1/audit-slot-semantics.mjs` | `team_a_id` = game-1 home team in 178/178; winner is `team_a` in 177/178; 0 series missing `game_number = 1` |

All three are read-only over the anon-key PostgREST path, paginate with `Prefer: count=exact`, and verify `Content-Range` totals because Supabase's max-rows truncation is silent. They exit non-zero on a declared-vs-fetched row mismatch.
