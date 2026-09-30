---
title: 'Gate the server side — Edge Function type-check and input validation'
type: 'story'
created: '2026-09-30'
status: 'review'
route: 'story'
story: '2-0-gate-the-server-side-edge-function-type-check-and-input-validation'
baseline_commit: '403dd66'
closes:
  - 'deferred-work.md D1'
  - 'deferred-work.md D2'
  - 'epic-1-retro action item 5'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the AD-2 contract has one producer and one consumer, and only the consumer is
gated. `tsc -b` covers `src` + `vite.config.ts` and Biome's `files.includes` is `src/**` +
`tailwind.config.js`, so nothing in this repo ever type-checks or lints
`supabase/functions/**` (D1). `predict-game-7` annotates `const input: PredictionInput =
await req.json()` — a cast over unvalidated JSON — and its branch chain's final `else` is
logistic regression, so `{"method":"bayesian"}` returns a logistic answer labelled `bayesian`
(D2); non-numeric `game_N_score_*` flows through the arithmetic and serialises NaN probabilities
as `null`, which the client renders `null%`; and a self-vs-self custom matchup computes a
successful 50/50. Epic 2's pipeline, Epic 3's `handle-contact` work and Epic 4's `share-og` all
write more server code into that ungated directory, so this story runs first.

**Approach:** two halves, one commit each is fine but they land together. (1) Make the server
graph checked: a CI-only `deno check` step over `supabase/functions`, plus Biome's includes
widened over the same paths. (2) Make the wire honest: validate the request body at the
boundary through one pure, platform-free module, answer every rejection with the existing
`{ "error": string }` envelope at 400, and type both failure shapes in `contract.ts` so the
single source of truth documents the failure wire, not only the success path.

## Decisions (owner-confirmed 2026-09-30, at the Epic 2 prerequisite check)

1. **CI-only Deno.** The owner declined a local Deno install. `npm run gate` keeps its four
   commands; the `deno check` step exists only in CI; README and AGENTS.md say plainly that a CI
   run is the first evidence that step can produce, rather than implying a local check.
2. **The check step must not ship red.** `predict-game-7/index.ts:370-375`'s `catch (error)` →
   `error.message` is one `TS18046` under a strict pass (re-verified at this baseline;
   `handle-contact:99` already narrows). It is narrowed in the same commit that adds the step.
3. **One checker per surface, no second style authority.** Deno *checks types* only — no
   `deno lint`, no `deno fmt`. Biome stays the single linter and gains the `supabase/**` paths.
4. **The client's failure display is out of scope.** The 400 strings surface verbatim in the
   retry panel through `classifyInvokeError`'s `server` arm (`src/lib/error-envelope.ts:143-147`).
   This story writes those strings so they read as copy; it does not re-shape the panel.

## Boundaries — Never

- **Never change a successful response.** For a conforming request, all four methods' bodies stay
  byte-identical, including field order and both `contributing_factors` builders.
- **Never alter the existing 400** (`'Team names are required'`) or the 405/OPTIONS handling in
  `handle-contact`; this story *adds* 400 rows beside them.
- **Never add runtime code to `_shared/contract.ts`** — its header states pure type declarations
  only, which is what keeps one file importable by both the Deno graph and the frontend type
  graph (AD-2). New runtime code goes in a separate `_shared/` module (Decision 5 below).
- **Never widen the gate to require local Deno**, add a Deno test harness, or touch
  `npm run gate` / `pre-push` / `nightly-gate.yml`.
- **Never deploy or migrate.** `supabase functions deploy predict-game-7` is owner-authorized
  only (AGENTS.md), and no database work exists in this story.
- **Never store a secret** or read one into client-visible paths (NFR-S1).

</frozen-after-approval>

## Design Notes

**Decision 5 — where the validator lives, and why both harnesses can reach it.** The rules must
be tested in Vitest (that is the repo's only local test harness) *and* run inside the Deno
function, and those two resolve imports differently: Deno requires the `.ts` extension on a
relative import, and `tsc -b` rejects `.ts` extensions without `allowImportingTsExtensions`. So
the shared module imports **nothing** — no `contract.ts` — and takes the accepted-slug list as an
argument. `index.ts` owns the one line that ties that list to the contract type.

Drift is then caught in both directions, each by the harness that can see it:

| Drift | Caught by |
|---|---|
| A slug in the list that is not a `MethodSlug` | `deno check` in CI (`satisfies readonly MethodSlug[]` in `index.ts`) |
| A `MethodSlug` missing from the list | `npm test` — `ACCEPTED_METHOD_SLUGS` vs `Object.keys(METHOD_LABELS)`, which is `Record<MethodSlug, …>` and so exhaustive by construction |
| A renamed `PredictionResult` field, or an off-contract `confidence_level` | `deno check` in CI |

**Decision 6 — the 400 vocabulary, in check order.** Four rows, one envelope:

| Order | Condition | `error` string |
|---|---|---|
| 1 | body is not a non-null, non-array object; or `team_a`/`team_b` is not a non-empty string after trim | `Team names are required` — **existing string, reused**, not a new one |
| 2 | `team_a` and `team_b` are the same team, compared trimmed and case-folded | `Team A and Team B are the same team. Pick two different teams to predict.` |
| 3 | any of the twelve `game_N_score_*` is absent or not a finite number | `Game scores for games 1-6 must all be numbers. Invalid: <offending keys in field order>` |
| 4 | `method` present and not one of the four slugs | `Unknown prediction method "<value>". Accepted methods: logistic_regression, bayes, elo, exponential_smoothing` |

Absent `method` keeps defaulting to `logistic_regression` (that is the success path, unchanged).
A non-object body reuses row 1 rather than gaining a fifth string, so the vocabulary stays four
long. Order puts identity errors before data errors, matching how the client's own custom-form
validation reads the grid top-down.

**Decision 7 — two deliberate widenings, both reject-only.** (a) Row 2 compares trimmed and
case-folded, not by literal `===` as the AC worded it, because the rule's purpose is "you cannot
play yourself" and a real fan can type `Celtics` and `celtics`; two genuinely different NBA teams
never differ only by case or padding, so no valid request is newly rejected. (b) Names must now
be non-empty **strings**: `{"team_a":123}` previously produced a 200 and now produces row 1. Both
are reachable only by a non-browser caller except row 2, which a fan can hit.

**Decision 8 — what stays a 500.** A malformed JSON body still throws at `req.json()` and is
caught by the outer handler, as today. Mapping it to 400 would be a new response class the AC
does not list, and the client already renders it as a service failure. The 500 arm's shape is
typed (`PredictionError`) and its message narrowed, which is all Decision 2 requires.

**Decision 9 — `home_team`, `series_id`, `parameters` are not validated.** The contract marks the
first and third as ignored by the function, and `home_team` only shifts a sign; rejecting them for
shape would be new behavior with no recorded requirement behind it. Recorded here so the absence
is a choice, not an oversight.

## Code Map

| File | Change |
|---|---|
| `supabase/functions/_shared/predict-request.ts` | **new.** Import-free, platform-free. `ACCEPTED_METHOD_SLUGS` (as-const tuple), `validatePredictionRequest(body, acceptedSlugs): string \| null`, `SCORE_FIELDS`. |
| `supabase/functions/_shared/contract.ts` | `PredictionError` — the `{ error: string }` failure wire for both 400 and 500. Types only; the header's rule holds. |
| `supabase/functions/predict-game-7/index.ts` | `await req.json()` becomes `unknown` → validated; one `errorResponse(status, message)` helper typed against `PredictionError`; `satisfies readonly MethodSlug[]` alignment line; `catch (error)` narrowed (D2/Decision 2). Success path untouched. |
| `.github/workflows/ci.yml` | New final step: `actions/setup-deno` + `deno check` over the functions, echoing the resolved file list so a silently-short glob is visible in the log. |
| `biome.json` | `files.includes` gains `supabase/functions/**/*.ts`. Measured, not assumed: 100 → 105 files checked (the three existing function files — `predict-game-7/index.ts`, `handle-contact/index.ts`, `_shared/contract.ts` — plus the new shared module and the new Vitest file), clean, **no overrides needed**. |
| `src/types/__tests__/predict-request.test.ts` | **new.** Pins all four 400 strings byte-exact, the accepted-vs-labelled slug parity, and the conforming-request passes. |
| `scripts/probe-predict-contract.mjs` | **new.** Stateless wire probe, `--expect=baseline\|validated`, exit-non-zero on a mismatch. Baseline mode encodes the pre-deploy answers so D2's evidence is committed code, not prose; validated mode is the post-deploy proof and the success-path body-equality check. |
| `README.md`, `AGENTS.md` | Name the CI-only server check and what it does not cover locally. |
| `docs/CHANGELOG.md` | **not touched by this story.** The repo has no `Unreleased` section — every entry lands in the same commit as a version bump (AGENTS.md · Versioning). The four new 400 rows are contract-visible to API callers, so they belong in the next release entry, and this spec is where that gets recovered from. |

## Spec Change Log

Nothing in the frozen Intent or the Never boundaries changed. Four corrections the work itself
forced, all outside the frozen block:

1. **`docs/CHANGELOG.md` dropped from the Code Map.** The plan promised an `Unreleased` entry; the
   repo has no such convention — `git log -S Unreleased -- docs/CHANGELOG.md` is empty and every
   entry lands in the same commit as a version bump (AGENTS.md · Versioning). The 400 vocabulary is
   contract-visible, so it belongs in the next release entry, pointed at from here.
2. **A probe script was added** (`scripts/probe-predict-contract.mjs`) that the Code Map did not
   list. Verification item 3 needs wire evidence twice, and an ad-hoc `curl` loop is not
   repeatable — the first attempt this session failed silently (HTTP `000` through a `node -e
   require()` on a Git-Bash `/tmp` path Node cannot see) and would have been reported as "no
   baseline available" without a committed harness.
3. **"All eleven `PredictionResult` keys" narrowed.** Measured: `team_a_logo`/`team_b_logo` are
   optional in the contract and are dropped from the JSON entirely when the `teams` lookup misses —
   a whitespace team name returned a body with ten keys. Whole-masked-body comparison replaced the
   key count, so the check holds whichever way the lookup goes.
4. **D2's "self-vs-self computes a 50/50" was wrong as measured.** The live function returns
   `61.77 / 38.23` for `team_a === team_b`, because `home_advantage` compares `home_team` against
   `team_a` first and a self-matchup still scores the full `+1`. The closure text in
   `deferred-work.md` now carries the measured values instead of the inherited claim.

## Verification

1. `npm run gate` — **measured green on the final tree: exit 0**, lint "Checked 105 files",
   `tsc -b` clean, Vitest `Test Files 12 passed` / `Tests 132 passed`, build succeeded with the `/predictgame7/` asset
   prefix. The new Vitest file is the behavioral proof for the vocabulary. Re-run after the code
   review's five patches landed, and the numbers above are that later run.
   Run it as `npm run gate` and read its exit code: `npm run gate | tail -30` reports **tail's**
   status, so a red gate behind a pipe reads as green — hit for real while writing this story, and
   the reason the numbers above come from an unfiltered run (`exit 0`, then the summary lines
   grepped out of the saved log).
2. **The `deno check` claim is not locally provable** (no Deno by design) and must not be
   reported as passing. Its first evidence is the CI run on `master` after the owner pushes. The
   locally-checkable substitute for the same files: Biome parses and lints all three, which is
   run here.
3. Wire proof — `scripts/probe-predict-contract.mjs`, run twice, before and after the owner
   redeploys. Nothing here depends on timing: each probe is one request against a fixed body.

   **Baseline, measured 2026-09-30 against the deployed function**
   (`--expect=baseline`, fourteen rows — six rejections plus four method successes against each
   of the two fixtures — all matched, exit 0):

   | Shape | Deployed answer | Consequence today |
   |---|---|---|
   | no `team_a`/`team_b` | `400 {"error":"Team names are required"}` | the only rejection that exists |
   | `team_a: "   "` | `200`, `predicted_winner: "   "` | a whitespace name is painted as the winner; its `team_a_logo` key is absent entirely |
   | self-vs-self | `200`, both logos `celtics.png` | a 50/50 presented as an analysis |
   | `game_3_score_b: "abc"` | `200`, `win_probability_a: null` | the client's shape check rejects it → "returned an unreadable result", not the real cause |
   | `game_6_score_b` absent | `200`, `win_probability_a: null` | same |
   | `method: "not_a_method"` | `200`, logistic maths, `method_used: "not_a_method"` | off-contract label; also rejected by the client as unreadable |

   The eight method successes — four against the custom-matchup fixture (`BASE`) and four against
   a series-shaped one (`SERIES_BASE`: a real stored 2026 Western Conference Final series, its
   `series_id`, both teams' `full_name` values and its six actual game scores, read from the live
   tables through the same mapping `PredictPage.tsx:284-312` uses) — return all eleven keys with
   identical bodies across runs (masked on `computation_time_ms`), so the recorded strings double
   as the "never change a successful response" reference for the post-deploy run. Note the
   logo caveat: `team_a_logo`/`team_b_logo` are dropped from the JSON when the
   `teams` lookup misses, so eleven keys present is a property of these fixtures' four known
   teams, not of the shape — the probe compares whole masked bodies, which
   holds either way.

   **After the owner redeploys** (`--expect=validated`): the same six bodies must give
   the four 400 rows byte-exact, and the eight method successes must still match their
   recorded masked bodies. A stale deployment cannot pass this — the six rejection rows
   are exactly the ones it answers differently. Already demonstrated from this side of
   the deploy: `--expect=validated` run on 2026-09-30 against the still-undeployed
   function exits **1 with five FAIL rows** (blank name, self-vs-self, non-numeric
   score, missing score, unknown method — each "expected 400, got 200") while the
   missing-names row and all eight successes stay `ok`. So the probe is proven capable of
   going red on precisely the rows Story 2.0 changes, and the deployment gap is measured
   rather than assumed.

   The probe lives in `scripts/`, which Biome's `includes` allowlist does not cover (same
   as `measure-predict-latency.mjs`); it is checked here by `node --check` and by running
   both modes. Widening Biome over `scripts/**` is out of this story's scope.

4. Two deliberate mutation checks, **run and reported, not assumed**, each reverted and the tree
   re-verified afterward:

   | Mutation | `npm run lint` | `npm run typecheck` | `npm test` | CI `deno check` |
   |---|---|---|---|---|
   | `PredictionResult.method_used` renamed in `contract.ts` | exit 0 — blind | **exit 2, 8 errors** (`PredictPage.tsx:1206,1213` TS2339/TS7053; `prediction-contract.test.ts:87,91` TS2353/TS2339) | exit 0 — 8 files / 78 tests still pass (`src/lib` + `src/types` run under the mutation) | would redden on the function's result literal, which enters the Deno program and not the `tsc` one |
   | `predict-game-7/index.ts:382` emitting `confidence_level: 'Very High'` | exit 0 — blind | exit 0 — the file is not in the program | exit 0 — 8 files / 78 tests pass | **the only step that can see it** (TS2322 against `ConfidenceLevel`) |

   So the honest scope of the new step is the second row plus the producer half of the first:
   `contract.ts` was *already* locally type-checked transitively through `src/types/prediction.ts`
   (Story 1.2), which is why row 1 is not the story's win — row 2 is. Both `deno check` cells are
   **what the step claims, not a measurement**: Deno is not installed here by owner decision, so
   the column is reasoned from `tsc` semantics on the same source and its first real evidence is
   the CI run after the owner pushes. Verification of the revert:
   `grep -c "Very High"` = 0, `method_used: MethodSlug` present, `npm run typecheck` green.

## Handoff — what this story cannot close from here

Two owner-gated actions remain, and the story stays at `review` until both have run, because each
produces evidence no agent can generate locally:

1. **`supabase functions deploy predict-game-7 --project-ref zfhtbamvmqztvztyokyf`** — the four new
   400 rows are source on `master` only. Immediately after, `node scripts/probe-predict-contract.mjs
   --expect=validated` must exit 0; today it exits 1 with five FAIL rows, and that difference *is*
   the deployment gap.
2. **`git push origin master`** — runs the `pre-push` gate, then the CI job whose `deno check` step
   is the first evidence that step exists. Watch the step's own file list in the log: it must print
   `Checking 4 files`. If the step is red, the story is not done — a red `deno check` is exactly the
   failure class it was added to catch, and this one ships unrun.

Then the independent review pass (different model, fresh session) that every story here gets before
`done`.

Deferred by name, each with its home recorded in `deferred-work.md`:

- Retry as the primary action on a deterministic input 400 → Story 4.4, beside D3.
- The gate-exit-code-behind-a-pipe trap → an owner call on one AGENTS.md clause.
- `scripts/**` is outside Biome's `includes` allowlist (deliberately, as it has been for
  `measure-predict-latency.mjs`), so the probe is linted by nothing; not routed as debt — if the
  owner ever wants the dev toolchain linted, that is a `biome.json` call, not a story.
- `supabase/scripts/**` has no checker → Story 2.3, so 2.3 cannot inherit a closed-looking D1.

**Third owner-gated item, added by the review pass and AC-blocking:** the docs must state that
`deno check` needs network egress and inherits third-party availability (epics.md line 287 asked
for this verbatim). It is the owner's to write — AGENTS.md reserves agent-context edits — and it
belongs at this story's acceptance, not in a later story; `deferred-work.md` carries it with that
deadline. Until it lands and the two actions above have run, the status stays `review` rather than
advancing to `done`: the review's two `decision-needed` findings are resolved and all five `patch`
findings are applied and re-verified, but a story whose AC has an unmet clause cannot be marked
complete on the strength of its code.

### Review Findings

Owner-side review run 2026-09-30 (bmad-code-review, diff `403dd66..b0e3f82`, layers: blind-hunter,
edge-case-hunter, verification-gap, acceptance-auditor). All four layers returned findings; each
claim below was re-checked against the tree at `b0e3f82` before it kept its verdict, and the one
claim that needed an experiment got one (see Defer 2).

**Decision needed:**

- [x] [Review][Decision] The 500 fallback string deviates from the guard the epic's own owner-call bullet named — epics.md line 286 says narrow it as `error instanceof Error ? error.message : String(error)`; `index.ts:398` ships `error instanceof Error ? error.message : 'Unexpected server error.'`. The deviation is deliberate and reasoned in the D1/D2 closure text (`String(error)` could put `[object Object]` in front of a fan through `classifyInvokeError`'s verbatim `server` arm), and Decision 8's frozen requirement — shape typed, message narrowed — is met either way. — **owner ratified the deviation 2026-09-30: `'Unexpected server error.'` stands as the intended copy and epics.md line 286's `String(error)` is superseded for this arm. No code change.** Ratified here rather than in `deferred-work.md` because nothing is owed; recorded so the next review does not re-file it, on the precedent of the Story 1.4 `getRoundImportance` predicate ratification.
- [x] [Review][Decision] AC line 280's second verification surface has no wire evidence — "the success path is unchanged for all four methods, verified against a historical series **and a custom matchup**". `probe-predict-contract.mjs:59-64` sends one fixture (`BASE` = names + `home_team` + twelve scores, **no `series_id`**), and all four success rows reuse it. Verified on the server: `series_id` appears nowhere in `predict-game-7/index.ts` and `contract.ts:21-22` marks it ignored, so there is no distinct historical-series code path in the function — the gap is in the evidence, not in the risk. — **owner chose option 1 (add a series-shaped probe row) 2026-09-30**, over recording the code-path equivalence or a hand-driven browser check: the AC named two surfaces, so both get wire evidence even though the function treats them identically. Moved to the patch list below.

**Patch:** all five applied 2026-09-30, then re-verified (`node --check`, both probe modes, `npm run gate` exit 0 on the patched tree, three mutation runs).

- [x] [Review][Patch] AC line 280's historical-series surface has no probe row — from the Decision above: add one success fixture built from a real stored series (its `series_id`, its teams' `full_name` values, its six actual game scores) and record its masked baseline body alongside the other four, then re-run `--expect=baseline` so the new row's pre-deploy answer is committed evidence too. [scripts/probe-predict-contract.mjs:59-64, 112-121, 224-237] — **applied:** `SERIES_BASE` is the 2026 Western Conference Final (OKC vs SAS, `series_id` `6ecb170c-e781-47f8-b7ee-881ba719d6d5`, six real game scores, `home_team` OKC), read from the live `series`/`teams`/`series_game_scores` tables through the same mapping `PredictPage.tsx:284-312` uses, with its provenance recorded in a comment above the fixture. Its four masked success bodies were captured from the deployed function, so they are pre-deploy evidence rather than expected output. The success loop now runs 2 fixtures × 4 methods; **`--expect=baseline` passes fourteen rows at exit 0** and **`--expect=validated` still exits 1 on exactly the five rejection rows**, so the patch did not dull the probe's red-capability.

- [x] [Review][Patch] A non-string `method` can put `[object Object]` in front of a fan — `predict-request.ts:77` renders the offending value with `String(method)`, so `{"method":{"a":1}}` answers `Unknown prediction method [object Object]. Accepted methods: …`, surfaced verbatim by the retry panel. The same story rejects that exact output as the reason for the 500 arm's fallback copy (deferred-work D1 closure), and Decision 6's table only ever shows a string value. [supabase/functions/_shared/predict-request.ts:75-79] — **applied:** `JSON.stringify(method)`, plus a test that an object method renders as `{"slug":"bayesian"}`. Mutation-checked: reverting to `String` reddens that test.
- [x] [Review][Patch] The probe's own failure paths misreport instead of failing a row — five members, all in the script the story promotes to *the* post-deploy evidence: `:174-185` parse the 200 bodies for `nullProbabilities`/`methodUsed` outside any try/catch, so a non-JSON 200 aborts the run at exit 2 with the remaining rows never executed (`:163-169` guards the 400 path correctly); `:170` tests `if (parsed && …)`, so a 400 whose body is falsy JSON (`null`) skips the envelope check and reports `ok`; `:216` prints any status outside {200,400} as `200 body (masked) …`, so a 502 reads as a success line; `:245-248` read `error.message` off an `unknown` catch — the pattern this story deleted from `index.ts`; `:144` has no `AbortSignal.timeout`, so a connection that is accepted but never answered leaves the owner with no verdict at all. [scripts/probe-predict-contract.mjs:143-248] — **applied, all five:** one try/catch parse covering both statuses (a non-JSON body now reports a FAIL row and the run continues), the envelope check no longer guarded by a truthiness test, the body column derived from the status instead of assuming 200, `error instanceof Error ? error.message : String(error)` in the top-level catch, and `signal: AbortSignal.timeout(20000)` on `post()`.
- [x] [Review][Patch] The slug-parity drift check is order-sensitive — `expect([...ACCEPTED_METHOD_SLUGS]).toEqual(Object.keys(METHOD_LABELS))` reddens when someone reorders `METHOD_LABELS` with no slug added, removed or renamed, so a drift signal is indistinguishable from a cosmetic reshuffle of a display map. Sort both sides (or compare sets) so it fires only on real drift. [src/types/__tests__/predict-request.test.ts:40] — **applied:** both sides sorted. Mutation-checked both ways: reordering `METHOD_LABELS` now leaves this file green while `prediction-contract.test.ts:33-65` — the suite that owns key order, and where the reorder genuinely breaks `METHOD_MATHS_ANCHORS` expectations — reports 3 failures; dropping `'elo'` from `ACCEPTED_METHOD_SLUGS` still reddens this drift check.
- [x] [Review][Patch] AC line 269's pipeline-checker clause is unrecorded, and D1 was stamped CLOSED over it — the AC requires the story to name a checker per directory under `supabase/` and, if Story 2.3's runner lands Python, to record the remaining gap explicitly "rather than left for D1 to silently reopen". `supabase/scripts/load-games/` is `main.py` + `requirements.txt` — that precedent is live — and neither the new `deno check` glob (`supabase/functions/**/*.ts`) nor Biome's widening reaches `supabase/scripts/**`. No artifact this diff touched names the directory. Fix is the recording, not the decision: a `deferred-work.md` entry that puts the `supabase/scripts/**` checker with Story 2.3, so 2.3 cannot inherit a closed-looking D1. — **applied:** recorded as the first bullet of this review's section in `deferred-work.md`, naming `supabase/scripts/**` and Story 2.3 as its home, and explicit that whether 2.3 checks Python at all is still the owner's call. It stays out of the spec's Deferred list above, which holds only the four findings triaged as defer.

**Deferred:**

- [x] [Review][Defer] `deno check` inherits third-party availability and the docs never say so, as AC line 287 required verbatim — the two functions pull deps three ways (`jsr:@supabase/supabase-js@2`, `https://esm.sh/…`, `https://deno.land/std@0.168.0/http/server.ts`) with no `deno.json` or lockfile, and the step floats `deno-version: v2.x`, so an upstream type release can redden `master` with no repo change and the step's "first evidence" run need not match later ones. Measured: zero occurrences of `network`/`egress`/`hermetic`/`third-party`/`jsr`/`esm.sh`/`deno.land` in README's new section, AGENTS.md's new bullet, or the ci.yml comments. [README.md:116-131, AGENTS.md verification gate, .github/workflows/ci.yml:36-56] — deferred: the fix edits AGENTS.md, which AGENTS.md reserves to the owner. **AC-blocking for `done`**, not optional polish.
- [x] [Review][Defer] README and AGENTS.md overstate the local blindness — "Their types are checked by a `deno check` step in CI … and nowhere else" and "type-checked only in CI" are inaccurate for 2 of the 4 files: `tsc -b` does check `_shared/predict-request.ts`, pulled in transitively by the new test's relative import at `predict-request.test.ts:8` (`tsconfig.app.json` includes `src`, which covers `src/**/__tests__`). Demonstrated, not reasoned: appending `const M: number = 'not a number'` to that file made `npm run typecheck` exit 2 with `supabase/functions/_shared/predict-request.ts(84,7): error TS2322`; the file was restored and the tree is clean. `_shared/contract.ts` was already in the program through `src/types/prediction.ts` — this spec's own mutation table says so. Honest scope: the two `index.ts` files are the ones no local step type-checks. [README.md:120-124, AGENTS.md:26] — deferred: agent-context/doc edit, owner's to make.
- [x] [Review][Defer] AGENTS.md presents both probe modes as interchangeable when one is a point-in-time snapshot — "it fails non-zero, so a stale deployment cannot pass it" is true only of `--expect=validated`; `--expect=baseline` encodes the pre-deploy answers, so it goes permanently red the moment the owner redeploys (the same five rows flip). Nothing in the new README section or the AGENTS.md clause says which mode a future agent should expect to pass, so a post-deploy baseline run reads as a regression. [AGENTS.md:30, README.md:126-130] — deferred: agent-context/doc edit; settles with the same pass as Defer 1.
- [x] [Review][Defer] No automated check anywhere observes `index.ts`'s wiring of the validator — verification-gap layer, filed pre-verified: delete `index.ts:325` (`if (rejection) return errorResponse(400, rejection);`) and every gate stays green — Biome (only `noUndeclaredDependencies`/`noRedeclare`/`noCommonJs` are enabled), `tsc -b` (file outside the program), `npm test` (132 tests, none import `index.ts`), and CI `deno check` (type-only; the `satisfies` tie at `index.ts:36` constrains the standalone list, while `validatePredictionRequest`'s parameter is `readonly string[]`, so the call-site argument is unconstrained). The pre-validator behavior returns with a green gate, and the only detector is a human running the probe against a deployment. [supabase/functions/predict-game-7/index.ts:322-326] — deferred: the story's frozen boundary forbids a Deno test harness and the owner declined local Deno; belongs to the already-tracked thread in `deferred-work.md` ("nothing in CI re-probes the live shape").

**Rejected:**

- false — `mask()`'s `"computation_time_ms":\d+` cannot leave a fractional tail: `index.ts:384` writes `Math.round(computation_time_ms)`, so the field only ever serialises as an integer.
- false — `readViteEnv` not stripping quotes/`export`: the probe's committed evidence is full runs against this repo's actual `.env` (fourteen rows matched at exit 0; five FAIL rows at exit 1), so the parser handles the file that exists, and `.env` is not committed.
- false — "the D1 closure text names the wrong action": `deferred-work.md:25` says `denoland/setup-deno@v2`, which is what shipped.
- low, fix edits this spec — the Verification table's "a 50/50 presented as an analysis" surviving after Change Log 4 measured 61.77/38.23: same document, corrected in prose two sections below.
- low, fix edits this spec / the epic — Code Map and AC say `actions/setup-deno` where `denoland/setup-deno@v2` shipped, with no Change Log entry for the substitution.
- false — `method: null` being rejected while `undefined` defaults is not reachable from the app: `PredictPage.tsx:325` types `attempt.method` as non-nullable `MethodSlug` and Generate requires a selection. Rejecting an explicit `null` is the boundary working; the fix would add a branch for a non-browser caller.
- false — `shopt -s globstar` "without `shell: bash`": GitHub Actions' default shell on ubuntu runners *is* `bash -e {0}`, as the rest of this job already assumes.
- low — a glob matching nothing would print `Checking 1 files`: not a silent pass — `deno check` on the unmatched literal pattern exits non-zero and the step reddens; only the log's first line is untidy.
- already recorded — the probe is linted by nothing (`scripts/**` is outside Biome's `includes`): this spec's Handoff names it as a deliberate call, and the verification-gap layer filed it as noted-not-a-gap.
- pre-existing, already tracked — the `__dirname` Vite `configLoader: 'native'` deprecation warning surfaced while running the suite, owned by the Story 1.1 entry in `deferred-work.md`.
