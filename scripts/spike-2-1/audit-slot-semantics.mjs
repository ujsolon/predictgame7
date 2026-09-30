// Story 2.1 follow-up: does `team_a_id` carry a meaning the pipeline must preserve
// (home team of game 1), or is it an arbitrary slot?  This decides whether a
// (year, team_a_id, team_b_id) key can require canonical ordering or must compare
// the pair unordered.
import { readFileSync } from "node:fs";

const PAGE = 1000;
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

async function getAll(table, select, order) {
  const rows = [];
  let total = null;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${base}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${encodeURIComponent(order)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${table} ${from} -> ${res.status}`);
    total = Number((res.headers.get("content-range") ?? "").split("/")[1]) ?? total;
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (Number.isFinite(total) && rows.length >= total) break;
  }
  if (Number.isFinite(total) && rows.length !== total) throw new Error(`${table}: got ${rows.length}, server said ${total}`);
  return rows;
}

const series = await getAll("series", "id,year,round,team_a_id,team_b_id,winner_team_id", "year.asc");
const scores = await getAll("series_game_scores", "series_id,game_number,home_team_id,away_team_id,winner_team_id", "series_id.asc,game_number.asc");
const bySeries = new Map();
for (const s of scores) {
  const g = bySeries.get(s.series_id) ?? [];
  g.push(s);
  bySeries.set(s.series_id, g);
}

let firstGameHomeIsA = 0;
let firstGameHomeIsB = 0;
let noGame1 = 0;
const counters = {};
for (const s of series) {
  const rows = (bySeries.get(s.id) ?? []).slice().sort((a, b) => a.game_number - b.game_number);
  const g1 = rows.find((r) => r.game_number === 1);
  if (!g1) {
    noGame1 += 1;
    continue;
  }
  if (g1.home_team_id === s.team_a_id) firstGameHomeIsA += 1;
  else if (g1.home_team_id === s.team_b_id) firstGameHomeIsB += 1;
  // Is team_a ever the winner? If a slot were "winner first" it always would be.
  // A NULL winner (pending series) or one matching neither slot is not a B win —
  // tally it separately so it cannot silently corrupt the convention measurement.
  const wslot =
    s.winner_team_id == null ? "none" : s.winner_team_id === s.team_a_id ? "A" : s.winner_team_id === s.team_b_id ? "B" : "neither";
  counters[`winner_is_${wslot}`] = (counters[`winner_is_${wslot}`] ?? 0) + 1;
}

console.log(`series=${series.length} score rows=${scores.length} series with no game_number=1 row: ${noGame1}`);
console.log(`game 1 home team === team_a_id : ${firstGameHomeIsA} (${((firstGameHomeIsA / series.length) * 100).toFixed(1)}%)`);
console.log(`game 1 home team === team_b_id : ${firstGameHomeIsB}`);
console.log(`winner slot tally: ${JSON.stringify(counters)}`);
console.log(`\nReading: ${firstGameHomeIsA === series.length ? "the slots are NOT arbitrary." : `the slot convention is NOT universal — it holds in ${firstGameHomeIsA}/${series.length} rows only.`} team_a_id is the game-1 home team in ${firstGameHomeIsA} of ${series.length} rows (team_b in ${firstGameHomeIsB}, no game-1 row in ${noGame1}), and the series winner in ${counters.winner_is_A ?? 0} of them${counters.winner_is_none ? ` (${counters.winner_is_none} row(s) have no winner yet; ${counters.winner_is_neither ?? 0} name neither slot)` : ""} —`);
console.log(`so the 'team_a' slot ${firstGameHomeIsA === series.length ? "carries a convention (home-court side, or winner-first in the" : "only tends to carry a convention (home-court side, or winner-first in the"}`);
console.log(`backfill), not a canonical id ordering. A key over (team_a_id, team_b_id) therefore`);
console.log(`depends on every future writer honouring that convention; the constraint itself cannot`);
console.log(`enforce it, and a slot-swapped re-insert of the same matchup would slip past as a new row.`);
