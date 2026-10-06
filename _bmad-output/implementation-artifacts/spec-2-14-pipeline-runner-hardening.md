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
  - A new `Story 2.14` describe adds 13 cases: seven refused tokens, help generated from the list (usages and notes), completion-after-winner, the same with the refresh also failing, birth-after-follow-up, follow-up-after-follow-up, and failure-before-any-winner unchanged.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: `2-14` → `in-progress` → `review`.
- `_bmad-output/implementation-artifacts/epic-2-context.md`: step 1 found the cached context stale (`epics.md` newer) and ran `compile-epic-context`, which rewrote the 33 KB hand-maintained file to 9.8 KB. The review caught the loss (finding 8), so the file was restored from `HEAD` and the post-retro material merged in as a re-check note, three story-list lines and a closing "Post-retro" section: +13/−1 against `HEAD`.
- `_bmad-output/implementation-artifacts/deferred-work.md`: one entry (review finding 1).

**Decision recorded (the AC left it to the story):** refresh, with advice as the fallback. Reasoning is in the frozen Approach.

**"One list", precisely:** `SUPPORTED_FLAGS` is the one list for *which tokens are flags* and the help text. Per-adapter applicability stays in `ADAPTER_FLAGS`, and `--season=` also appears in the refresh-path scoping check, `passedFlags` and `seasonOverride`. The frozen Approach's "by deleting one entry" is accurate for this list only. Story 2.16's AC (`epics.md`) names every other site.

**W4 has no pin:** the usage header is a comment, so it has no test and no mutation row.

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
