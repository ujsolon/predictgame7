# `SeriesDataSource` port contract — Story 2.3, extended by Story 2.4

Status: shipped in `supabase/scripts/pipeline/` (Story 2.3; the `nba_com`
adapter landed beside it in Story 2.4). This is the port documentation
`epics.md` Story 2.3 AC (:353) asks for, with `manual_csv` as the reference
implementation. Source of truth for the boundary is `ARCHITECTURE-SPINE.md`
AD-5; the two fetch method names below are verbatim from AD-5 and must not
drift.

## What the port is

One interface, two operations. Every series-data source — the spreadsheet
floor shipped today and the automated adapters Story 2.4 swaps in — is
reachable through it, and the runner knows nothing about which adapter
produced its rows.

```ts
interface SeriesDataSource {
  fetch_series_statuses(): Promise<SeriesStatusRow[]>;
  fetch_game_scores(): Promise<GameScoreRow[]>;
  describeRun?(): AdapterRunReport; // optional, additive — Story 2.4
}
```

Definition: `supabase/scripts/pipeline/port.ts`.

**`describeRun?()` is an optional third member** (`AdapterRunReport`: counts
line, depth histogram, named-exclusion notes) that lets an adapter print
what its parse saw before the runner plans anything. AD-5 as written names
only the two fetch operations; it does not forbid an optional member, so
this ships compliant, but amending the spine text to record the extension is
an owner architecture act (Review Triage row 9 deferred it) — until then
this paragraph is the only place the extension is contractually described.
`manual_csv` has no report; a run with it prints none of those lines.

## Row shapes

```ts
interface SeriesStatusRow {
  year: number;            // calendar year — identity component
  round: string;           // free-text display label; NOT part of the key, no CHECK (Story 2.2)
  team_a_id: number;       // teams.id; convention: game 1's HOME team (AD-5, measured 178/178)
  team_b_id: number;       // teams.id
  winner_team_id: number | null; // NULL ⟺ Game 7 pending (AD-4 derivation input)
}

interface GameScoreRow {
  year: number;            // with team_a_id/team_b_id this keys the series — the identity pair
  team_a_id: number;
  team_b_id: number;
  game_number: number;     // 1..7
  home_team_id: number;
  away_team_id: number;
  home_score: number;      // final scores only; a tie is an invalid source row
  away_score: number;
}
```

Adapters return rows keyed by the **ordered** identity pair
`(year, team_a_id, team_b_id)` — the same key the database enforces with
`series_year_team_pair_key` (00014). Score rows join to statuses on that
exact pair; the runner groups, plans, and asserts before any write.

## Adapter selection

- `SERIES_SOURCE` (env) selects the adapter; `--source=` (flag) overrides it.
  Default: `manual_csv`.
- Registry: `ADAPTER_REGISTRY` in `port.ts`, keyed by the AD-5 adapter list —
  `manual_csv | fantrax | nba_com`.
- Implemented since Story 2.4: `manual_csv` and `nba_com`. A flag the selected
  adapter cannot use (`--csv=` with `nba_com`, `--season=` with `manual_csv`)
  refuses the run — a silently discarded flag would let the operator believe
  they steered it.
- `fantrax` stays recognised-but-unimplemented, and its refusal message now
  carries the Story 2.1 spike's actual rejection (Fantrax endpoints are
  fantasy-scoped and never return a real NBA game score with home/away sides,
  see `decision-2-1-q-4-data-source.md`) — a silent drop of the registry entry
  would let a future session re-propose it as unexamined.
- A recognised-but-unimplemented name or an unrecognised one fails the start —
  never a silent fallback to `manual_csv`, because a silent fallback would
  leave Active Series stale while looking healthy.

## Automated adapter: `nba_com` (Story 2.4)

`supabase/scripts/pipeline/adapters/nbaCom.ts` — the route the Story 2.1 spike
proved: the unkeyed `stats.nba.com/stats/leaguegamelog` feed
(`PlayerOrTeam=T`, `SeasonType=Playoffs`, `Counter=1000`), fetched with the
spike's six headers copied verbatim.

- **Request count: exactly one per run.** Both port methods read the same
  memoised parse; a run never fans out (the route is Cloudflare-fronted and
  its rate limits are unmeasured). Tests pin `urls.length === 1`.
- **Season: derived, not configured.** The season parameter comes from the
  run's UTC date (`getUTCMonth() <= 5` → previous September–following May
  season). `--season=<YYYY-YY>` overrides the derivation; it is a FETCH
  PARAMETER only — no phase, group, or page derives from a date (AD-4).
- **Selection rule: Game-7 shapes only.** A series enters the output iff its
  games are exactly `{1..6}` decided 3–3 (pending birth) or exactly `{1..7}`
  all decided (archive). 4-0/4-1/4-2 sweeps, in-flight series and pre-2003
  best-of-5 shapes are excluded and COUNTED in the run report — that is AD-4's
  product rule, and it discharges the era caveat for free. A game whose date
  equals the run's UTC date is withheld (the feed has no final/unfinal flag;
  those games belong to tomorrow's run) and named in the counts line.
- **Round vocabulary: four canonical labels by chain depth.** No working unkeyed
  endpoint returns a round name, so `adapters/rounds.ts` walks the
  postseason in date order (`depth = 1 + max(deeper side's previous depth)`,
  counting excluded series too) and maps depths 1..4 to `First Round`,
  `Conference Semifinals`, `Conference Finals`, `NBA Finals` — labels
  `getRoundImportance` already scores 1/2/3/4. A depth outside 1..4 is excluded
  AND named with the histogram that produced it.
- **Team identity is resolved, never copied.** Every id comes from the row's
  `TEAM_ABBREVIATION` through the port's `deps.teamIdByAbbreviation` — the
  same resolver `manual_csv` uses — because the sink's columns carry
  `REFERENCES teams(id)`. The feed's numeric `TEAM_ID` is a foreign namespace
  (`decision-2-1-q-4-data-source.md:104`'s claim that the two agree is
  unsourced; the owner-run `scripts/probe-nba-com-adapter.mjs` measures it).
  Consequence to remember operationally: **a feed carrying a team the `teams`
  table lacks aborts the run naming the abbreviation and its `GAME_ID`, and
  writes nothing** — that is the loud failure replacing a silent wrong-franchise
  insert. `WL` is never read.
- **Failure posture:** 25 s `AbortSignal.timeout`, three attempts,
  `[1000, 4000]` ms backoff on 403/429/5xx or a body that is not the expected
  `resultSets` shape; non-retryable statuses fail at once. Every terminal
  message names the URL and reason and states that no `manual_csv` fallback
  was taken.
- **The archive is frozen (owner decision 2026-10-01, spec Decision 11):**
  without `--season=` this adapter can only ever fetch the postseason derived
  from the run date, so an archived year cannot enter the plan. Enforcement is
  Story 2.3's own archive guard (`plan.ts:382-390`), untouched. With
  `--season=` pointed at an archived year the guard decides: identical source →
  skip, disagreeing source → non-zero abort naming the series, never a
  rewrite. Note the two different messages a drill can meet: a year the table
  holds as an unfinished **pending** series hits `plan.ts:377-379` ("the runner
  never rewrites stored games") when the source's games 1–6 differ — that is
  the stored-games guard, not the archived-outcome guard.

`scripts/probe-nba-com-adapter.mjs` is the committed live leg (owner-run per
Decision 12): it runs the SHIPPED adapter through a capturing fetch, prints
the TEAM_ID ↔ abbreviation ↔ resolved-id triples, and cross-checks one Game 7
against `boxscoretraditionalv2`.

## What the runner asserts before it writes (plan.ts)

1. **Either-slot-order identity** (AD-5): the `(year, pair)` must be absent
   from `series` in BOTH slot orders. The UNIQUE guards the pair as stored
   and cannot enforce the game-1-home convention, so a slot-swapped source
   row against an existing table row aborts the run — non-zero exit, nothing
   written, message names the row. The 00015 birth RPC repeats the same
   check in SQL, but as an unlocked `EXISTS`, so it narrows the window
   between two concurrent runs rather than closing it: it catches a twin that
   already committed, not one mid-insert. Simultaneous runs are therefore
   only safe when one writer exists — Story 2.6's scheduled CI run is that
   single writer.
2. **Game-1-home convention** (AD-5): `team_a_id` must equal game 1's
   `home_team_id`. The adapter derives the slots from the game-1 row, so this
   is the check that a hand-edited or future automated row keeps the first
   slot honest; a mismatch names the row and aborts.
3. **AD-4 derivation invariant**: a winner implies exactly the seven decided
   score rows `{1..7}` whose game-7 winner matches `winner_team_id` **and** a
   games-1-6 split of 3–3 (a 4–2 through six is an impossible shape, not a
   completion); a null winner implies exactly `{1..6}`, all decided (no
   ties), split 3–3. The game-number-set half reuses `deriveSeriesPhase`
   (`src/lib/series-phase.ts`) rather than restating it.
4. **Source self-consistency**: no duplicate identities in either slot
   order, no duplicate game numbers, every game between the two slots.
5. **Never-rewrite rules**: an existing row is only ever *completed* (append
   game 7 + fill winner) — stored games are never restyled, archived outcomes
   are never overwritten; a source that disagrees with the table aborts. Two
   table rows that mirror each other in both slot orders also abort: the
   runner refuses to pick one and write against half the truth.

Violations are `PlanAssertionError`s naming the offending row; the entry
point maps any failure to exit code 2 with zero writes issued (the plan is
fully computed and asserted before the sink is touched).

## Writes (writer.ts + migration 00015)

`PipelineSink` is the injectable seam (tests use a fake; no network):

- `readTeams()` / `readCurrent()` — service_role reads of `teams` and `series`
  with embedded `series_game_scores`.
- `birth(PlannedBirth)` → `SELECT pipeline_birth_series(p_year, p_round,
  p_team_a_id, p_team_b_id, p_scores jsonb)` — one RPC: series row + six
  score rows, one transaction, `ON CONFLICT ON CONSTRAINT
  series_year_team_pair_key` / `unique_series_game` handled in SQL, returns
  the server-generated uuid.
- `complete(PlannedCompletion)` → `SELECT pipeline_complete_series(p_series_id,
  p_game jsonb, p_winner_team_id)` — one RPC: append (or repair) game 7 and
  fill `winner_team_id`, one transaction.

The payload keys are the SQL parameter names verbatim, `p_`-prefixed:
`client.rpc(name, params)` hands the object to PostgREST, which binds by
**named** parameter, so a bare `year`/`scores` key would not match
`p_year`/`p_scores`. `scripts/rehearse-migration-00014.mjs` section 4 calls
both RPCs with `p_year => …` named notation against the replayed 00015 schema
and asserts both the accepted shapes and the rejections, which is the executed
evidence for this contract — no local test can see it, because the real
functions only exist on a database the agent never touches.

`service_role` comes from the environment (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` — non-`VITE_*`, NFR-S1); the runner never accepts
an anon key for writes. No step writes `series.status` — the column is gone
(00014). A `--dry-run` prints the plan and issues zero writes.

## Reference implementation: `manual_csv`

`supabase/scripts/pipeline/adapters/manualCsv.ts`. Two committed files under
`data/`:

- `series_manual.csv` — the **operator's live data**, and the default path.
  It is intentionally header-only outside a playoff window: an apply run
  writes exactly these rows to production, so a fabricated row becomes a real
  Active Series the moment it exists. An empty plan writes zero rows and exits
  0. Story 2.6's CI workflow reads the same file.
- `series_manual.example.csv` — the worked example (a finished 2016 GSW/CLE
  series plus a live 3–3), with the venue warning below. Tests never read
  either file; they pin their own fixture, so editing the operator's data
  cannot turn the gate red or green.

Long-format CSV, one row per game, columns in this order:

| column | meaning |
| --- | --- |
| `year` | calendar year of the series |
| `round` | free-text display label (one per series; mismatches name the row) |
| `game_number` | 1..7; the game-1 row fixes the slots (`home_team` → `team_a_id`) |
| `home_team` | `teams.abbreviation` (UNIQUE), resolved to `teams.id` at runtime |
| `away_team` | `teams.abbreviation` |
| `home_score` / `away_score` | final, decided scores; ties are rejected naming the row |

`#` lines and blank lines are comments. An abbreviation the `teams` table
does not hold fails the plan, naming the abbreviation and the line. The
adapter derives what the database derives: no winner column exists — a
series' `winner_team_id` is game 7's higher-scoring team when a game-7 row
is present, otherwise NULL. Completing a live series is **appending one
game-7 line** and running the pipeline (the operator cadence Story 2.6
documents: edit the CSV before the daily run slot).

`home_team`/`away_team` must be the real game-1-venue order for a new series,
because `team_a_id` is derived from it — but note what the archive holds:
measured over 178 archived series / 1,246 game rows, in 177 of the 178 every
game names the SAME team as home (the series' `team_a`). The archived rows
carry slots, not venues, so a future venue-correct adapter cannot reconcile
them row-for-row. See `docs/CURRENT_DATA_MODEL.md` § "The archive carries
slots, not venues".

## Operator usage

```
node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --season=2016-17 --dry-run
```

Requires **Node ≥ 22.18** (also 23.6+; the repo develops on 24) — `run.ts` is
a plain `.ts` file executed by Node's native type-stripping, with no build
step and no loader flag. Nothing in the repo enforces it: `package.json` has
no `engines` field, so on an older Node the first command fails at parse time
rather than with a readable message. `--csv=<path>` points `manual_csv` at a
different file; `--season=<YYYY-YY>` points `nba_com` at one postseason
(the archive is frozen — a drill onto an archived year reaches the archive
guard, never a rewrite). Each flag refuses the run when handed to the other
adapter.

`.env` supplies `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (owner-only;
never committed). Drop `--dry-run` to apply. Exit 0 = plan applied (or
empty); exit 2 = refused or failed, message names the row. Checked by
`npm run gate` end to end: Biome (`supabase/scripts/**/*.ts`),
`tsc -b` via `tsconfig.pipeline.json`, and Vitest `tests/pipeline/*.test.ts`
against the fake sink.
