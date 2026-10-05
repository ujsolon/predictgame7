# Schedule amendment — 09:30 UTC → 07:30 UTC (owner call 2026-10-04)

Companion to `SPEC.md`. This is the one place the cadence's *minute* is argued; everything else
about the schedule is unchanged and stays as `spec-2-6-scheduled-pipelines` decided it.

## What moves, and what does not

| File | Line | From | To |
|---|---|---|---|
| `.github/workflows/keepalive.yml` | `:5` | `0 9 * * *` | `0 7 * * *` |
| `.github/workflows/pipeline-inseason.yml` | `:30`, `:31`, `:32` | `30 9 16-30 4 *` / `30 9 * 5 *` / `30 9 1-30 6 *` | `30 7 …` on all three — the day-of-month and month fields untouched |
| `.github/workflows/pipeline-inseason.yml` | `:11-13` comment | "09:30 UTC deliberately follows the 09:00 keepalive" | re-written to name the new pair **and the reason**, which is the only reason the comment has |
| `.github/workflows/pipeline-offseason.yml` | `:19`, `:20` | `30 9 12 4 *` / `30 9 25 6 *` | `30 7 12 4 *` / `30 7 25 6 *` |
| `tests/pipeline/workflows.test.ts` | `:98` (title), `:103`, `:142` | pins `30 9 …` | pinned to `30 7 …`; the title's "at 09:30 UTC" moves with it |

Not moving: the **bracket** (Apr 16–30, all of May, Jun 1–30), the three-lines-for-one-bracket
shape, `--require-feed` living only in the inseason file, the `concurrency` group, the
`notify-failure` composite, the dedupe rule, `nightly-gate.yml`, and D-7 (an un-run cron stays
unalarmable). `decisions.md` and `failure-modes.md` gain an **amendment line, not a rewrite** —
D-5's reasoning is evidence about why the slot looks the way it does, and the amendment keeps
that reasoning rather than overwriting it.

## Why the pair moves rather than the pipeline alone

`decisions.md:65` records exactly one reason for 09:30: "The time sits after the existing 09:00
UTC keepalive so a sleeping instance is not made this cadence's failure mode." The keepalive is a
single `GET /rest/v1/teams?select=id&limit=1` (`keepalive.yml:24-26`) against the same PostgREST
endpoint the pipeline uses for every read **and** every write. So the pipeline must stay after the
warm-up ping: moving only the pipeline to 07:30 would leave it as the day's first request to a
free-tier instance that may be asleep, which inverts D-5 instead of amending it. Hence 07:00 +
07:30, same 30-minute gap.

## What the move buys, and what it costs

**Buys:** Active Series refresh about two hours earlier in US evenings — the data is on the page
before the morning traffic that the Apr–Jun 2027 measurement (SM-1) depends on.

**Costs, stated honestly:** the non-Final margin shrinks. At 07:30 UTC the `America/New_York`
instant is 02:30 (winter) or 03:30 (summer). A 10:00 pm ET tip needs roughly 2.5–3 hours, so a
game reaching **triple overtime** can still be in progress when the run asks. If that happens:

- CAP-6 excludes it — non-Final is never admitted, and never defaulted — and `describeRun` names
  the exclusion;
- `feedSeriesCount` is counted **before** exclusions, so `--require-feed` still sees the game and
  stays green;
- the next morning asks for a *later* date, so that game is **never re-fetched**. The failure is a
  missing row, not a red run.

Under the shipped 09:30 slot the same margin was roughly four hours; under 07:30 it is 30–90
minutes. The detector for a missing row stays what `failure-modes.md` mode 2 already names —
**Story 2.7's row-count-vs-bracket read**, not the feed alarm — and CAP-8's probe is the leg that
gets to see a real `state == 'in'` payload, which is the shape nobody has ever fetched. The
premise that the 09:30 slot existed to guarantee finished games was never recorded anywhere; the
owner held it, and the amendment makes the actual trade visible instead of leaving it implied.

**Re-priced and kept, 2026-10-05.** Asked whether the margin is worth trading back, the owner kept
07:30/07:00 as shipped. The two rejected alternatives are recorded so a future session does not
re-propose them as if new: reverting to 09:30 (restores ~4 hours of margin and gives up the
early-refresh gain, which exists for SM-1's morning-traffic measurement), and adding a second
same-date pass later in the day (a second fetch of one date is new cadence surface and contradicts
the one-date-per-run owner call). No cron line changed on 2026-10-05; this paragraph is the
confirmation, and the file stays the record of the 2026-10-04 call.
