---
id: SPEC-2-13-espn-feed-adapter
companions:
  - payload-contract.md
  - surface-inventory.md
  - run-sheet.md
  - schedule-amendment.md
  - ../../implementation-artifacts/seriesdatasource-port.md
  - ../../../AGENTS.md
sources:
  - ../../planning-artifacts/epics.md
  - ../../planning-artifacts/sprint-change-proposal-2026-10-03.md
  - ../../implementation-artifacts/decision-2-1-q-4-data-source.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Spec: Story 2.13 — ESPN feed adapter (the source change Story 2.6's egress evidence forces)

## Why

A pain to solve, with the same calendar deadline attached to it. Story 2.6 shipped the cadence — daily inseason runs, two offseason edges, a failure that files a deduped GitHub issue — and every part of it was proven working except the one part that has to leave the building: the fetch. `stats.nba.com` refuses all cloud egress (0/15 across two providers and three client stacks) and `cdn.nba.com` returns `403` from both clouds, so the scheduled source shipped in 2.4 answers to nobody but a residential address. `site.api.espn.com` answers from both clouds — 226 ms from Supabase, 78 ms from a GitHub-hosted runner, confirming run `37119291248` — which is why FR-21 was re-resolved on 2026-10-03 (`sprint-change-proposal-2026-10-03.md`, owner calls C1–C4) and why the documented reopening trigger on the feed route has fired.

This is a **source change, not a cadence change**: the bracket, the three-line cron shape, the notify composite, the dedupe, the concurrency group and `--require-feed`'s design all stay exactly as 2.6 shipped them, and D-7 stays closed. The one exception, made by the owner on 2026-10-04, is the *minute* — `09:30 UTC → 07:30 UTC`, with `keepalive.yml` moving to `07:00` so the ordering reason D-5 actually recorded survives the move rather than being inverted by it (`schedule-amendment.md`). Affected: the Apr–Jun 2027 window, where stale Active Series invalidate the traffic measurement the whole plan rests on; the owner, who is the only reader of the signal and the only party allowed to run a live fetch; and the `teams` table, which gains its first per-provider identity column.

## Capabilities

- **CAP-1**
  - **intent:** An `espn` adapter sits behind the `SeriesDataSource` port and becomes the scheduled source, with `nba_com` displaced from the workflow surface but still recognised.
  - **success:** `espn` is in `ADAPTER_REGISTRY`, in the `SERIES_SOURCE`/`--source=` vocabulary and in `seriesdatasource-port.md:82`'s registry line; `--source=nba_com` still resolves and runs by hand; both workflow files carry no `nba_com` on the scheduled path; `npm run gate` exits 0. See `surface-inventory.md`.
- **CAP-2**
  - **intent:** One scoreboard fetch per run yields the port's two row shapes, keyed the way the database keys them.
  - **success:** Against a committed fixture of a measured payload, `fetch_series_statuses()` and `fetch_game_scores()` return rows keyed on `(year, team_a_id, team_b_id)` with game numbers 1..7 and no tie; `--dry-run` writes nothing; a second real run changes nothing; a missing secret names the secret rather than surfacing as a fetch error.
- **CAP-3**
  - **intent:** A team in the feed resolves to exactly one `teams` row through that provider's own code, or the run stops.
  - **success:** Migration `00018`'s `teams.espn_code` resolves `NY` → the Knicks row and `SA` → the Spurs row (the two measured divergences from `teams.abbreviation`, finding 5); an event team whose code matches no row aborts the run **naming the code**; no test or fixture resolves a team by substring, city, or nickname.
- **CAP-4**
  - **intent:** A game's round and game number come from what the feed actually prints, and the archive's own vocabulary is left alone.
  - **success:** `competitions[0].notes[0].headline` ("East 1st Round - Game 2", "NBA Finals - Game 2") parses into the canonical round label and the game number; a payload whose headline is absent or unparseable excludes that game and **names the exclusion** in `describeRun`; the 17 archived era spellings are not rewritten by anything in this story.
- **CAP-5**
  - **intent:** The date the adapter asks for is the day the games were actually played, in the league's own timezone.
  - **success:** A unit case pins the boundary — a run instant of `2026-06-06T07:30:00Z` requests `dates=20260605`, because ESPN filters by US local date and the measured game stamped `2026-06-06T00:30Z` lives under the *previous* local day (finding 4). The pinned instant is the amended cron minute; the answer is the same ET day it was at 09:30, which is the point of pinning it. A UTC-derived date is a bug this test catches.
- **CAP-6**
  - **intent:** Only finished games reach the plan, and a shape nobody has ever observed cannot smuggle itself in.
  - **success:** A fixture carrying `status.type.state == 'in'` with a plausible score produces zero writes and one named exclusion; the admit rule is `Final` on the status fields, and anything unrecognised is excluded **by rule** rather than defaulted to a guess. There is no live game to observe in October 2026, so this is the substitute for a probe — recorded as such, not as a measurement.
- **CAP-7**
  - **intent:** The empty-feed alarm 2.6 built keeps working against the new source without its design moving.
  - **success:** The adapter declares `describeRun` with `feedSeriesCount` counted **before** any adapter-side exclusion and `hasRunReport: true` in the registry; `--require-feed` against a fixture whose `events` is empty exits non-zero naming the flag and the adapter, and the same flag against `manual_csv` still refuses up front. A rest day therefore also goes red, by owner decision.
- **CAP-8**
  - **intent:** The adapter is exercised against a real recent playoff payload, and the code table that seeds `00018` is produced by that same exercise rather than asserted.
  - **success:** `scripts/probe-espn-adapter.mjs` — owner-run, stateless, non-zero on a shape it cannot read — prints the field coverage the adapter depends on and the ESPN code for every one of the 30 modern franchises; its output is pasted verbatim into the story record, and every `espn_code` value in `00018` traces to a line of it.
- **CAP-9**
  - **intent:** If the ESPN route breaks, the next source is already named and the floor is already there.
  - **success:** The adapter's doc block records basketball-reference as the designated automated fallback of last resort (measured reachable from both clouds, `200` HTML, ~220 ms — scrape cost, unimplemented) and `manual_csv` as the floor, in the port doc and in `failure-modes.md` mode 2's re-pointed wording.
- **CAP-10**
  - **intent:** The four proof obligations Story 2.6 transferred out get executed against the new source instead of being inherited as a permanent debt.
  - **success:** All four dispatches in `run-sheet.md` carry a recorded run id — including the green **non-dry** run of the scheduled source that `spec-2-6`'s CAP-2 still owes. By owner call 2026-10-04 that fourth dispatch is accepted **hollow**: it proves hosted fetch → plan → exit 0, and the record must say so rather than let a green read as a write proof, because the write leg stays with Story 2.7's drill and the 2027 window.

## Constraints

- **The parameter form is fixed by measurement, not preference:** the endpoint is `…/sports/basketball/nba/scoreboard?dates=YYYYMMDD`, one date per request. A range is refused by the host (`400` with a JSON error body, `dates=20260601-20260608`), so a backfill is a bounded loop of single-date requests and never a new parameter. `seasontype`/`playoffType` are out of scope: unmeasured, and one-date-per-run is already the cadence's shape.
- **`teams.espn_code`, not `team.abbreviation`, is the join key** (finding 5). No substring, city, or nickname match is admissible anywhere in the adapter — the one item in the evidence with a real silent-failure mode, since a mismatch drops games.
- **`00018` is additive, nullable, unique-where-not-null, and seeded for the 30 modern franchises only.** The 29 historical identities in `00007` and the `Team A`/`Team B` placeholders stay NULL; they cannot appear in a 2027 playoff feed, and a code that does resolve to nothing aborts the run instead of being curated into a row. `EXPECTED_TEAM_COUNT = 59` is untouched because no row is inserted. Rehearsed first (the throwaway rehearsal's `COVERED_THROUGH` extends to `00018`), applied by the owner with `npx supabase db push`, `docs/CURRENT_DATA_MODEL.md` in the same commit.
- **The runner stays date-blind.** The single date is derived from the run instant in `America/New_York` inside the adapter — a fetch-scope rule, never a state rule. It is *always* "the previous calendar day in ET" and never a fixed constant: there is no "first playoff date" the adapter can be pointed at, because naming one would be the calendar logic Non-goals refuse. No Apr–Jun branch or postseason calendar enters `run.ts` or `plan.ts` (AD-4, Story 2.4 Decision 2). The bracket, the window's three-line shape, the `--require-feed` placement, the notify composite, the dedupe and the concurrency group are not touched.
- **The scheduled minute moves, and the keepalive moves with it (owner call 2026-10-04).** `09:30 UTC → 07:30 UTC` on the three `pipeline-inseason.yml` lines and both `pipeline-offseason.yml` edges, and `keepalive.yml`'s `0 9 * * *` → `0 7 * * *`, so the run stays *after* the warm-up ping. D-5's only stated reason for the slot was that ordering (`decisions.md:65` — "so a sleeping instance is not made this cadence's failure mode"), and the pipeline reads and writes through the same PostgREST endpoint the keepalive pings; moving the pipeline alone would invert the reason rather than keep it. Nothing else in the schedule moves, and `decisions.md`/`failure-modes.md` gain an amendment line rather than a rewrite. See `schedule-amendment.md` for the margin this trades away.
- **One date per run, rest days included.** The owner declined a lookback window: deciding feed emptiness across several days would let the adapter inflate the number `--require-feed` reads, which is the independence Story 2.6 D-3 bought. A legitimate playoff rest day therefore files a red run, and that red is the instrument working.
- **Round naming comes from the headline because there is no typed field:** `competitions[0].type.shortName` is absent on the measured payload (finding 2).
- **Every live leg is owner-run.** No agent fetches the feed; no test fetches the network. Adapter tests read committed fixtures, so the suite stays hermetic on a runner that has no reason to reach Disney.
- **`nba_com` is not deleted** (C1): the registry keeps the name and its refusal-free run path, because dropping a recognised name invites a future session to re-propose the endpoint unexamined.
- Nothing in `supabase/functions/**` moves and no Edge Function is deployed; no new PostHog event names; no new RPC, grant, or row-level policy beyond the `00018` column; the archive stays frozen so no stored `round` spelling is rewritten.
- **A shape drift must fail loudly.** `site.api.espn.com` is undocumented Disney-side infrastructure with no SLA, so no parse may default a missing field to a plausible value — a drifted payload exits non-zero and lands in 2.6's proven issue machinery.
- `npm run gate` is the definition of done, its exit code read from the command itself and never from a pipe. Commits are local to `master` with named files, `git status` re-checked first (parallel sessions on this tree); the agent never pushes and hands over the command instead.

## Non-goals

- Building the basketball-reference scraper. The designation is recorded; the implementation is a conditional story authored only if the ESPN route breaks (C4).
- Changing the **bracket**, the window's three-line shape, the alarm wiring, the credential handling, or `--require-feed`'s design — 2.6's shipped and proven half, and this story's premise is that the blocker was the source. (The slot's *minute* is the single exception, and it is the owner's own 2026-10-04 call, argued in `schedule-amendment.md` — not a build-time discretion.)
- Any multi-date fetch, range parameter, or calendar logic that knows which days the playoffs fall on.
- Curating `espn_code` for historical franchises, or backfilling the 1948–1997 archive.
- Retiring `nba_com`, removing `manual_csv`, or touching the `keepalive.yml` schedule.
- Any PLANNED-GATED scope (accounts FR-22/23, betting-adjacent FR-26–29, video FR-13) and any new analytics event.

## Success signal

On a morning inside the Apr–Jun 2027 window, a run nobody typed fetches ESPN's scoreboard for the date the games were actually played, resolves `NY` and `SA` to the right rows, writes a real result through the existing RPCs — or refuses loudly and files one deduped issue naming what it could not read — and `/predict` shows an Active Series that is not stale. The same cadence on a rest day goes red on an empty feed, and that red is the alarm working rather than a defect. Proven by the green non-dry dispatch in `run-sheet.md` (hosted fetch → plan → exit 0, accepted hollow) and by Story 2.7's drill, which carries the write half — not by a unit test.

## Assumptions

- The two measured playoff dates (`2026-04-20`, three events; the Finals day behind `2026-06-06T00:30Z`, one event) represent the payload the 2027 bracket will carry. Both are past dates, one attempt each, `Final` status only.
- The byte drop from 46,895 to 5,864 for the same URL is `--compressed` gzip, not a smaller payload, so the two probe rounds are consistent rather than contradictory.
- ESPN's codes for the other 28 modern franchises match the stored `teams.abbreviation`, since only `NYK`→`NY` and `SAS`→`SA` were observed to diverge. CAP-8's cross-check converts this from an assumption into a measured table before `00018` seeds anything.
- No game is still **in progress** at the amended 07:30 UTC instant. At that hour it is 02:30–03:30 in `America/New_York`, so a 10:00 pm ET tip that reaches triple overtime would be excluded as non-Final by CAP-6, named in `describeRun`, and never re-fetched — a missing row with a green alarm. Margin under 09:30 was about four hours; `schedule-amendment.md` records what the owner traded, and Story 2.7's row-count-vs-bracket read stays the detector.
- The GitHub-hosted → ESPN cell stays green: two dispatches proved it (`37118226487`, `37119291248`), and the failure class it would drift into is 2.6's alarm, not a silent stale.

## Open Questions

- Does `notes[0].headline` stay parseable through a seven-game series and a First Round whose headline names the teams instead of the round? Both samples read Game 2 payloads.
- What does a Game 7 at a neutral site, or under an arena rename, produce in `venue.fullName`? It was present on both measured samples and this story never reads it, but Story 2.8's venue semantics make a wrong assumption here expensive.
- How many rest-day reds will the Apr–Jun window produce, and will one of them be read as the alarm being broken? Not measurable now; Story 2.7's drill is the first full-week read of the cadence.
- *Resolved 2026-10-04 — the run-sheet step D question.* Owner call: a hollow green is acceptable, so the dispatch fires on a day the owner names and the write half moves to Story 2.7. Left open only in a narrower form: if a future proof ever needs a non-hollow green, the dispatch surface has no date input and adding one is a separate authorisation, not part of this story.
