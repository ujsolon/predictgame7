---
title: 'Supersede in-flight predictions so a late response never paints over the live one'
type: 'bugfix'
created: '2026-09-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'f6555db5f499f5f129aee12f7ad52be3599d01e7'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-09-29.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `runPrediction` (`src/pages/PredictPage.tsx:311-372`) writes `setResult(prediction)`
unconditionally when its request resolves. Two rapid method switches — or a switch while a
request is in flight — can land the slower response last, so the card shows one method's
probabilities under another method's label. Story 1.3 already solved this class of race on the
adjacent preload path with a `seriesLoadSeq` counter (`:69`, bumped by the reset effect at
`:99-111`, checked before any state write at `:162` and `:181`); the predict path has no
equivalent, and neither Story 1.4's suite nor Story 1.5's matrix covers it (retro finding A1).
Two test-shape defects hid it: the shared harness retarget moved Story 1.4's series-path
coverage off the card body, so the card-click mouse surface is asserted only on the custom
route (A3), and one test title asserts the opposite of its body (A4).

**Approach:** mirror the existing sequence guard on the predict path — one ref, bumped by the
same reset effect and by every new attempt, checked before each state write. Restore one
card-click test on the series route so both halves of F1's rule are pinned there, and rename the
misleading title.

Decisions taken inside the existing pattern (no owner input needed, all three follow what the
preload path already does or what the reset effect already commits):

1. A superseded **success** emits no `prediction_generated` event and no success toast — the fan
   never saw that result, and the live attempt emits its own.
2. A superseded **failure** still reports to `console.error` and `captureException` (a real
   service error is worth knowing about), but never sets `predictFailure`.
3. Only the newest attempt may clear `loading`; a stale response returning mid-flight must not
   re-enable Generate while the live request is pending.
4. Any change to `selectedSeries`, `selectedMethod` or `customInput` cancels an in-flight
   prediction, because that same effect already discards a visible result — leaving the request
   live would paint a result computed from inputs the fan has since changed.

</frozen-after-approval>

## Implementation Notes

Shipped as decided; the guard ended up with **four** write points, not three.

- `src/pages/PredictPage.tsx` — added `predictSeq` beside `seriesLoadSeq` (`:70-75`), bumped it in
  the reset effect (`:122`) and at the top of `runPrediction` (`:328`), then guarded: the
  classifier-failure panel write, the success write (`if (superseded) return`, which also skips the
  toast and the `prediction_generated` event), the catch-path panel write, and the `finally`
  `setLoading(false)`.
- **Consequence found while implementing, not in the plan:** guarding only the state writes strands
  the spinner. When a method switch supersedes an attempt *without* a newer submit, nothing else can
  clear `loading`, so Generate stays disabled waiting on a response that is no longer allowed to
  paint. Fix: the reset effect now also calls `setLoading(false)` (`:111`) — the same event that
  already discards a visible result ends the wait that produced it. This is why decision 3 reads as
  "only the newest attempt owns the spinner" and the effect owns the release when there is no newer
  attempt.
- `predict-flow-regression.test.tsx` — six tests in a new
  `PredictPage superseded predictions (Epic 1 retro A1)` describe, each mutation-checked (see
  triage): stale-after-fresh success, cancel-by-method-switch without resubmit, superseded
  classifier failure, superseded throw, stale landing while the live attempt is pending, and
  cancel-by-custom-score-edit (decision 4's third dep). Local `deferred`/`flush`/`switchMethod`
  helpers stay in the file — one consumer, and `helpers.tsx` retargeting is what caused A3.
- `predict-keyboard.test.tsx` — restored the series-route card-click test (A3: both halves of F1's
  rule on `?series=`, with the attempt pinned as a series body) and renamed the A4 title.
- `npx vitest run` with each guard removed reddened exactly the tests that pin it:
  success guard → 2; failure-panel guard → 1; catch guard → 1; `finally` guard → 1; effect bump → 2
  (the two cancel-by-selection cases, leaving the four newer-submit cases green); `&& !result` → 3
  (the F1 tests on both routes).
- Gate: `npm run gate` green — lint, typecheck, 122 tests (116 → 122), build with the
  `/predictgame7/` base prefix intact.

## Review Triage Log

One pass, Blind Hunter (the only layer configured for `route: oneshot`; Edge Case Hunter and
Verification Gap are dispatch layers and were skipped).

- **Spec left `## Implementation Notes` empty** — real. Filled above. `## Spec Change Log` absence is
  `false`: the template populates it only on a `bad_spec` review loopback, and there was none.
- **Retro action items 1 and 2 still `open` in `sprint-status.yaml`** — real, and it breaks the
  owner's Epic-1 close rule (items must be closed, not merely implemented). Set to `done` with
  `sprint_status.py`; `epic-1` itself stays the owner's acceptance call.
- **Frontmatter drift: no `baseline_commit`, `AGENTS.md` missing from `context:`** — real; sibling
  specs `spec-1-4` and `spec-1-5` carry both. Added.
- **Decision 4 pinned only through a method switch** — real. Added the custom-score-edit test;
  mutation-checking the effect bump now reddens exactly the two selection-cancel tests.
- **Decision 1's toast half and decision 2's `console.error` unasserted** — the toast half is real
  and now pinned (`generatedToastMessages()`); the `console.error` half is rejected as `low`: no
  test in this repo spies console, the user-visible half of that decision (panel not painted) is
  pinned, and adding the suite's first console spy is a wider convention change than this fix.
- **Decision 3's failure side unpinned** — `false`: the `finally` is one guard shared by the success,
  failure and throw paths (each `return` inside `try` still runs it), and removing it reddens the
  "holds Generate disabled" test regardless of which path lands superseded.
- **No unmount supersession — navigating away mid-request still toasts and emits the event** — real
  but pre-existing, not caused or exposed by this change, and fixing it changes PostHog counts for a
  cross-page case no artifact has filed. Deferred to `deferred-work.md` naming the one-line shape of
  the fix, rather than silently widening this spec.
- **`deferred`/`flush`/`switchMethod` should move to `helpers.tsx`** — rejected `low`: one consumer
  today, and A3 is precisely the failure mode that shared-harness retargeting produced. `switchMethod`
  cannot be a `chooseMethod` variant either — the trigger's accessible name is the selected label,
  not "Click to choose method", which is why the shared helper only works for a first pick.
- **`superseded` captured once but re-evaluated in `catch`/`finally`** — `false`: the throw can
  happen before the flag is assigned (a rejecting `invoke` never reaches line 344), so those sites
  must re-read `predictSeq`; the early-captured flag would be `undefined`, not correct. This matches
  the preload path's per-write re-checks.
