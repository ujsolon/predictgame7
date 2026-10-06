# Sprint Change Proposal: the analytics port moves to Epic 4 as Story 4.0, and Epic 4 runs before Epic 3 (2026-10-07)

Status: **approved by the owner 2026-10-07** (batch review) and applied the same day. Three deviations from the text below, all found while applying it:
- **Story 3.2's AC also cited the port.** It said *"through the Story 3.1 port"*; that is forward-looking, so it was re-pointed to 4.0 too.
- **Two hits stay, against §5's first success criterion.** `grep "Story 3\.1" epics.md` still hits the ACs of done Stories 2.9 and 2.11. They are historical record, so they stay as written.
- **`epic-3-context.md` was removed, not left stale.** It was compiled this session (never committed) and still described Story 3.1; the next `bmad-build` compiles fresh Epic 3 and Epic 4 contexts.

## 1. Issue summary

**Trigger:** an owner sequencing decision on 2026-10-07, made while Story 3.1's spec was being planned: *"it might make more sense to do epic 4 first before doing epic 3, that way all deep links and series pages interaction would have some analytics assigned to them."* Asked whether the move could be made properly, the owner chose *"3-1 to 4-0 … just so the epic would be closed properly and with the aligned deliverables."*

**Category:** strategic resequencing. Nothing failed.

**Evidence that the port must come first:**
- Epic 4 already depends on Story 3.1 as written. Story 4.4's AC says *"the share action emits through the Story 3.1 analytics port"* (`epics.md`, Story 4.4).
- The epic list's Epic 4 summary says *"attribution hook into Epic 3's port"*.
- Running Epic 4 without the port would add new direct `posthog-js` calls on every new surface: deep links, `/series/<id>`, and Share. Each one would violate AD-1 and become a call site the port story then has to move.
- Epic 4 is calendar-critical: it must be DEPLOYED at least 6–8 weeks before Apr 2027. Starting it earlier is worth having for that reason alone.

**State at the time of the decision:** Epics 1–2 are done, and release 0.2.7 is `282c1dd`. Story 3.1 has a `draft` spec, `spec-3-1-analytics-isolation-layer-ad-1-port.md`, with owner decisions D1–D4 recorded and no code written. Every Epic 3 and Epic 4 story is `backlog`.

## 2. Impact analysis

**Epic impact**
- **Epic 3** loses the port story. It keeps FR-17 (contact delivery and form) and FR-25 (gate reporting), and it can still complete.
- **Epic 4** gains Story 4.0 as its enabler. This follows the Story 2.0 precedent: a prerequisite story gets slot 0 of the epic that needs it.
- **Epic order** becomes Epic 4 (4.0 → 4.7) → Epic 3 → Epic 5.
- No epic becomes obsolete, and no new epic is needed.

**Story impact**
- **3.1 → 4.0:** renumbered, with the content unchanged except for the continuity AC (Proposal 2).
- **3.4:** its precondition re-points to Story 4.0.
- **3.5:** its precondition and live-view scope narrow. The 10-event continuity proof moves to 4.7.
- **4.4:** the SM-3 clause is re-cut. Story 4.4 ships the attribution data, and the SM-3 query stays Story 3.4's, which now runs after Epic 4.
- **4.7:** gains the port's continuity check after deploy.

**Artifact conflicts**

| Artifact | Effect |
|---|---|
| PRD + addendum | None. No epic or story numbers appear in them, and FR/SM definitions are unchanged. |
| Architecture spine (AD-1) | None. AD-1 names no story or epic. |
| UX spines | None. No surface changes. |
| `epics.md` | Edited (Proposals 1–6). |
| `sprint-status.yaml` | Edited (Proposal 7). |
| Story 3.1 spec | Renamed, and D3 re-pointed (Proposal 8). |
| `deferred-work.md` | Dated re-point annotations (Proposal 9). |
| `epic-3-context.md` | Goes stale automatically: once `epics.md` is newer, the next `bmad-build` recompiles it and compiles `epic-4-context.md` for 4.0. |

**Left untouched on purpose:** done specs, retros, earlier sprint change proposals, the architecture `.memlog.md` and `reviews/`. They are audit trail, and their "Story 3.1" references were true when written. The addendum lifecycle rule governs this.

**Technical impact:** none. No code, schema, deploy or CI change.

## 3. Recommended approach

**Direct adjustment** (checklist option 1): renumber, re-point and resequence within the existing plan. Effort is low and risk is low. The only judgement call is the continuity check (Proposal 2).

- *Rollback* is not applicable, because nothing was built.
- *MVP review* is not applicable, because scope is unchanged.

**The one non-obvious consequence.** The continuity AC compares PostHog live view *before and after the deploy*. Story 4.7 runs weeks after Story 4.0 ships, so it can only observe the *after* leg. The *before* leg has to be captured by the owner **before the first release that carries Story 4.0**. Once that release ships, the pre-port behaviour no longer exists to observe. Proposal 2 puts the before leg into 4.0's ACs and the comparison into 4.7.

## 4. Detailed change proposals

### Proposal 1: epic list and coverage map (`epics.md`)

**FR coverage map**

```
OLD: - FR-24: Epic 3 — instrumentation relocated behind AD-1 port, names verbatim
NEW: - FR-24: Epic 4 (Story 4.0) — instrumentation relocated behind AD-1 port, names verbatim (moved from Epic 3, sprint-change-proposal-2026-10-07)
```

```
OLD: - NFR10 (V1): Epic 3
NEW: - NFR10 (V1): Epic 4 (Story 4.0; moved from Epic 3, sprint-change-proposal-2026-10-07)
```

**Epic list, Epic 3:**
- Remove the sentence *"AD-1 analytics port (`src/lib/analytics/`: … before/after deploy** (owner decision 2026-09-25; …two measurement regimes)."* and move it to Epic 4's entry.
- Change the opening from *"…never misses a contact submission; PostHog is one module away from removable."* to *"…never misses a contact submission. (The AD-1 port that makes PostHog one module away from removable moved to Epic 4 as Story 4.0 — sprint-change-proposal-2026-10-07.)"*
- `**FRs covered:** FR-16 (preserved), FR-17, FR-24, FR-25; NFRs S2, V1.` → `**FRs covered:** FR-16 (preserved), FR-17, FR-25; NFRs S2.`

**Epic list, Epic 4:**
- Prefix the arrow chain with *"**Story 4.0 — the AD-1 analytics port** (moved from Epic 3 by sprint-change-proposal-2026-10-07, so every Epic 4 surface is instrumented through the port from its first deploy; carries the measurement-continuity AC, owner decision 2026-09-25) →"*.
- `attribution hook into Epic 3's port` → `attribution hook into Story 4.0's port`.
- `**FRs covered:** FR-31, FR-13 (scoped pilot) (+ FR-10/11 prerender surfaces); NFRs P1 …` → `**FRs covered:** FR-24, FR-31, FR-13 (scoped pilot) (+ FR-10/11 prerender surfaces); NFRs V1, P1 …` (rest unchanged).

**Epic order note.** Add one line at the top of `## Epic List`: *"Execution order (owner decision 2026-10-07, sprint-change-proposal-2026-10-07): Epic 4 runs before Epic 3; numbering is unchanged."* The epic numbers stay, so every existing story ID other than 3.1 is stable.

### Proposal 2: Story 3.1 → Story 4.0 (`epics.md`)

Move the story body from the Epic 3 section to the head of the Epic 4 section, as `### Story 4.0: Analytics isolation layer (AD-1 port)`. Add a provenance line in the style of Story 2.0's:

> *Moved from Epic 3 (was Story 3.1) by `sprint-change-proposal-2026-10-07.md`, owner decision 2026-10-07: it runs first because every Epic 4 surface emits through it.*

ACs: keep all four, and replace the continuity AC.

```
OLD: **And** measurement continuity: identical event trigger points pre/post refactor — verified in PostHog live view side-by-side (same events, same properties, same firing conditions) before and after deploy
NEW: **And** measurement continuity: identical event trigger points pre/post refactor (the one deliberate addition is the archive reset's `historical_filter_applied {filter_type:'reset'}`, owner decision D1 2026-10-07) — proven before merge by the gate plus a headless before/after event walk (PostHog answered locally); the owner records the **before** leg in PostHog live view (the 10 events on the then-live site) **before the first release carrying this story**, and Story 4.7 records the after leg and the comparison
```

At the old position in the Epic 3 section, leave a stub:

> ### ~~Story 3.1~~ → moved to Story 4.0 (2026-10-07)
> *Moved to Epic 4 by `sprint-change-proposal-2026-10-07.md`. Historical records written before 2026-10-07 cite it as Story 3.1.*

### Proposal 3: Epic 3 section intro (`epics.md`)

```
OLD: ## Epic 3: Owner Operations — analytics you can trust, contacts you never miss, gate numbers you can read

Covers FR-17 (contact delivery, issue #2 phases 2–3), FR-24/NFR-V1 (analytics isolation, AD-1), FR-25 (Traffic Gate reporting). This is the observability backbone SM-1 measurement depends on — every later epic's events flow through what lands here. Owner note (2026-09-25): analytics acceptance is "seeing it in action" — Story 3.5 requires the owner personally observing live events in PostHog, not a proxy report.

NEW: ## Epic 3: Owner Operations — contacts you never miss, gate numbers you can read

Covers FR-17 (contact delivery, issue #2 phases 2–3) and FR-25 (Traffic Gate reporting). Runs **after Epic 4** (owner decision 2026-10-07); the AD-1 analytics port it used to open with is Story 4.0, so every event here emits through a port that is already live. Owner note (2026-09-25): analytics acceptance is "seeing it in action" — Story 3.5 requires the owner personally observing live events in PostHog, not a proxy report; the 10-event continuity proof itself is Story 4.7's.
```

The heading's ` — analytics you can trust,` is removed. The sprint keys don't encode the epic title, so nothing else renames.

### Proposal 4: Story 3.4 and Story 3.5 preconditions (`epics.md`)

Story 3.4:

```
OLD: **Given** the analytics port from Story 3.1
NEW: **Given** the analytics port from Story 4.0 (and Story 4.4's share attribution, already emitting)
```

The SM-3 clause in the same story changes as follows:

```
OLD: SM-3 (share-link arrivals) is registered as "wires up when Epic 4 ships share attribution" — query shape defined now, data flows later
NEW: SM-3 (share-link arrivals) runs against the attribution Story 4.4 already ships — the query returns real data on its first run
```

Story 3.5:

```
OLD: **Given** Stories 3.1–3.4 complete
NEW: **Given** Stories 3.2–3.4 complete (the port is Story 4.0, verified by Story 4.7)
```

```
OLD: **Then** the owner personally observes PostHog live view while exercising the deployed site: all 10 preserved events + new contact variants fire with correct names and properties
NEW: **Then** the owner personally observes PostHog live view while exercising the deployed site: the contact events (`contact_form_submitted` + the new `_started`/`_failed` variants) fire with correct names and properties — the 10-event continuity proof was Story 4.7's
```

The title `Epic verification — continuity proof + delivery drill` becomes `Epic verification — delivery drill + gate numbers`. The sprint key stays as it is (Proposal 7).

### Proposal 5: Story 4.4's SM-3 clause (`epics.md`)

```
OLD: **And** the share action emits through the Story 3.1 analytics port, and arriving visits are attributable — the SM-3 query from Story 3.4 now returns real data
NEW: **And** the share action emits through the Story 4.0 analytics port, and arriving visits are attributable (`utm_source=share` reaches PostHog on the landing `$pageview`) — Story 3.4's SM-3 query, which runs after this epic, reads that data on its first run
```

### Proposal 6: Story 4.7 gains the continuity after-leg (`epics.md`)

```
OLD: **Given** Stories 4.1–4.6 deployed
NEW: **Given** Stories 4.0–4.6 deployed
```

Add one AC after the drill's `**Then**` line:

> **And** measurement continuity for Story 4.0's port: the owner observes PostHog live view on the deployed site — the 10 addendum §A.1 events fire with the same names, properties and firing conditions as the **before** leg Story 4.0 recorded (only D1's archive-reset emission is new) — recorded side-by-side with that before leg.

The Epic 4 section intro's *"SM-3 (share-link arrivals) attribution lands here."* gains *"…and so does the AD-1 analytics port (Story 4.0) every Epic 4 event emits through."*

### Proposal 7: tracking (`sprint-status.yaml`)

- Rename `3-1-analytics-isolation-layer-ad-1-port: backlog` → `4-0-analytics-isolation-layer-ad-1-port: backlog`, and move it to the head of the `epic-4` block.
- Move the whole `epic-4` block, with its retrospective, above the `epic-3` block, so the file reads in execution order.
- Add a dated comment: `# 2026-10-07: Story 3.1 moved to Epic 4 as 4.0 and Epic 4 runs before Epic 3 (sprint-change-proposal-2026-10-07).`
- Bump `last_updated`.
- Keep the `3-5-epic-verification-continuity-proof-delivery-drill` key as it is. Renaming a tracking key for a title change buys nothing, and the comment records the retitle.

### Proposal 8: the story spec

- `git mv` `spec-3-1-analytics-isolation-layer-ad-1-port.md` → `spec-4-0-analytics-isolation-layer-ad-1-port.md`. The file is uncommitted, so this is a plain rename.
- Change the title to `Story 4.0 — …`, keeping `status: draft`.
- Change D3 from *"folds into Story 3.5's owner pass"* to *"the owner records the before leg in live view before the first release carrying this story; Story 4.7 records the after leg"*.
- Re-point D4 (on hold) to *"resequenced by sprint-change-proposal-2026-10-07; resume via `bmad-build`."* D1 and D2 are unchanged.

### Proposal 9: `deferred-work.md` owner pointers

There are five entries that say "Lands with Story 3.1", "Owner: Story 3.1" or "Natural owner: Story 3.1": pageviews, the ad-blocker retry queue, filter clears (×2 lines), and the archive-projection pins. Each gets one appended clause. The existing text is not rewritten:

> **Re-pointed 2026-10-07:** Story 3.1 is now Story 4.0 (sprint-change-proposal-2026-10-07).

Two entries also gain their disposition from the 4.0 spec. The pageview finding gets *"root cause refuted at HEAD by measurement — see the 4.0 spec's Design Notes"*, and the filter-clears finding gets *"owner decision D1: reset emits `filter_type:'reset'`"*. Both say "lands with the 4.0 build", so they stay open until the build closes them.

## 5. Implementation handoff

**Scope: Moderate.** This is a backlog reorganization: documents and tracking only, with no code.

| Who | Does what |
|---|---|
| Developer agent (this session) | Applies Proposals 1–9, re-reads every edited region (AGENTS.md evidence discipline), and makes one commit: `Move the analytics port to Epic 4 as Story 4.0 and run Epic 4 first (FR-24, NFR-V1)`. |
| Owner | Before the first release carrying Story 4.0, records the PostHog live-view before leg: the 10 events on the then-live 0.2.7 site. |
| Next session | Runs `bmad-build` on `spec-4-0-analytics-isolation-layer-ad-1-port.md`, resuming the draft at its checkpoint. Epic 4 context gets compiled then. |

**Success criteria:**
- `grep -n "Story 3\.1" epics.md` hits only the stub and Proposal 2's provenance line.
- `sprint-status.yaml` lists `epic-4` before `epic-3` and has no `3-1-` key.
- The renamed spec carries D1–D4 with D3 pointing at 4.7.
- `npm run gate` stays green. It can't be affected, but the pre-push hook runs it anyway.
