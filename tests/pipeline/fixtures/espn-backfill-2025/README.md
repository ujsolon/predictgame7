# ESPN scoreboard payloads — the Story 2.18 spike (2025 first round)

Fourteen verbatim response bodies of
`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD`,
one file per date, `scoreboard-20250419.json` through `scoreboard-20250502.json`
(every date in that span). They are ESPN's bytes, written by `JSON.stringify` of
the parsed body. Nothing in them was trimmed or edited.

## Provenance

- **Fetched 2026-10-06** by a one-time research spike, under an **owner-released**
  exception to the no-agent-fetch rule (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-06.md`,
  "Evidence: a research spike").
- **DNS resolved through `1.1.1.1`** for that probe only, because the local
  resolver refuses `site.api.espn.com` (`RCODE_REFUSED`). Story 2.13's run sheet
  records the same refusal (`_bmad-output/specs/spec-2-13-espn-feed-adapter/run-sheet.md`).
  It is a property of the capture machine, not of the endpoint.
- **The probe** is kept beside the payloads as `spike-probe.mjs.txt`. The `.txt`
  suffix keeps it out of every gate and every runner, because it fetches the live host.
  It walked back single dates from DEN–LAC's Game 6 (2025-05-01) to Game 1. The
  GS–HOU walk from 2025-05-02 used the same shape.
- **What was measured** (26 requests, 0 errors, 177–852 ms):
  - DEN–LAC: Game 6 `competitions[0].series.summary` = `"Series tied 3-3"`, with
    `series.completed: false` and `series.competitors[].wins` 3 and 3. The
    adapter reads `completed` and the per-team `wins`; it never parses `summary`.
    Games 1–5 were found in 13 dates. Game 1 was at DEN.
  - GS–HOU: the same, with Game 1 at HOU.
  - `series.competitors[]` is ordered by ESPN's own rule, not by who won: GS–HOU
    read `[0,1]` after Game 1. Wins are therefore joined per team on
    `series.competitors[].id` = `competitors[].team.id`.

## Who reads them

`tests/pipeline/espn-adapter.test.ts`, block "Story 2.18". An injected fetch
maps `dates=` to these files. The two Game 7 dates come from the Story 2.13
captures one directory up: `espn-scoreboard-20250503-game7.json` and
`espn-scoreboard-20250504-mixed.json`. A date with no file answers an empty
scoreboard. No test reaches the network.

Do not regenerate these files: a test pins facts read off these exact bytes.
A new capture belongs in a new file with its own provenance.
