---
title: 'Venue probe and census guard follow-up'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f1c59dda53220d2a523beefc36f547596fe76799'
story_key: '2-12-venue-probe-and-census-followup'
context:
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two Story 2.8 review carry-overs both end up REFUSING a correct answer. (1) The venue probe runs the context-free alias table over the home and winner codes of series that already matched directly, so the 1970s Bullets alias `WAS` → `WSB` shadows the live Washington Wizards abbreviation: a modern `WAS` row resolves to an abbreviation that is not one of that row's two slots, and the probe refuses to print the paste target (`game7_feed_aliases.csv:36` vs `00005:133` / `00007:37`, where `WAS` and `WSB` are both real, distinct franchises). (2) A Game-7-pending series has no curated CSV row and cannot have one, so the guards that refuse it — `league_backfill_complete` and `venue_coverage` — print advice that cannot be followed ("append the newer series to `game7_venues_curated.csv`"); the census population (`00016:610`, `league` only, no `winner_team_id IS NOT NULL`) states the same unreachable arithmetic. The 2027 drill re-runs the probe, and any future rebuild replays these guards, so both get settled before then.

**Approach:** Make the resolver slot-aware: a feed code that already names one of the matched row's two abbreviations is used verbatim, and the alias table is consulted only when it names neither. For the census, fix the defect where it actually bites rather than where it is merely stated — the two guard messages that a pending series really reaches get amended, and the population line stays as written. Both are pinned by tests, and neither defect fires on today's data (curation is complete, `00016` is applied), which is why they land before Story 2.7 re-runs the probe.

## Decisions (owner answers, 2026-10-03)

**O-1 — Keep the full spec** (~2,900 tokens, over the template's 900–1600 target). Accepted risk: context rot in later steps, which is why every path/line pointer below is stated as a citation rather than left to be re-derived, and why Implementation Notes carry the rehearsal output verbatim instead of a paraphrase.

**O-2 — The census half lands as option (c): fix the advice, not the population.** The two guards a pending series actually trips — `league_backfill_complete` (template `venueBackfill.ts:737-758`, applied `00016:435`) and `venue_coverage` (`:803-847`, applied `:524`) — each currently tell the operator to append the uncovered series to `game7_venues_curated.csv`, which a series with no Game 7 played cannot satisfy. Their messages gain the pending-case wording, and `00016` is **re-emitted and committed in the same change** so `--check` byte-agreement holds. Consequences the owner accepted with this choice:
- The committed `00016` then differs byte-wise from the text production applied on 2026-10-02, under an unchanged filename, and Supabase's migration tracking detects that by name only — so `docs/CURRENT_DATA_MODEL.md` records the divergence explicitly.
- The census population line (`:928`, applied `:610`) is **not** touched. It counts pending series, and that is a guard for a state the two earlier guards already refuse; adding `winner_team_id IS NOT NULL` would pay the same re-emit cost for an unreachable path.
- The resolver half (D-1 below) is unaffected by either choice.


## Boundaries & Constraints

**Always:**
- `npm run gate` green, with the exit code read from the command itself.
- The pinned literals stay: 178 / `EXPECTED_NBA_BAA = 160` / `EXPECTED_ABA = 18` / `EXPECTED_GAME7_HOME_WINS = 117` (`venueBackfill.ts:81-85`). A guard that stops a drifted archive is the point of them.
- `venueBackfill.ts --check` keeps byte-agreeing with the committed `00016` — under O-2 that is paid for by re-emitting the migration in the **same commit** as the template edit, never by hand-editing either file.
- Any emitted-text change is rehearsed against the throwaway container (`node scripts/rehearse-migration-00014.mjs`, which spawns its own `postgres:16`) with the output recorded verbatim in this spec.

**Never:**
- The agent applies nothing: no `supabase db push` / `db reset` / `db start`, no `psql` at `supabase/.temp/project-ref` — that is production. `git push` is handed to the owner as a command.
- No live feed leg is run here. `scripts/probe-game7-venues.mjs` makes outbound HTTP and is owner-run by policy, so the probe's edited lines get syntax + unit evidence, not execution.
- No relaxing, deleting or widening of a guard or pin to go green. No new PostHog event names. Nothing under `src/**` changes; no Story 2.13 / scheduling work leaks in.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Modern `WAS`, direct match | feed home code `WAS`, curated row slots `BOS`/`WAS` (2017) | resolver returns `WAS`; slot check passes; paste target printed | **Old behavior: returned `WSB`, slot check failed, answer refused** |
| 1970s `WAS`, alias match | feed home code `WAS`, curated row slots `CLE`/`WSB` (`aliases.csv:36`) | raw `WAS` names neither slot → alias fires → `WSB` | unchanged |
| Aliased home, other era | `GOS` against slots `PHX`/`GSW` (`test:722-735`) | `GSW`, alias reported in the `[via alias …]` suffix | unchanged |
| Winner code, same collision | feed winner `WAS` on a modern row | inversion report compares the raw code; no false inversion | unchanged |
| Pending series at replay | an NBA/BAA series with `winner_team_id IS NULL` and no curated row | the apply REFUSES at `league_backfill_complete` / `venue_coverage`, naming the series **and stating that a series with no Game 7 played has no venue to curate** | O-2: the advice is corrected; the census population line stays untouched |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/venueBackfill.ts:503-518` — `resolveFeedCode(code, aliases)`; docstring currently states "Context-free by design … Deferred as P3-1". Only three users: probe `:261`, probe `:276`, test `:733-734`. Add a required third parameter (the matched row's two abbreviations), raw-code-first; leave `matchSeasonFeedSeries` alone — its two-pass matching already runs direct-before-alias.
- `scripts/probe-game7-venues.mjs:259-283` — the post-match uses. `:262-267` is the slot check that refuses; `:276-281` the winner-inversion read. Both pass `m.row.teamA`/`m.row.teamB` into the resolver instead of post-checking.
- `supabase/scripts/pipeline/data/game7_feed_aliases.csv` — `:36` is the `WAS,WSB` row; `:11-22` states the three matching rules and names this exact collision as unfixed. Update that comment with the story.
- `supabase/migrations/00005_release_1_data_model.sql:133` (Wizards `WAS`, id 30) and `00007…:37` (Bullets `WSB`, id 59) — both abbreviations are real and distinct in the archive's own vocabulary; the collision is naming, not bad data.
- `supabase/scripts/pipeline/venueBackfill.ts:737-758` `league_backfill_complete` (advice at `:753`), `:803-847` `venue_coverage` (advice at `:842`), `:907-940` `game7_home_win_census` (population `:928`) — the guard ordering O-2 turns on. Constants `:81-85`; D5 header `:62-101`. Same order in the applied file (`00016_archive_league_identity_and_game7_venues.sql:435`, `:524`, `:610`), so the earlier refusal is not an artifact of the template. **Edit the tail of each message only**: the rehearsal's failure assertions (`rehearse-migration-00014.mjs:1069-1070`, `:1095-1096`) match each message's leading clause verbatim, so a rewritten prefix would break a passing harness case for no reason.
- `tests/pipeline/venue-backfill.test.ts` — `:722-735` the alias home-side case (extend with the two `WAS` cases), `:523` the committed-pair byte-agreement case (satisfied only by re-emitting `00016` in the same commit), `:292`/`:295` the guard-name list, `:546-579` the `scripts/**` gap cases (`node --check` both harnesses, plus `--fixture-report` as the no-Docker evidence).
- `scripts/rehearse-migration-00014.mjs` — `:132` `COVERED_THROUGH = 17`; `:597-612` ordered replay with the fixture seed immediately before `00016`; `:882`/`:899` guard tampers; `:919` invokes the real `--check`. `renderFixtureSeed` (`venueBackfill.ts:996-1035`) gives every series `winner_team_id = ta.id`, so no pending row exists anywhere today; O-2 changes message text rather than adding a state, so the existing uncovered-row cases (`:1069`, `:1095`) stay the evidence and the new assertion belongs in the generator test.
- `.gitattributes` -- pins the emitted migration's line endings (Story 2.8 loopback E2); re-check it after re-emitting so `--check` compares like-for-like bytes.
- `docs/CURRENT_DATA_MODEL.md` §"Story 2.8 status" — the full home-court boundary, and the place the `00016` content-vs-applied divergence gets recorded; `_bmad-output/implementation-artifacts/deferred-work.md:342-354` — where both entries close.

**Where the pointers landed after the build** (the map above is planning-time; every file it cites grew or shifted, so the built state is stated once, here, rather than patched bullet by bullet — review finding BH-7). `venueBackfill.ts`: `resolveFeedCode` `:523`, the `league_backfill_complete` message `:771`, the `venue_coverage` message `:860`, the untouched census population `:946`, pins `:86-88`, D5 header `:66`. `scripts/probe-game7-venues.mjs`: resolver calls `:268` and `:287`, slot-check refusal `:269-274`, inversion read `:287-292`. `game7_feed_aliases.csv`: matching rules `:11-21`, the Story 2.12 note `:22-29`, the `WAS,WSB` row `:44` (the tests now cite that row by content, since its line number moves whenever the header comment grows). `tests/pipeline/venue-backfill.test.ts`: emitted-text case `:312`, committed-pair `--check` case `:486`, load-sensitive `--fixture-report` case `:589`, new probe source-shape case `:606`, `WAS` cases `:795`/`:802`, winner-inversion `:811`. `rehearse-migration-00014.mjs`: the two leading-clause assertions `:1070`/`:1096`. `00016` emitted lines unchanged: `:435`, `:524`, `:610`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/scripts/pipeline/venueBackfill.ts` -- slot-aware `resolveFeedCode` + docstring rewrite (drop the "Deferred as P3-1" line); amend the tail of the `league_backfill_complete` and `venue_coverage` messages so a series with `winner_team_id IS NULL` is named as having no venue to curate, and note the same in the D5 header. Leave `:928` alone.
- [x] `scripts/probe-game7-venues.mjs` -- pass the curated row's two slots at both call sites (`:261`, `:276`).
- [x] Emit `00016` from the amended generator and commit the regenerated file in the **same** commit, so `--check` byte-agreement (`test:523`) never goes red; then re-run the full rehearsal against the throwaway container and capture its output verbatim into Implementation Notes.
- [x] `tests/pipeline/venue-backfill.test.ts` -- modern-`WAS`-verbatim (fails on old behavior), 1970s-`WAS`-still-aliases, `GOS` survives, winner-inversion unchanged, and one emitted-text case asserting both messages name the no-Game-7 case (fails on the current text).
- [x] `game7_feed_aliases.csv` header note (`:19-22`), `deferred-work.md` (both entries closed, this story named as owner), `docs/CURRENT_DATA_MODEL.md` (the boundary **plus** the committed-vs-applied `00016` divergence, since Supabase tracks the filename only), `epics.md`/`sprint-status.yaml` sync.
- [x] `npm run gate`, then commit staging these files only. (Gate green; commit left to the owner session per the build instruction — changes stand in the working tree.)

**Acceptance Criteria:**
- Given a directly-matched row whose slots are `BOS`/`WAS`, when the probe resolves the feed code `WAS`, then `WAS` is used and the paste target prints — no alias lookup happens for a code that already names a slot.
- Given the 1976 `CLE`/`WSB` row, when the feed answers `WAS`, then the alias still resolves it to `WSB` — the fix removes the shadowing, not the alias.
- Given a series with no Game 7 played, when either uncovered-row guard aborts, then the text the operator reads names it as not-appendable instead of telling them to append it.
- Given the resolver change, when `npm run gate` runs, then it passes, and reverting the change turns a new test red.
- Given the re-emit, then `venueBackfill.ts --check` is green against the committed `00016`, the rehearsal passes end-to-end with its output recorded verbatim, and nothing was pushed to production; `npx supabase db push` is handed to the owner as a command.
- Given the story is done, when `git status` is read, then nothing under `src/**` changed.

## Design Notes

**D-1 (story decision, recorded because the AC delegates it): raw-code-first, not year-scoped.** Year-scoping `resolveFeedCode` needs a season argument the probe has to thread through both call sites, and the alias table's own rule 1 (`aliases.csv:12-16`) already says direct matching outranks aliasing — slot-awareness is that same rule applied after the match, so it preserves every existing alias case, needs no CSV schema change, and cannot invent a year. The signature gains a required slots parameter so no context-free use survives anywhere.

**Why the census clause reads differently than the epic wrote it:** traced writers, not guessed. `league_backfill_complete` and `venue_coverage` refuse an uncovered series — which every Game-7-pending row is — and both run before the census. The population line therefore never gets the chance to miscount a pending series, so the defect worth paying a re-emit for is the *advice* those two guards print. Recorded here so a future reader does not re-propose the population filter as the fix.

## Implementation Notes

**2026-10-04, planning close.** Approved by the owner in the build session — "Keep full and c", then continue. `created:` above is 2026-10-03 because the draft was authored then; the O-1/O-2 answers landed after midnight, so the `## Decisions (owner answers, 2026-10-03)` heading inside the frozen block is one day stale. Not edited: frozen content is read-only to the agent, and the owner can renegotiate it.

**2026-10-04, build record (Story 2.12 agent session).**

Changed, exactly as planned: `resolveFeedCode` is now slot-aware (required `slots` third parameter; raw-code-first, no year scoping — D-1); both `probe-game7-venues.mjs` call sites pass `[m.row.teamA, m.row.teamB]`; the `league_backfill_complete` and `venue_coverage` tails name the no-Game-7 case (O-2 option c) with the census population line untouched; `game7_feed_aliases.csv`'s header note records P3-1 as closed; `00016` re-emitted from the amended generator in the same change.

Emit + check (exit codes read from the commands themselves):
- `node supabase/scripts/pipeline/venueBackfill.ts` → exit 0; the re-emit's diff is exactly the two `RAISE EXCEPTION` message lines (`00016:435`, `00016:524`). A later idempotent re-run prints "`00016…sql already matches the curated CSV — nothing written`" (exit 0).
- `node supabase/scripts/pipeline/venueBackfill.ts --check` → exit 0, "`--check ok: … (EOL-normalized byte compare)`".
- `.gitattributes` re-checked after the re-emit: `git ls-files --eol` → `i/lf w/lf attr/text eol=lf` for `00016` and both data CSVs — no CRLF churn introduced.

Docker rehearsal (`node scripts/rehearse-migration-00014.mjs`, throwaway `postgres:16`, exit 0). Verbatim lines carrying the amended guards plus the census and final-pass lines:
```
applied 00016_archive_league_identity_and_game7_venues.sql
ok   2.8 guard league_backfill_complete: a series the CSV does not cover aborts the SET NOT NULL with the count named — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|179|1246|0)
ok   2.8 guard venue_coverage: a blank NBA/BAA venue hand-bypassed into a missing row aborts naming the uncovered series — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
2.8 census — league: 159 NBA + 1 BAA + 18 ABA = 178, NULL 0; NBA/BAA Game-7: 117 home wins + 43 swapped (home = team_b) over the 160 population; home = stored winner in 117
REHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion, 00015's RPCs assert, land atomically, and stay service_role-only, Story 2.8's committed 00016 applied inside the ordered replay over the seeded fixture, --check holds on the committed pair, and every guard was observed failing with the post-reject state measured, and Story 2.5's 00017 refresh rewrote all three keys atomically over the synthetic, hand-authored, empty and real-score archives — byte-equal payloads on re-run with updated_at moving, and U11's 159/117/59 reproduced from the committed sheet joined to the committed curated CSV, with 00017's league guard observed refusing under its own tamper and the tamper leaving nothing behind.
```
The two tamper cases match each guard message's leading clause verbatim — the tails were amended, the prefixes were not, and both guards were still observed failing. All pins held: 178 / 160 / 18 / 117.

**Independent re-run (main session, not the implementer).** After the build returned, the same harness was re-run from a clean working tree in a separate background invocation: `node scripts/rehearse-migration-00014.mjs` → exit 0, and the four lines the AC requires verbatim reproduced byte-for-byte — `applied 00016_archive_league_identity_and_game7_venues.sql`, the `league_backfill_complete` and `venue_coverage` tamper cases (both still `ok … abort observed`, post-reject row counts identical to the build's run), the `2.8 census — league: 159 NBA + 1 BAA + 18 ABA = 178, NULL 0; … 117 home wins + 43 swapped … home = stored winner in 117` line, and the `REHEARSAL PASSED:` final line. The throwaway container reported itself removed. Nothing hosted was touched.

Gate: `npm run gate` → **exit 0** (final run, after every edit and after the mutation check below restored the resolver; `Test Files 23 passed (23)`). History honestly recorded: two earlier full runs exited 1 on the single pre-existing test `scripts/rehearse-migration-00014.mjs --fixture-report reproduces U11's pinned literals…` (`tests/pipeline/venue-backfill.test.ts:589`, spawnSync) with `Test timed out in 5000ms`, while the same file passed standalone and the script itself runs in 0.22 s — both failures occurred while the machine carried leftover load from the just-finished Docker rehearsal; the idle re-run passed the same test in 431 ms. No timeout, guard, or pin was relaxed to get there.

Mutation evidence for the AC "reverting the change turns a new test red": with `resolveFeedCode`'s slot-first branch temporarily removed (context-free resolver restored), `npx vitest run tests/pipeline/venue-backfill.test.ts` fails exactly the two new Story 2.12 tests — "a modern WAS names its own slot and is never reinterpreted as the 1970s alias (fails on the context-free resolver)" and "the winner-inversion read compares the raw code — no false alias on a modern row, unchanged on an aliased one" — and passes with the branch restored. The emitted-text guard-tail test ("the uncovered-row guards name the no-Game-7 case in their advice (Story 2.12, O-2)") covers the O-2 half.

**2026-10-04, step-04 review patches and the re-verify they forced.** The review pass produced no intent gap, so no loopback (`review_loop_iteration` stays 0); the accepted findings were patched forward on top of the build, and two of them changed emitted text, so the whole verification chain was run again afterwards. What landed:

- **BH-11 (medium, accepted) — the guard advice must not tell an operator to delete a row.** Both pre-existing tails offered "complete it through the pipeline **or remove it**"; with a pending series now named in the message, that read as permission to delete a `series` row to satisfy a guard. Both tails now end "…let the pipeline decide that Game 7 (its winner then names a real venue) and re-measure, and **never delete a series row to satisfy this guard**". This is a template edit, so it forced a second `00016` re-emit.
- **VG-main / BH-8 / BH-9 (medium, accepted) — the probe's call-site wiring was invisible to every gate step** (Biome skips `scripts/**`, `tsc -b` excludes it, `node --check` only parses). Added a source-shape case, `tests/pipeline/venue-backfill.test.ts:606`, that pins both `resolveFeedCode` calls to `[m.row.teamA, m.row.teamB]` and pins the refusal branch and the `[via alias …]` suffix strings. Reverting either call site to the two-argument form now goes red in `npm run gate`.
- **BH-13 (accepted) — the alias table's rule 2 contradicted the new resolver as written.** Rules 1-3 describe the *matching* pass; the resolver's post-match use fires on a series that HAS matched. The header now scopes rules 1-3 to matching and points at the slot-aware rule for the per-code use.
- **BH-4 / BH-5 / BH-7 (accepted, docs) —** `epics.md` Story 2.12's census AC now states the built option (advice, not population) instead of prescribing the population filter; both `deferred-work.md` CLOSED clauses are hedged to "**CLOSED IN CODE** … status `review`" until the commit lands and cite current lines; the Code Map gained a "Where the pointers landed after the build" paragraph, and the alias-row citation in the test is now by content rather than line number, since that number moves whenever the header comment grows.
- **VG-other-1 (deferred, not relaxed)** — the load-sensitive `--fixture-report` `spawnSync` case is recorded as a new `deferred-work.md` entry owned by Story 2.13, with the operational substitute written down (idle-machine run + standalone re-run required to pass).

Re-verification after those edits, exit codes read from the commands themselves: `node supabase/scripts/pipeline/venueBackfill.ts --check` first **failed (exit 2, "disagree at line 435")** — the expected symptom of a stale emitted file against the amended template — then `node supabase/scripts/pipeline/venueBackfill.ts` re-emitted (exit 0) and `--check` returned exit 0. The re-emit's diff against `HEAD` is exactly the two `RAISE EXCEPTION` message lines (`00016:435`, `00016:524`), leading clauses byte-identical.

`node scripts/rehearse-migration-00014.mjs` → **exit 0**, full output 15,145 bytes. Verbatim lines carrying the amended guards, the census, the final pass and the container teardown:
```
applied 00016_archive_league_identity_and_game7_venues.sql
ok   2.8 guard league_backfill_complete: a series the CSV does not cover aborts the SET NOT NULL with the count named — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|179|1246|0)
ok   2.8 guard venue_coverage: a blank NBA/BAA venue hand-bypassed into a missing row aborts naming the uncovered series — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
ok   2.8 guard game7_home_win_census: one flipped curated venue lands 116, not 117, and aborts — the curated list checksums itself — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
2.8 census — league: 159 NBA + 1 BAA + 18 ABA = 178, NULL 0; NBA/BAA Game-7: 117 home wins + 43 swapped (home = team_b) over the 160 population; home = stored winner in 117
REHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion, 00015's RPCs assert, land atomically, and stay service_role-only, Story 2.8's committed 00016 applied inside the ordered replay over the seeded fixture, --check holds on the committed pair, and every guard was observed failing with the post-reject state measured, and Story 2.5's 00017 refresh rewrote all three keys atomically over the synthetic, hand-authored, empty and real-score archives — byte-equal payloads on re-run with updated_at moving, and U11's 159/117/59 reproduced from the committed sheet joined to the committed curated CSV, with 00017's league guard observed refusing under its own tamper and the tamper leaving nothing behind.
rehearsal container pg7-rehearse-00014-16984 removed
```
Every line above is byte-identical to the build's recorded run — the tamper cases print the harness's own descriptions, and the harness matches each guard message's **leading clause**, which the patch did not touch. Pins held: 178 / 160 / 18 / 117. Nothing hosted was touched.

`npm run gate` → **exit 0** (`Test Files 23 passed (23)`, `Tests 432 passed (432)`). The run quoted here is the last one, taken after every patch above, after the mutation restore, and after the doc and triage-log edits — on an idle machine, with the rehearsal container already removed.

**Mutation evidence for the O-2 half** (the AC's "reverting the change turns a new test red", which the resolver half alone did not cover): with the pending-case sentence stripped from both template tails, `npx vitest run tests/pipeline/venue-backfill.test.ts -t "the uncovered-row guards name the no-Game-7 case"` failed exactly that case — `Test Files 1 failed (1)`, `Tests 1 failed | 68 skipped (69)`, assertion at `tests/pipeline/venue-backfill.test.ts:317` `expect(message).toContain('no Game 7 played')` with the received string ending "…re-derive the pinned counts in the same commit. '". Restoring the file from the pre-mutation copy and re-running: the same case passes (`Tests 1 passed | 68 skipped`) and `--check` returns exit 0. Stated honestly: the stripping regex also removed the D5 header's mirror sentence at `venueBackfill.ts:77`, which no test asserts, so the single red case is attributable to the two message tails but the mutation was not surgically limited to them.

Not done here, per the spec: no live probe leg (owner-run by policy; the edited lines got `node --check` plus the resolver unit evidence), no `supabase db push` (the committed-vs-applied `00016` divergence is documented in `docs/CURRENT_DATA_MODEL.md` §Story 2.8 status), no commit/push — changes stand in the working tree for the owner session.

## Spec Change Log

## Review Triage Log

step-04, 2026-10-04. Three layers run in parallel on the story diff (blind hunter, edge-case hunter, verification-gap pass). Every finding gets a row; "rejected" means adjudicated against the code, not dismissed — the evidence is the point of the row. No finding was an `intent_gap` or `bad_spec`, so no loopback and `review_loop_iteration` stays 0.

| Finding | Verdict | Evidence / disposition |
|---|---|---|
| BH-2 / BH-3 — the pending-series path is unreachable, or is only a "live-data sibling", so amending the two guards is guarding a state that cannot occur | **Rejected — false** | `00016:457` runs `ALTER COLUMN league SET DEFAULT 'NBA'`, so a pipeline-born pending series carries `league = 'NBA'` and `league_backfill_complete` (which tests `league IS NULL`) does **not** catch it. `venue_coverage` does, and it runs before the census. The reachable-guard claim is the reason O-2 option (c) edits that message at all. |
| ECH-2 — the amended tails would break the rehearsal's failure assertions | **Rejected — false** | `rehearse-migration-00014.mjs:1070`, `:1096` match each message's **leading clause** only. The patch left both prefixes byte-identical and the post-patch rehearsal ran both tamper cases green. |
| BH-6 — Review Triage Log / Spec Change Log empty | **Rejected — self-inflicted timing** | The triage log is filled by this very step (now, above). `## Spec Change Log` legitimately stays empty: no frozen-content renegotiation and no loopback happened. |
| BH-12 — planning prose about Story 2.13's adapter | **Rejected — out of story boundary** | It describes the next story's work, already registered in `epics.md` Story 2.13 and `sprint-status.yaml`. Patching it here would be 2.12 editing 2.13's contract. |
| BH-11 (medium) — the guard tails still offer "or remove it", which reads as permission to delete a `series` row | **Accepted — patched** | Both tails now close with "never delete a series row to satisfy this guard". Forced a second re-emit; `--check` went red first (exit 2 at `00016:435`), then green. |
| VG-main / BH-8 / BH-9 (medium) — nothing in any gate step can see the probe's resolver call sites, so a reverted `probe-game7-venues.mjs` stays green | **Accepted — patched** | New source-shape case `tests/pipeline/venue-backfill.test.ts:606` pins both calls to `[m.row.teamA, m.row.teamB]` plus the refusal branch and the `[via alias …]` suffix. The spec's own Boundaries say the probe is owner-run, so this is the only executable evidence the wiring exists. |
| BH-10 — mutation evidence covered only the resolver half, not the O-2 emitted-text half | **Accepted — executed** | Reverting both tails fails `tests/pipeline/venue-backfill.test.ts:312` (`Tests 1 failed | 68 skipped`), restoring it passes; recorded verbatim in Implementation Notes. |
| BH-13 — the alias CSV's rule 2 ("an alias is consulted only for a series that matched NOTHING") contradicts a resolver that now consults it after a successful match | **Accepted — patched** | Header rewritten: rules 1-3 are scoped to the matching pass and the slot-aware post-match rule is named as a different trigger. |
| BH-4 — `epics.md` Story 2.12's AC still prescribes the census **population** filter, which the story deliberately did not build | **Accepted — patched** | The AC now states the built option (advice, not population) with the reachability reasoning inline, so a future reader cannot re-propose the population filter from the epic. |
| BH-5 — the two `deferred-work.md` entries claimed "CLOSED" while the story was still uncommitted | **Accepted — hedged, then re-worded at commit time** | Both read "**CLOSED IN CODE** … committed on `master`, story status stays `review` pending the owner's fresh-context external code review", so the record names the step that genuinely remains (external review) rather than implying the whole cycle closed. The same hedge was applied to the alias CSV's header note. |
| BH-7 — citation drift: this story's own new prose points at pre-edit lines (`venueBackfill.ts:500-503`/`:928`, `probe:261,276`, `probe:262-267`, `aliases.csv:36`) | **Accepted — patched** | Current lines now stated once, in the Code Map's "Where the pointers landed after the build" paragraph, and in the two deferred-work clauses. The test's alias-row citation became content-based, because that line number moves whenever the CSV header grows. |
| ECH-1 — a winner code that names neither slot and no alias is silently dropped from the inversion report | **Real, pre-existing, out of this story's boundary** | Same behavior before and after D-1; the spec's I/O matrix scopes the winner row to "inversion report compares the raw code". Left as-is; not patched twice in one story. |
| VG-other-1 — `--fixture-report` `spawnSync` case times out under machine load (2 reproductions this session) | **Deferred, with an owner** | New `deferred-work.md` section "Deferred from: Story 2.12 step-04 review": **owner Story 2.13**, fix shape = explicit per-test timeout on that one case (not a global `testTimeout`), plus the operational substitute until then. Nothing was relaxed to go green. |

## Verification

**Commands:**
- `node supabase/scripts/pipeline/venueBackfill.ts` -- expected: re-emits `supabase/migrations/00016_archive_league_identity_and_game7_venues.sql` from the committed CSV (local file write only; refuses if any NBA/BAA venue is blank).
- `node supabase/scripts/pipeline/venueBackfill.ts --check` -- expected: exit 0, `--check ok` — and it must be run *after* the re-emit, which is the same assertion `test:523` makes through the harness.
- `node scripts/rehearse-migration-00014.mjs` -- expected (required under O-2, since emitted text changed): the harness's own final pass line plus the guard-failure cases, captured verbatim into Implementation Notes. Spawns its own throwaway `postgres:16` container; touches no hosted database.
- `npm run gate` -- expected: exit 0 (read the code from the run, not a pipe).
- `npx supabase db push` -- **not run here.** Handed to the owner: the re-emitted `00016` is never applied to production, and the committed file therefore diverges by content from the text production applied on 2026-10-02.
