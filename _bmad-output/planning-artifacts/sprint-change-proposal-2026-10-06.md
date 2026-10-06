# Sprint Change Proposal: automated births at a feed-observed 3–3 (2026-10-06)

Status: **approved by the owner 2026-10-06** (final approval after the incremental review). Proposals 1–5 were approved incrementally on 2026-10-06, and the overtime-gap decision is option (i).

## 1. Issue summary

**Trigger:** the owner's decision (option B), made after Story 2.15's runbook and Story 2.18's registration: *"I want to automate this."*

**Context:**
- **Why births are manual today.** Since Story 2.13 (owner call 2026-10-04), the scheduled `espn` run admits only a Final Game 7. It completes a stored pending series but never creates one (`_bmad-output/specs/spec-2-13-espn-feed-adapter/SPEC.md:69`; `plan.ts:425-438`). Every series reaching 3–3 must be born by hand inside the one-to-two-day game-6 → game-7 window (`docs/PLAYOFF_RUNBOOK.md`).
- **What 2.18 was.** As registered on 2026-10-06, Story 2.18 detected a 3–3 and alerted the owner, but kept births manual.
- **The requirements drift.** The PRD still promises automation and tags the built pipeline `[PLANNED]`:
  - FR-20 (`prd.md:229-232`) and FR-21 (`:234-239`);
  - `:221` and `:363` ("without manual heroics" / "without manual work").

**Evidence: a research spike, 2026-10-06.** The owner released the no-agent-fetch rule for it. The local resolver refuses `site.api.espn.com` (`RCODE_REFUSED`, as recorded in Story 2.13's run sheet), so the probe resolved through `1.1.1.1` for itself only. It made 26 single-date `scoreboard?dates=` requests against two 2025 first-round series that went to Game 7:

| | Denver–Clippers | Golden State–Houston |
|---|---|---|
| Game 6 `competitions[0].series` | `"Series tied 3-3"`, wins 3/3, `completed: false` | same |
| Games 1–5 by walking back single dates | all found, 13 dates | all found, 13 dates |
| Six games split 3–3, Game 1 home team present | yes (DEN) | yes (HOU) |
| Errors / latency | none / 213–852 ms | none / 177–744 ms |

Findings that shape the design:
- **`wins` is ordered by competitor, not by home/away.** GS–HOU read `[0,1]` after Game 1, so wins must be read per team.
- **Walk-back dates carry other series' games too,** so concurrent backfills share fetches. **[2026-10-07, Story 2.18 pass-2 review: as built, the walks run in turn and share a per-run date cache; "concurrent" described the intended sharing, not parallel execution.]**
- **Not yet measured:** later-round headlines, Game 6s ending after midnight Eastern, and more than about 13 requests per run.

The payloads are kept for the 2.18 build in `tests/pipeline/fixtures/espn-backfill-2025/`.

## 2. Impact analysis

- **Epic 2.** It completes with a re-scoped Story 2.18 and no new stories.
  - Story 2.15's runbook becomes the fallback procedure.
  - Story 2.17's committed `series_manual.csv` stays as the manual floor.
- **Epics 3–5.** Unaffected. Epic 4's Story 4.5 (how a pending Game 7 looks on Home) receives pending rows sooner and more reliably.
- **Artifacts.**
  - **PRD:** FR-20/21 move to `[LIVE]`, and four places get dated brackets (§4, Proposal 2).
  - **Architecture:** a dated bracket on AD-5 (Proposal 3).
  - **Story 2.13's records:** `epics.md` ACs at `:443`/`:444`, `SPEC.md` (a banner) and `.memlog.md` (Proposal 4).
  - **UX:** no change.
- **Technical.**
  - **Changes:** the `espn` adapter learns births: Game 6 detection, a bounded backfill, and a previous-date re-read.
  - **Unchanged by design:** `plan.ts` (a six-game, null-winner source already plans as a birth, `plan.ts:439-457`), the RPCs (births use `pipeline_birth_series`), migrations, crons, Edge Functions, UI.

## 3. Recommended approach

**Direct adjustment:** re-scope Story 2.18 inside Epic 2.
- **Rollback:** not needed, since 2.15 and 2.17 stay useful as the fallback.
- **MVP:** unchanged, and now actually met.
- **Effort and risk:** medium effort, medium risk. The request pattern is measured on round 1 only; the risk is mitigated by the loud alert fallback and the runbook.
- **Deadline:** before the first inseason run, 2027-04-16.

**Alternatives considered:**
- **Option A, alert-only:** rejected by the owner, who wants automation.
- **A new events table that accumulates games:** rejected. It is a schema change and breaks AD-4's "no row before 3–3" rule.

## 4. Detailed change proposals (as approved)

### Proposal 1: Story 2.18 re-scoped (`epics.md`)

- **Title:** "The scheduled run births a series at 3–3". It reverses the 2026-10-04 call and two 2.13 constraints (`SPEC.md:66`, `:80`), for this backfill only.
- **Detect:** a Final Game 6 on the run's date with `competitions[0].series` `completed: false` and 3–3, **wins read per team**, and no stored row for the pair in either slot order.
- **Backfill:** games 1–5 by walking back single dates from Game 6's date, bounded at 21 dates, stopping once all are found. Each game must be Final, the same pair, and headline-numbered. There is no range parameter, and dates are shared across concurrent backfills. **[2026-10-07, Story 2.18 pass-2 review: as built, backfills run one after another; the sharing is the per-run date cache.]**
- **Birth:** an ordinary six-game source through the planner and `pipeline_birth_series`, with every AD-4/AD-5 check (3–3, `team_a` = Game 1's home). A birth is reported in the run log.
- **The alarm stays honest:** `feedSeriesCount` is the run's own date only. Neither backfill nor re-read requests count toward it (Story 2.6 D-3).
- **Overtime gap, option (i):** each run also re-reads the previous date, for Final Game 6s (births) and Final Game 7s (completions) not yet stored. That closes the overtime gap and auto-recovers a missed Game 7. It is idempotent and not counted in `feedSeriesCount`. **[Amended 2026-10-06, owner decision at the Story 2.18 code review: the completions half is withdrawn. The re-read reads Game 6s for births only and ignores Game 7s; completions come from the run's own date only, and a missed Game 7 goes back to the manual recovery. Reason: re-reading Game 7s re-planned every finished series the next morning, so a red run could come from a date the run does not own. See `epics.md` Story 2.18 and `spec-2-18-automated-births-at-three-three.md`.]**
- **Fallback, loud:** if a backfill cannot assemble a certified 3–3, nothing is born. A "birth needed" alert names the series and points to the runbook. The alert never blocks completions or the insights refresh, and it is distinguishable from a run failure.
- **Tests:** fixture-driven, using the committed 2025 spike payloads. Cases:
  - a normal birth;
  - already stored (silent);
  - 3–2 or completed (silent);
  - a missing `series` field (named);
  - a backfill gap (alert);
  - the previous-date re-read (birth and completion); **[amended 2026-10-06: birth only, with a re-read Game 7 ignored]**
  - `feedSeriesCount` unaffected;
  - per-team `wins` ordering.

  No agent fetches ESPN.
- **Unchanged:** no change to RPCs or migrations. `npm run gate` passes. Due before 2027-04-16.

### Proposal 2: PRD FR-20/FR-21 (`prds/prd-predictgame7-2026-09-22/prd.md`)

- **FR-20:** tag `[PLANNED]` → `[LIVE]`, plus a dated bracket. As built, no series row exists before a 3–3 (AD-4), so there is no bracket to initialize. The offseason runs are bounded runs of the same pipeline and alarm as FR-21 does.
- **FR-21:** tag `[PLANNED]` → `[LIVE]`, plus a dated bracket. Completions are automated (Story 2.13). Births are automated by Story 2.18 (due 2027-04-16), with backfill and a previous-date re-read. Until then, and as its fallback, births are curated per `docs/PLAYOFF_RUNBOOK.md` with a "birth needed" alert.
- **`:221` and `:363`:** a one-line dated bracket each: holds for completions now, and for births once Story 2.18 lands; the runbook is the fallback.

### Proposal 3: Architecture AD-5 (`ARCHITECTURE-SPINE.md:98`)

A dated bracket after the `espn` clause:
- `espn` completes a pending series from its Game 7, and from Story 2.18 also births one at a feed-observed 3–3.
- Games 1–6 come from a bounded single-date backfill (≤21 dates, measured at 13), plus a previous-date re-read.
- Births still go through `pipeline_birth_series` under AD-4's certified-3–3 rule.
- `feedSeriesCount` counts the run's own date only (Story 2.6 D-3).

### Proposal 4: Story 2.13's records

- **`epics.md:443`** (one fetch per run): a dated bracket. The requests are still single-date; 2.18 adds the bounded backfill and the previous-date re-read, and `feedSeriesCount` counts the run's own date only.
- **`epics.md:444`** (the 2026-10-04 "completes, never seeds" amendment): a dated bracket recording its reversal on 2026-10-06 by this proposal, measured on two 2025 series before the decision.
- **`spec-2-13-espn-feed-adapter/.memlog.md`:** three dated decision entries superseding `SPEC.md:66`, `:69` and `:80`.
- **`SPEC.md`:** one dated banner line under the title pointing at this proposal and the memlog. No body text is edited, following the spec's derive-from-memlog rule.

### Proposal 5: downstream docs and tracking

- **Into Story 2.18's ACs**, landing in the same change as the code:
  - `docs/PLAYOFF_RUNBOOK.md` is reframed as the fallback; step 1's cue becomes the alert.
  - `seriesdatasource-port.md`'s `espn` section describes the backfill and the re-read.
  - The 14 spike payloads are committed as fixtures, with provenance.
- **`sprint-status.yaml`:** rename `2-18-alert-on-new-three-three-series` → `2-18-automated-births-at-three-three` (still backlog), and replace its comment.
- **`epic-2-context.md`:** a dated note on the Post-retro "Story 2.18" bullet, plus the header re-check line.

## 5. Implementation handoff

**Scope: moderate.** It is a backlog re-scope within Epic 2 plus planning-document amendments.

- **Planning edits (Proposals 2–5b/c):** applied in this session, right after approval, as one commit.
- **Story 2.18:** built through `bmad-build` by the Developer agent. Its first build task commits the fixtures already copied to `tests/pipeline/fixtures/espn-backfill-2025/`.

**Success criteria:**
- before 2027-04-16, the scheduled run births a 3–3 series from the feed alone, verified on fixtures;
- the fallback alert fires on any backfill gap;
- `--require-feed`'s count is unchanged;
- FR-20/21 read `[LIVE]` with true text;
- no planning document still asserts "the feed does not seed" without a dated reversal.
