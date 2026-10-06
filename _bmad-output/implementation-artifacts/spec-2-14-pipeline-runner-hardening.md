---
title: 'Story 2.14 — Pipeline runner hardening: the retro''s write-path findings'
type: 'bugfix'
created: '2026-10-06'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-10-06.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 2 retrospective observed two runner defects by execution against an in-memory sink (findings W3 and W1). First, `unknownFlag` (`supabase/scripts/pipeline/run.ts:123-132`) inspects only tokens that start with `--`, so `-dry-run`, `dry-run` and `—dry-run` (an em-dash pasted from a doc) each run live. Second, when a birth, follow-up or completion write throws after an earlier write in the same run filled a winner, the run exits 2 through the generic catch with no insights refresh and no recovery hint. The next run plans the landed series as skips, so nothing refreshes on their account. Finding W4: the operator usage header (`:12-14`) omits `espn`, the scheduled source.

**Approach (`epics.md` Story 2.14):**
- **Flags:** every supported flag lives in **one** list that both the refusal and its help text read. Any argv token outside that list refuses with exit 2, names the token, and opens no sink; that includes positional, single-dash, em-dash, empty and bare `--` tokens. Story 2.16 then retires `--season=` by deleting one entry.
- **Partial failure:** when a write throws after at least one winner landed in this run, the runner **refreshes the cache before exiting**, still exits 2 naming the failed write, and says the refresh ran over the landed winners. If that refresh also fails, the message carries the `--refresh-insights` recovery instead. A failure before any winner landed behaves as today.
  - **Why refresh rather than only advise:** the trigger is one-shot, so a printed hint is the only recovery path, and it depends on someone reading the issue in time. Refreshing makes the cache true for what actually landed without a human, during the playoff window, where a missed hint costs real staleness. The exit stays 2 because a write still failed.
- **Header:** the usage header lists the `espn` dry-run.
- **Waived criterion:** the `nbaCom.ts:301` AC is waived by owner call (`epics.md` Story 2.14 bracket; retro action item 10) and closes by deletion in Story 2.16.
- **Tests:** the test `FakeSink` gains a completion-failure hook, and every behaviour above is pinned with per-AC mutation evidence.
- **Unchanged:** no change to `plan.ts`'s decisions, the RPCs, any migration, the workflows or any other adapter. `npm run gate` exits 0, read from the command itself.

</frozen-after-approval>

## Implementation Notes

**Files touched:**
- `supabase/scripts/pipeline/run.ts`:
  - `SUPPORTED_FLAGS` is the one list. `isSupportedFlag` plus `unknownFlag` check every token, and `supportedFlagsHelp` generates the refusal text from the list.
  - The refusal compares `stray !== undefined`. Truthiness would have let an empty-string token through, the one case the old check also missed for a different reason.
  - The write phase counts `winnersLanded`. A throw after at least one winner landed refreshes the cache, logs the census line, and exits 2 naming the failed write. If the refresh also throws, the message carries the `--refresh-insights` recovery.
  - The usage header lists `espn`, `manual_csv` and `nba_com` with their roles.
- `tests/pipeline/run.test.ts`:
  - `FakeSink` gains `failBirthOn` / `failCompleteOn`, which fail the Nth call (1-based) so earlier writes land first. A failing call records nothing, mirroring an RPC that rejects atomically.
  - A new `Story 2.14` describe adds 13 cases: seven refused tokens, help generated from the list (usages and notes), completion-after-winner, the same with the refresh also failing, birth-after-follow-up, follow-up-after-follow-up, and failure-before-any-winner unchanged. *(The external review's patch adds a 14th: the usage-header pin, `run.test.ts` end of the describe.)*
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-14` → `in-progress` → `review`.
- `_bmad-output/implementation-artifacts/epic-2-context.md`: step 1 found the cached context stale (`epics.md` newer) and ran `compile-epic-context`, which rewrote the 33 KB hand-maintained file to 9.8 KB. The review caught the loss (finding 8), so the file was restored from `HEAD` and the post-retro material merged in as a re-check note, three story-list lines and a closing "Post-retro" section: +13/−1 against `HEAD`.
- `_bmad-output/implementation-artifacts/deferred-work.md`: one entry (review finding 1).

**Decision recorded (the AC left it to the story):** refresh, with advice as the fallback. Reasoning is in the frozen Approach.

**"One list", precisely:** `SUPPORTED_FLAGS` is the one list for *which tokens are flags* and the help text. Per-adapter applicability stays in `ADAPTER_FLAGS`, and `--season=` also appears in the refresh-path scoping check, `passedFlags` and `seasonOverride`. The frozen Approach's "by deleting one entry" is accurate for this list only. Story 2.16's AC (`epics.md`) names every other site.

**W4 has no pin:** the usage header is a comment, so it has no test and no mutation row. *(Superseded by the external fresh-context review below: a source-text pin was available and is the repo's own precedent, so the case was added with mutations M11/M12.)*

**Unchanged:** the after-loop `winnerFilled` refresh is untouched, so a fully successful run still refreshes exactly once, as before. Story 2.5's tests are green unchanged. The message prefix `unrecognised flag "<token>"` is kept, so the three existing typo pins still match.

**Mutation evidence:** each mutation was applied to `run.ts`, the suite run, and the file restored byte for byte (`diff -q`). M9 is absent: as written it replaced a string with itself, so it proved nothing and was discarded.

| Mutation | Red tests |
|---|---|
| M1: the old `--`-only check | 5 (single-dash, positional, em-dash, empty, help) |
| M2: truthiness instead of `!== undefined` | 1 (empty) |
| M3: no refresh on a partial failure | 3 (completion-after, refresh-also-fails, birth-after-follow-up) |
| M4: the follow-up winner not counted | 1 (birth-after-follow-up) |
| M5: help drops a usage | 1 (help) |
| M6: a value flag accepts an empty or whitespace-led value | 2 (`--source=`, `--source= espn`) |
| M7: the refresh-fails fallback loses its recovery text | 1 (refresh-also-fails) |
| M8: help drops the notes after the second flag | 1 (help) |
| M10: M4 re-run after the review added the follow-up case | 2 (birth-after-follow-up, follow-up-after-follow-up) |

**Gate:** `npm run gate` exit 0 (read from the command itself). It ran once before the review (588 tests) and again after the review patches: 25 files, **589 tests** (576 + 13).

## Review Triage Log

**Review layer:** Blind Hunter, a fresh-context subagent on the same model level. Its floor was N = 9 on about 68 kB, and it returned 11 findings. That was the oneshot route's only layer, so none were skipped.

| # | Finding | Verdict | Route and evidence |
|---|---|---|---|
| 1 | A winner write that commits on the server but errors on the client counts as not landed, so there is no refresh | medium | **defer** (`deferred-work.md`, last entry). Pre-existing: the old runner had the same gap. Rare: it needs a response lost after commit. The fix changes the frozen "failure before any winner landed is unchanged" rule, so it needs the owner's call. |
| 2 | "One list" is overstated: `--season` still lives in `ADAPTER_FLAGS`, `passedFlags`, the scoping check and `seasonOverride` | low | **patch (notes)**. `SUPPORTED_FLAGS` decides which tokens are flags; `ADAPTER_FLAGS` decides per-adapter applicability. These are two concerns, and a drift between them fails loudly as an unknown flag. The wording is corrected in Implementation Notes and the epic context. Story 2.16's AC already names every site. |
| 3 | `--refresh-insights --source=x` is silently accepted | false | Deliberate and pinned: `run.test.ts` "U10: the flag bypasses adapter selection — it works with the default, with --source=nba_com…" (owner decision U10). |
| 4 | The help test doesn't prove generation: notes are unasserted | low | **patch**. The test asserts every `note`; M8 shows it red. |
| 5 | No test for a follow-up failing after an earlier winner | medium | **patch**. Added the follow-up-after-follow-up case; M10 reddens both follow-up tests. |
| 6 | The refresh-fails-too test is weaker than its sibling | low | **patch**. It now asserts `sink.calls`, `sink.completions`, and the absence of the success wording in both log streams. M7 shows the recovery text pinned. |
| 7 | No applied/unapplied summary on a partial failure | low | **reject**. Every landed write already logs a `wrote …` line before the failure. A summary is new reporting, not a correction. |
| 8 | `epic-2-context.md` was regenerated wholesale, losing about 23 kB of hand-maintained facts | medium | **patch**. Confirmed: the old header says "Hand-maintained … No regeneration script exists". The file was restored from `HEAD`, and the post-retro material merged in (+13/−1). The regenerated copy is in the session scratchpad only. |
| 9 | The regenerated context is stale on the refresh decision | low | **patch**. Superseded by 8: the merged "Post-retro" section states the decision. |
| 10 | Spec bookkeeping: `context:` misses `epics.md`, Files touched misses two files, W4 is unpinned, missing mutation rows | low | **patch**. All four are corrected above. |
| 11 | The recovery command is duplicated; magic `+ 3` in `isSupportedFlag` | low | **patch**. Added `REFRESH_RECOVERY_COMMAND`, and `hasValue(arg, prefix)` slices by the prefix it tested. |

## Review Triage Log — external fresh-context review (2026-10-06, four layers)

Owner-run in a fresh session on a different model, on `d9fc182`. Layers: blind hunter, edge-case hunter, verification-gap, acceptance auditor (full mode, this spec plus `epic-2-retro-2026-10-06.md` and `epics.md` Story 2.14). "Rejected" means adjudicated against the code, not dismissed. The verification-gap layer returned **no findings** after tracing every argv supplier in the repo and running the suite itself (94 targeted, then 25 files / 589 tests green); the acceptance auditor independently re-measured the gate claim, the refusal-before-sink ordering, the FakeSink atomicity and the `+13/−1` epic-context reconciliation, and found the four functional ACs implemented as frozen. No finding is an `intent_gap` or `bad_spec`, so no loopback and `review_loop_iteration` stays 0.

| Finding | Verdict | Evidence / disposition |
|---|---|---|
| BH-5 / AA-3 — the W4 header AC has no pin, so the defect this story exists to fix can return with every gate green | **low — PATCH APPLIED (this step)** | Real. `run.ts:12-15` is the only place the operator learns `espn` is the scheduled source, and it is a comment: an edit that drops the line reddens nothing. Retro W4 *is* that omission, observed in the shipped file. Repo precedent pins source shape exactly this way — `tests/pipeline/insights-refresh.test.ts:11-16` and `workflows.test.ts` `readFileSync` + regex over `run.ts` / the YAML (retro A4), and AGENTS.md' evidence discipline refuses "no harness can see it". **Patch:** one case added to the Story 2.14 describe of `tests/pipeline/run.test.ts` — it reads `run.ts` and asserts a `run.ts --source=<name> --dry-run` usage line for every *implemented* entry of `ADAPTER_REGISTRY`, then pins the `espn` line's `(the scheduled source)` label, the fact the loop itself cannot state. The registry supplies the names rather than a hand-kept list, so an adapter added without a usage line reds here, and Story 2.16's retirement needs no edit to this test. **Mutation evidence:** M11 deleted the `espn` header line → exactly this case red (`to contain 'run.ts --source=espn --dry-run'`); M12 relabelled `(the scheduled source)` → exactly this case red (`to match /--source=espn --dry-run\s+\(the scheduled…/`). `run.ts` restored byte-identical after each (`git diff --exit-code` clean), so no mutation residue. **Gate re-run after the patch: `npm run gate` exit 0, read from the command itself** — 25 files, **590 tests** (589 + 1), build green. |
| BH-1 / BH-4 — `epic-2-context.md` under-records Story 2.14: the execution sequence at `:30` still ends `… → 2.12 → 2.13 → 2.7`, and the one-line bullet at `:26` omits the refresh-fails fallback and the dated `nbaCom.ts:301` waiver | **low — defer** | Both true as read, and both are agent-context-file edits, so they are out of this story's patchable surface. The substance they would restate is already recorded — ordering at `:28` ("after 2.14"), fallback at `:77`, waiver at `:76` — so no reader is misled. Deferred with owner and home. Re-checked after the owner's Story 2.15 commit (`e7ba090`) landed mid-review: both lines are unchanged there, so the defer still stands. |
| AA-4 — `epics.md` Story 2.16's AC cites `run.ts` line numbers that this commit moved (`:77` ADAPTER_FLAGS → `:86`, header `:16-21` → `:12-15`, "help text `:196-202`" → generated at `:194-198`, scoping `:256` → `:314`, `passedFlags` `:288` → `:346`, `seasonOverride` `:340` → `:398`), and help text is no longer an independent edit site | **low — defer** | Verified against both files. The finding this weakens is Story 2.16's, whose AC already names every *site* by name as well as by number, and the substance holds: `--season` still appears at four sites (`ADAPTER_FLAGS` `:86`, scoping `:314`, `passedFlags` `:346`, `seasonOverride` `:398`). Fix edits `epics.md` — the planning artifact Story 2.16 rewrites anyway. Deferred to Story 2.16, whose first act is re-deriving those anchors from the file as it stands. |
| ECH-3 — `sink.refreshInsights()` on the new partial-failure path (`run.ts:484`) has no client timeout, so a hung refresh never reaches exit 2 | **low — defer (pre-existing)** | Refuted where it would matter: a scheduled run cannot hang silently — `pipeline-inseason.yml:138` sets a **step** ceiling of 10 minutes, and the workflow's own comment at `:99-103` states that a step timeout FAILS (so `if: failure()` fires the alarm) while only a *job* timeout cancels quietly. What remains is a local operator run hanging on the console, which is the identical exposure of the frozen Story 2.5 path (`:514`) and of every `await` in the runner — no RPC in `writer.ts` carries a timeout. Pre-existing, cross-cutting, and it belongs to the whole-write-path review (retro action item 3), which already owns this story's write-path residue. |
| BH-10 — the new `deferred-work.md` entry names no dated owner in its neighbours' `Owner: …, before …` shape | **low — handled by this review** | True of the entry's wording. Rather than defer a doc edit, the entry appended by this review carries the owner line explicitly, so the debt has a home and a trigger. |

**Rejected:**
- false: "bare `--` may be consumed by node before `argv.slice(2)`, so the refusal is test-only" (ECH-1). Measured on this machine: `node argvtest.mjs --dry-run -- --source=espn` → `["--dry-run","--","--source=espn"]`. Node passes `--` after the script path through verbatim, so the pinned refusal (`run.test.ts:1082-1106`) is the operator behaviour.
- false: "`SUPPORTED_FLAGS` is exported mutable, breaking the one-list invariant" (BH-9). No writer exists — the only readers are `run.ts:175`, `:195`, `:196` and `run.test.ts:1112-1113`, and the type is `readonly SupportedFlag[]`. Drift would need an author, not a mutation.
- false: "a value flag with trailing whitespace is silently interpreted" (BH-7). The documented rule is "a value that does not start with whitespace" (`:131-133`), and `hasValue` (`:170-172`) implements exactly that; a trailing space fails loudly — `--source=espn ` reaches `assertAdapterImplemented`'s "not a recognised adapter" (`port.ts:193-197`) and `--csv=<path> ` the file read.
- false: "valid flag forms are not pinned as accepted, only refusals are" (BH-6). Every list entry's accepted form is executed: `--dry-run`, `--refresh-insights` (18 cases), `--require-feed` (16), `--source=`/`--csv=` in `run.test.ts`, and `--season=2026-27` carried to the wire at `nba-com.test.ts:915`.
- false: "`review_loop_iteration: 0` contradicts a populated triage log" (AA-2). The field counts **loopbacks**, not review passes — `spec-2-12:125` and `:157` record a patching review that ran, patched and re-verified with the field staying 0, and this review produced no `intent_gap` either.
- false: "`epic-2-context.md` contradicts itself by saying no regeneration script exists and then describing one" (BH-2). The header's "no regeneration script" is about a repo script; the run it records is the `compile-epic-context` **skill** invocation, which the same sentence names and explains as reverted.
- low: "the partial-failure message should name the landed series" (BH-8). Each landed write logs its own `wrote completion <label> on series <id>` line (`:469`, `:475`) before the failure, so the identification exists in the run's output. This is new reporting, not a correction — the same disposition as the pass-1 row 7.
- low: "wrap the census `log()` in try/catch so a throwing logger cannot mask the write failure" (ECH-2). It requires a `log` that throws; production's is `console.log` (`:253`), tests inject a recorder, and every log site in the file (`:330`, `:439`, `:493`, `:526`, `:531`) shares the shape. A guard for a state no caller supplies.
- rejected (spec edit): frontmatter `status: 'done'` vs sprint-status `review` (BH-3 / AA-1). Same rejection as `spec-2-12:212`; this review's status step re-syncs it, and per P3 the flip to `done` is what the step does, not the build commit.
- rejected (spec edit), but the claim is real: the mutation table's **M3 = 3 red tests** is now **4** (AA-5). Statically confirmed — the review-added follow-up-after-follow-up case asserts `sink.calls` ends with `refreshInsights` (`run.test.ts:1174-1183`), so "no refresh on a partial failure" reddens it too, exactly as M4 needed M10. The table row was run pre-review; the correction belongs in this file, and the status step should carry it rather than a re-run being assumed.
- out of scope: the auditor's note that the working tree shows `sprint-status.yaml` re-modified plus untracked `spec-2-15` / `docs/PLAYOFF_RUNBOOK.md`. That is the owner's concurrent Story 2.15 session sitting on top of `d9fc182`, not part of this diff.
