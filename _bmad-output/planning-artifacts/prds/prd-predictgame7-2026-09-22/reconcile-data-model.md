# Reconciliation — CURRENT_DATA_MODEL.md vs PRD + Addendum

*Reviewer pass: 2026-09-22. INPUT = `CURRENT_DATA_MODEL.md` (repo root). Compared against `prd.md` and `addendum.md` in this folder. Focus: data entities, relationships, RLS/security posture, migration states, and constraints with requirement-level implications.*

## Verdict

Coverage is strong. Addendum §B mirrors every active table and every archived legacy table from the INPUT, §C pins the migration history, and PRD FR-19/NFR-D1 carry the normalized-schema and archive-schema facts. The `teams.logo_url`, custom-matchup name matching, `prediction_methods.is_active`, `contact_submissions` write path, and 177-record backfill are all present. No hard contradiction of a field list or table name was found. Four real gaps remain — three are ambiguities where the PRD asserts something the INPUT does not support (or slightly conflicts with), one is a missing enumeration the PRD implicitly depends on.

---

## Gap 1 — `predictions` runtime write path is unadjudicated; FR-23's "ephemeral" premise conflicts with INPUT's "active storage" framing

**Source (INPUT):** `predictions` is listed under "**Active** public schema tables" as "**Structured prediction storage for normalized model workflows**" (stores `series_id`, `method_id`, `probability`, `input_scores`, `model_parameters`, `contributing_factors`, `metadata`). Yet under "Current app usage", the tables the app and edge functions "**actively read from**" are `teams`, `series`, `series_game_scores`, `insights_cache`, `profiles`, `contact_submissions` — **`predictions` is not in the read list**, and no write path is stated.

**Where absent/conflicting (PRD):** FR-23 states "Anonymous Visitors' runs stay **ephemeral**" and treats row persistence as a future account-era behavior ("Stored predictions link the Auth user to rows in `predictions`"). Addendum §B calls the table "Private by RLS default" and defers persistence to "Q-1 territory." If the engine is already writing prediction rows today under the "structured storage for normalized model workflows" description, then: (a) "ephemeral" is factually wrong for anonymous runs, (b) NFR-S2's privacy posture ("no PII collected beyond contact submissions") needs re-examination (rows carry `input_scores`, `metadata`, potentially device-linkable content even if not user-identified), and (c) FR-23 changes from "start persisting" to "expose existing rows," which alters the accounts-scope estimate.

**Disposition:** Add a clarifying line to **addendum §B** (and a one-clause caveat to **FR-23 / NFR-S2**) stating whether the `predict-game-7` Edge Function currently inserts rows into `predictions` and, if so, under which role and with what retention. The INPUT alone cannot settle read-vs-write (its "read from" list only enumerates reads); verify against code before choosing the wording. Do **not** resolve silently in favor of "ephemeral" as the PRD currently does — that is an unsupported assertion against this input.

## Gap 2 — `profiles` is in the INPUT's active-read list, conflicting with PRD's "vestigial… power no user-facing feature"

**Source (INPUT):** "The current app and edge functions actively read from: … `profiles`" and "`profiles` — User profile records tied to `auth.users`."

**Where conflicting (PRD):** §4.5: "Supabase Auth + `profiles` already exist in the stack today but **power no user-facing feature** — owner-confirmed as vestigial groundwork." Owner-confirmation governs the *product* claim (no user-facing feature), but the INPUT asserts the table is actively read at runtime, which the addendum never mentions — §A/§B describe `profiles` only passively ("auth-linked user records").

**Disposition:** **Add to addendum §B**: one line noting `profiles` is read at runtime (e.g., session/bootstrap or edge-function auth checks) while no user-facing account feature exists, so the "vestigial" framing in §4.5 stays intact and readers don't infer the table is dead. No PRD body change; low-risk clarification. If the read is actually incidental (dead code path), record that instead after a code check.

## Gap 3 — `prediction_methods` omitted from INPUT's runtime read list, while FR-4 depends on it being queried

**Source (INPUT):** Active-read list (§"Current app usage") excludes `prediction_methods`, even though the table is described as the "Catalog of supported prediction methods" with `is_active`.

**Where absent/conflicting (PRD):** FR-4's testable consequence — "Only Methods with `is_active` in the `prediction_methods` catalog are offered" — presumes a runtime read of the catalog by the client or function. Addendum §B's RLS line likewise assumes the catalog is fetched ("explicit public-read for … active `prediction_methods`"). The INPUT's read list quietly contradicts either assumption.

**Disposition:** Same resolution shape as Gap 1: verify whether the four methods are actually catalog-driven or currently hard-coded in the frontend. If hard-coded, **add to addendum §B** that FR-4's `is_active` gating is a *design intent*, not observed runtime behavior today, and slightly soften FR-4's consequence wording. If catalog-driven, note the INPUT's read list is incomplete. Either way this is a requirements-accuracy issue for FR-4's testability.

## Gap 4 — `series.status` enumeration is never specified anywhere, yet three requirements hinge on it

**Source (INPUT):** `series` stores `status` — the document gives the column name only, no values, and no rule for how an Active Series is distinguished from a Historical one. (It also gives no `round` vocabulary or `prediction_type` domain in `predictions`.)

**Where absent (PRD/addendum):** FR-2 ("Active Series appear **distinctly** from Historical entries"), FR-11 ("final series status"), the Glossary's Active Series definition, and FR-20/21 (pipeline "update Active Series **statuses**") all treat `status` as the discriminating mechanism, but neither document lists its values or state transitions (e.g., historical / scheduled / live / completed?). This matters at requirement level because the FR-21 inseason pipeline's acceptance test ("After a daily run, Predict's Active Series reflect latest results") is unwritable without a defined status domain, and FR-20 "initialize/finalize" implies transitions nobody has specced.

**Disposition:** **Add to addendum §B** (data-model depth belongs there, not the PRD body): enumerate `series.status` values and the active-vs-historical discrimination rule, ideally as part of the FR-20/21 pipeline design work. Tag it as a required input for the pipeline architecture doc.

## Gap 5 (minor) — Relationship and key detail partially dropped; acceptable, with one caveat

**Source (INPUT):** Columns such as `team_a_id`, `team_b_id`, `winner_team_id`, `series_id`, `method_id`, `home_team_id` encode FK relationships; the INPUT also says archived tables are "moved into the `archive` schema," preserving recovery.

**Where absent (PRD/addendum):** Addendum §B drops the `*_id` naming (lists "team_a/team_b, winner") and never states the FK integrity/constraint posture (are referential constraints actually declared?). Also, INPUT fields `series.id`, `teams.id`, `series_game_scores` key composition (`series_id` + `game_number` presumably unique) are unstated. None of this changes a requirement today.

**Disposition:** **Intentional omission is fine** for the PRD body — the glossary already relates Series→Games→Teams conceptually. Optional one-line addendum §B addition if the architecture doc needs declared-constraint status; do not block on it.

---

## Checked and clean (no action)

- All 8 active tables and 4 archived tables present in addendum §B; names match exactly.
- Logo sourcing (`teams.logo_url`, "one logo each") and custom-name matching (full/nickname/abbreviation) — addendum §B + FR-3, consistent.
- `contact_submissions` write path: FR-16 + §B "direct public insert removed v0.2.2" align with INPUT's active-table listing.
- Archive retention rationale ("rollback, audit, one-off recovery… not normal runtime reads") = NFR-D1 + FR-19 + §B; faithful.
- RLS posture claims in the PRD (NFR-S1, §B lines) come from other repo sources (v0.2.1 security sprint, §C) — the INPUT's silence on security is not a gap; no contradiction introduced.
- Migration state ("after normalized Release 1 rollout and legacy cleanup") = §C v0.1.0 entry; consistent.

## Priority

Gaps 1 and 3 should be resolved by a quick code inspection **before** FR-23/FR-4/NFR-S2 are used to drive epics, since both feed requirement-level behavior claims. Gap 4 should be captured as an explicit deliverable of the FR-20/21 pipeline design. Gap 2 and 5 are wording-level.
