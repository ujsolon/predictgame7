# Run sheet — every live leg, all of them owner-run

Companion to `SPEC.md`. This file exists because the story has two halves and only one of
them is agent-runnable: the adapter, tests, docs and migration text land in a commit, while
every fetch, every dispatch and every `db push` here is the owner's by policy (Constraints).
Each step states the command, what it proves, and what must be pasted back. Nothing on this
sheet may be marked done from inference — a step is green when its run id or its printed
verdict exists.

Order matters at two points, not one:

- Steps A–D fire only after the re-pointed workflows are on `master` (they dispatch the defaults
  CAP-1 moves, so a dispatch fired before the push proves `nba_com`). Pushing is the owner's act;
  the agent hands over the command.
- **Step D additionally needs step 3 done first — `00018` applied.** `writer.ts:103` selects
  `id, abbreviation, espn_code` on every `readTeams`, so an `espn` dispatch that reaches the sink —
  `dry_run` either way, since planning needs team ids regardless — goes red on a schema reason, not
  a feed reason, until the column exists. This correction was found by reading the code, not by
  running it: the sheet's original "one point only" claim missed it. Steps A and B refuse at adapter
  selection before any client is built, and C never opens one, so those three are unaffected by the
  column's absence and are runnable today.

Nothing scheduled can pre-empt this: the inseason and offseason crons are April–June windows only
(`pipeline-inseason.yml:40-42`, `pipeline-offseason.yml:27-28`), so between now and mid-April no
`espn` run reaches the database on its own. `keepalive.yml:5` fires daily and touches only
PostgREST.

## Part 1 — build legs, before `00018` is applied

| # | Command | Proves | Recorded as |
|---|---|---|---|
| 1 | `node scripts/probe-espn-adapter.mjs --date=20260420` then `--date=20260605`, then the range control | CAP-8: the field coverage the adapter depends on is present on real payloads, and the **30-franchise ESPN code table** exists as measurement. This table — not a guess list — is what `00018` seeds. The two known divergences (`NY`→Knicks, `SA`→Spurs) must reappear; any *other* code that differs from `teams.abbreviation` is a new finding and gets its own row in `payload-contract.md`. | **OBTAINED 2026-10-04** — legs A and C on the owner's live run, and the code table from a **captured payload** (see the fourth attempt below): `tests/pipeline/fixtures/espn-teams-site-20261004.json`, read by leg B's own reader under `npm test`, which is what `00018`'s 30 seeds trace to. It is not traceable to a probe run from the scheduled environment, and that distinction is recorded rather than smoothed over. Exit code from the command itself. |
| 2 | `node scripts/rehearse-migration-00014.mjs` with `COVERED_THROUGH` extended through `00018` | The additive column and the partial unique index behave on a throwaway database, including the negative proof that a **duplicate non-null `espn_code` fails the index**, and `EXPECTED_TEAM_COUNT = 59` still holds because no row is inserted. Needs Docker; it is the same harness Stories 2.8/2.12 ran. | **OBTAINED 2026-10-04** — `node scripts/rehearse-migration-00014.mjs` on the owner's machine (Docker 28.1.1, throwaway container `pg7-rehearse-00014-20696`, no published port, no Supabase command, no production endpoint) exited **0**, read from the command itself. `migrations to replay: 18`, `applied 00001…00018` in filename order, and the section-7 verdict block is pasted **verbatim** in the story record ("`00018` is certified by the rehearsal"), including `7a 00018 is additive: 59 teams rows after the replay (read 59)`, `7c a duplicate non-null espn_code could not be written — 'ATL' still sits on exactly one franchise`, and all four post-condition guards observed firing with the post-tamper state read back as `30|30|6|0`. Two mutations, each restored: the ceiling at 17 reddens before the container starts, and swapping the Knicks'/Spurs' codes between ids 20 and 27 makes **00018 itself refuse to apply** in the ordered replay (`found only 4 of the six measured code divergences`) while the offline transcription audit reddens with the same two rows named. |
| 3 | `npx supabase db push` — **owner only** | `00018` reaches production. The agent never runs `db push`, `db reset`, `db start`, and never points `psql` at `supabase/.temp/project-ref` — that *is* production. | The applied-migration name and date, plus `docs/CURRENT_DATA_MODEL.md` updated in the same commit as the migration file. |

Step 1 gates step 3: seeding `00018` before the cross-check runs would be guessing at codes
the assumption in `SPEC.md` explicitly refuses to keep. **That gate was satisfied on 2026-10-04** — the
table came off a captured payload, not a guess list — so the 30 seeds in the authored `00018` are
transcriptions the test suite re-audits against those bytes on every run. The probe's own re-run is now
a confirmation leg, not a discovery leg, so step 3 is no longer gated behind it (owner call, 2026-10-04).

**Step 1, first attempt (2026-10-04, owner's machine): red, and it taught one thing.** All three
legs exited 2 on `fetch failed` — no payload, so at that moment the code table was unobtained and `00018`
had no seed source. Two non-network assertions *did* pass inside that red: leg A's date
round-trip on both dates (`2026-04-21T07:30Z → 20260420`, `2026-06-06T07:30Z → 20260605`, CAP-5 on
the real clock path) and leg C's builder refusing the range form (CAP-2). What the run actually
bought is the fix now shipped: connection-class failures all reach Node as the identical
`TypeError: fetch failed` with the real reason on `error.cause`, and the retry message dropped the
cause — three legs, three bare `fetch failed`, no diagnosis. `describeFetchThrow` (`espn.ts:216`)
unwraps it, so the re-run names the class instead of the symptom. Re-run:

```
node scripts/probe-espn-adapter.mjs --date=20260420
```

Read the code in the parentheses. `ENOTFOUND` / `ENODATA` / `ESERVFAIL` means this machine's
resolver refuses the name (blocklist, sinkhole, DoH policy) — a different resolver or another
network suffices, since the same endpoint answered a GitHub runner in 78 ms and Supabase in 226 ms.
`ECONNREFUSED` / `ETIMEDOUT` / a TLS-named code means something in the path (proxy, firewall) is
cutting the connection.

**Re-run verdict, same day: the class was named and it is the local resolver, not the feed.** Leg A
printed `request threw: fetch failed (ENOTFOUND getaddrinfo ENOTFOUND site.api.espn.com)`, and the
owner's three `Resolve-DnsName` probes located it: `www.google.com` resolves, `site.api.espn.com`
returns **`DNS operation refused` (`RCODE_REFUSED`) from the default server** while the same query
against `-Server 1.1.1.1` answers normally through the Akamai CNAME chain, and the `hosts` file has
no `espn` entry. So a filtering resolver (ISP, router, or a DNS blocker on the path) is refusing
the name — the adapter, the URL and ESPN itself are all exonerated by measurement rather than
assumption. `00018`'s seeds still need one leg-B run to completion on a machine whose resolver is
not filtering: point the adapter at a public resolver or use another network, then re-run. A
`hosts` entry pinned to a measured IP is the last resort and is fragile — Akamai returns a 20-second
TTL and location-varying addresses. There is **no local substitute if this machine genuinely cannot reach
ESPN**: the table must come from somewhere that can, and the only shape available is a one-off
dispatch on a hosted runner — no such workflow exists today, so that is new surface and needs the
owner's explicit yes. It must not be replaced by inference about what ESPN "probably" prints.
〔Superseded the same day, and the superseding is the lesson: the claim that a hosted dispatch was "the
only shape available" was wrong. The owner released the no-agent-fetch rule for four read-only GETs from
their own machine — the same browser path that resolves the name — and the payloads landed on disk as
committed fixtures. The alternative had been in reach the whole time; the sheet had run out of imagined
options rather than real ones.〕

**Third attempt, same day, on a mobile network: legs A and C are now OBTAINED on a real payload,
and leg B went red for a completely different reason — this repo's reader, not ESPN.** Leg A asked
for `dates=20260420`, got three finished first-round games, and the shipped adapter did everything
the contract says it should: every event carried `state="post"`, `description="Final"` and a
parseable `notes[0].headline` (CAP-3, CAP-4 — six codes read off live JSON: `CLE TOR NY ATL DEN
MIN`, with `NY` resolving to `teams.id=20`, the measured Knicks divergence re-measured); all three
were games 2 of 7, so the adapter emitted **0 status rows and 0 score rows and the cross-check
called that an EXACT MATCH against the raw payload** — the exclude-by-rule path and the
rest-day-with-games case, proven on unpicked JSON rather than on a fixture. Leg C re-measured the
range form: `HTTP 400`, top-level keys `code, message`, no `events`. CAP-2's single-date-only
decision holds a second time.

Leg B's two routes both answered `HTTP 200` and both failed the same one-level scan: the site route
returns a top-level `sports` array (so the franchise rows sit at `sports[0].leagues[0].teams`,
which nothing at depth 1 can reach) and the core route returns `count, pageIndex, pageSize,
pageCount, items` whose every `items[]` entry is a lone `$ref`. The reader reported that as `entry
null has no 2-4 capital-letter code` six times — a wrong verdict about a shape it had not actually
looked at. Fixed: the traversal is depth-bounded to 6, accepts a `team` wrapper, prints the key
path that supplied the table, and names a pointer list as one instead of as malformed rows. The
verification is unchanged and still absolute — 30 distinct codes, 30 distinct `teams.id`, the two
divergences confirmed by the franchise name beside them, or no table.

**Fourth attempt, same day — and the method changed, because the diagnosis had stopped being
independent.** Three rounds had each read the payload *through the reader under test*, so each
"finding" was that reader's assumption about the shape. The owner released the no-agent-fetch rule
for four read-only GETs from their own machine; the bodies landed on disk, unedited, and are now
committed fixtures. That broke the circularity, and what it found:

- **Leg B's table exists, and it disagrees with the contract in four places.** The site route's
  `sports[0].leagues[0].teams` carries 30 franchise rows and `abbreviation` is the only code field
  on them — `displayAbbreviation` and `shortName`, the two fields the reader also tried, do not
  exist. Against `00005`: **24 agree, 6 diverge** — the two known (`NY`→`NYK`, `SA`→`SAS`) plus
  `GS`→`GSW`, `NO`→`NOP`, `UTAH`→`UTA`, `WSH`→`WAS`, all four of which `payload-contract.md` had
  carried as "assumed to agree". The probe that refused a 26/30 table was right to refuse it, and
  its four `code … has no match` lines were the finding. ESPN's own `team.id` differs from
  `teams.id` on **27 of 30**, so it is not an identity either, and `displayName` is `LA Clippers`
  where the table stores `Los Angeles Clippers`.
- **The reader's fix is proven against those bytes, not a hand-authored stand-in.** The two
  synthetic payloads that caught the depth budget are gone (`git rm`); `--fixture-teamlist=` now
  runs the live reader over the real capture and over the core route's `$ref` list, in `npm test`.
  A synthetic shape could not have caught the original bug, because the bug *was* the assumption
  about the shape.
- **Game-7 admission, on real JSON.** Two dates with a Game 7 on them were captured: `20250503`
  (one event, `West 1st Round - Game 7`, DEN 120 / LAC 101) and `20250504` (`East Semifinals -
  Game 1` alongside HOU 89 / GS 103). Replayed through `buildFeed`, the first yields exactly one
  status and one score, and the second admits the Game 7 with **`winner_team_id = team_b_id`** —
  the away side won, review P1's slot case, in ESPN's bytes — while naming the Game 1 it drops.
  `feedSeriesCount` reads 2 on a feed that contributes one row, which is the `--require-feed`
  property, also measured on the abandoned dates: a full regular-season night answers `15 series
  in feed … 15 unreadable headline`, because `notes` is a playoff-only field.
- **Why the fetch needed DoH, recorded because it is a property of the capture, not of the feed.**
  `getaddrinfo` and c-ares both fail for `site.api.espn.com` (`ENOTFOUND` and `queryA EREFUSED`)
  while `Resolve-DnsName -Server 1.1.1.1` succeeds — and all three public resolvers refuse over
  UDP/53 in 7-13 ms while answering other names, so something on this machine's path filters port
  53 regardless of the named server. Querying over HTTPS (443) answers `NOERROR`. A `hosts` pin was
  rejected: Akamai returns 20-second TTLs and location-varying addresses.

**What this does NOT close:** the live leg B/C runs from the scheduled environment. The code table
is measured now, so `00018` has a lawful seed and the probe's re-run is a confirmation rather than
a discovery — but no probe leg has yet completed on a GitHub runner, and `in`/`pre` status shapes
stay unobserved (there is no unfinished NBA game to fetch in October 2026). Step 2 is OBTAINED
(step 2's row above); step 3 — the owner's `db push` — is the one leg left that gates step D.

## Part 2 — the four proofs Story 2.6 transferred (owner call C3)

Not new work: these are spec-2-6's `workflow-inventory.md` steps 1 and 5, its rehearsal
dispatch, and its CAP-2 green run — re-pointed because the source they prove changed from
`nba_com` to `espn`. Story 2.6 stays at `review`; none of these gate that review. Each one
needs a **run id** in the record, and zero-write steps need the confirmation that no row moved.

| # | Dispatch (all from `pipeline-inseason.yml` unless noted) | Proves | Status entering this story |
|---|---|---|---|
| A | `source=fantrax`, `dry_run` either way | The registry-refusal path still fires **before** `openSink()` on a real runner, now that `espn` is the default — i.e. CAP-1's re-point did not disarm the guard. Zero HTTP to the database. | **OBTAINED 2026-10-04, run `37199559809`** — `workflow_dispatch` on `headSha 55801f0` (the pushed defaults), event `workflow_dispatch`, job `pipeline` step 6 "Run the pipeline" failure with `exit code 2`, and the run's whole failed log is the command echo plus the two **masked** credential names: no `readTeams`, no `openSink`, no write line. Refusal text: `pipeline failed: SERIES_SOURCE="fantrax" is a recognised adapter but is not implemented — it was rejected by the Story 2.1 spike…`. Step 7 "File a loud failure" succeeded, and because issue #8 was still open the alarm **commented** rather than opened: #8 went 4 → 5 comments, newest `Still red: …/37199559809 (55801f0)`. That comment is the precondition step B resets. The two old-default proofs (`37102521529`, `37102534986`) stay superseded, not retracted. |
| B | Deliberate red **after** closing issue #8 ("Pipeline inseason run failed") | The dedupe resets on close: a *new* issue opens instead of a `"Still red:"` comment on the closed one. | **OBTAINED 2026-10-04.** #8 closed `--reason completed` with the proof-B comment (its last comment is that close note, not a sixth `Still red:`), then run `37202299383` (`source=fantrax`, failure, on `931f220`) opened **issue #9** with the same title and `Run: …/37202299383` + `931f220 on master` in its body. The reset half is now shown; #9 is a deliberate artifact and gets closed once recorded. |
| C | `migration-rehearsal.yml`, manual `workflow_dispatch` | The Docker-dependent rehearsal job executes on a runner at least once. `00018`'s push will trigger it via `paths:` anyway, so this dispatch is the independent proof, not a substitute. | **OBTAINED 2026-10-04, run `37201495284`** — `workflow_dispatch` on `migration-rehearsal.yml` (no inputs on that file), conclusion `success`; the job created container `pg7-rehearse-00014-2119`, ran the replay through guard `6f`, printed `REHEARSAL PASSED`, and removed the container. Verbatim verdict line in the story record. This certifies the replay order **through `00017`** — it ran before step 2's extension landed; step 2 is now OBTAINED locally through `00018` (its row above), so a re-dispatch of this workflow after the push would be the hosted counterpart of that certification, not a substitute for it. |
| D | `source=espn`, `dry_run=false`, `require_feed=true`, fired on a day the owner names | The fetch-and-plan leg on a hosted runner, against the new default, exiting 0. **Accepted as a hollow green (owner call 2026-10-04)** — see the note below. | Cannot fire until the adapter ships and the defaults move. The record must state the hollowness; the write proof belongs to step E. |

Step D's date is not a choice of playoff day. The adapter asks for exactly one day — **the
previous calendar day in `America/New_York`**, computed from the run instant — because the
07:30 UTC cron (owner call 2026-10-04, moved from 09:30; `keepalive.yml` moved with it to 07:00)
fires at 02:30 ET in winter and 03:30 ET in summer, before that day's games tip, so the only
results visible at that hour are the previous evening's. That reasoning is unchanged by the move:
`America/New_York` minus one day gives `20260605` for the measured game stamped
`2026-06-06T00:30Z` at either minute. What the move does change is the margin — see
`schedule-amendment.md`. So "the date you give" is the day you *fire* the dispatch, and ESPN is
asked for the day before it in ET. There is no fixed first-playoff-date to point at; naming one
would be the calendar logic the spec's Non-goals refuse, and the workflow carries no date input.

Why hollow, and what it still proves: in October the asked-for day holds no playoff game, so the
feed either is empty (red — which is the alarm working, not a defect) or is a preseason
`events` array. In the latter case `--require-feed` passes on `feedSeriesCount` counted **before**
exclusions, CAP-4's round parse then excludes every game, and the run exits 0 having written
nothing. That green is real evidence about the fetch, the parse's refusal to invent a series, and
the runner reaching exit 0 on a hosted box — it is **not** evidence that a write happens. Pointing
the same dispatch at a day whose games are already archived is not a workaround: `plan.ts:382-389`
skips an identical archived series or throws if the stored outcome disagrees, so the run either
writes nothing or goes red, and a day whose games are *not* on the table inserts live rows — a
real content change, which is the in-season behavior, not a test.

| # | Dispatch | Proves | Status |
|---|---|---|---|
| E | Story 2.7's simulated-playoff-week drill (fixture date, not a dispatch) | The **write** leg step D cannot show: fetch → plan → RPC write → the archive and `/predict` reflecting it. | Owned by 2.7; listed here so step D's green is never read as this proof. |

## What is already closed

`supabase functions delete feed-egress-probe` — **done by the owner 2026-10-03**, confirmed in
this session, so it is not on this sheet. Both throwaway probe artifacts
(`.github/workflows/egress-probe-hosted.yml`, `supabase/functions/feed-egress-probe/`) are gone
from the tree; `git show c9745e2` restores the CI shape if a future round wants it.

## Closing the story

`npm run gate` green with its exit code read from the command, the four run ids above recorded,
`seriesdatasource-port.md`'s registry line carrying `espn`, `sprint-status.yaml`'s
`2-13-espn-feed-adapter` moved to `review` (external fresh-context code review is the same gate
2.4/2.5/2.6 passed through), and the commit made locally with named files after re-checking
`git status` — the owner runs parallel sessions on this tree. The hand-over, not the push:
`git push origin master`.
