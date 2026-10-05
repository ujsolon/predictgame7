// Story 2.7, leg 1 — read-only reconciliation of production's archive against the pinned facts.
//
// What it asserts, each as a MEASURED LITERAL (a mismatch is a red finding, never a re-pin —
// spec-2-7 Boundaries · Always):
//   - 178 series, 1,246 score rows, every series exactly seven, zero null winners (Story 2.1's
//     audit, FR-19);
//   - league composition 159 NBA + 1 BAA + 18 ABA, zero NULL (Story 2.8's `00016`, post-apply);
//   - the Game-7 census over `league IN ('NBA','BAA')` game-7 rows ONLY: population 160, home wins
//     117 (43 home losses). That population is the only archived home-court evidence there is —
//     every other archived `home_team_id` is a winner-slot fiction (AGENTS.md, `00016`), so the
//     census is computed from game 7 of NBA/BAA rows and from nothing else;
//   - `insights_cache.game_6_winner_stats.total_game_sevens` = 160 (Story 2.5's `00017`), plus
//     `home_team_stats` agreeing with the census the script just measured (117 of 160).
//
// The archive's 178 and the insights' 160 are printed side by side at the end — the reconciliation
// the epic asks to be shown, not inferred.
//
// Read path: PostgREST GETs with the anon key from `.env` (client-visible by design, NFR-S1; read,
// never printed). No write of any kind. Every page is fetched with `Prefer: count=exact` and the
// `Content-Range` total is checked, because PostgREST caps a response at max-rows silently.
//
// Usage: node scripts/drill-2-7-reconcile.mjs
// Exit: 0 = every figure reconciled; 1 = at least one figure mismatched (each named on its own
// line); 2 = the reconciliation could not run (missing env, HTTP error). Exit codes go through
// `process.exitCode`, never `process.exit()` (the Windows libuv race, deferred-work.md W1).

import { readFileSync } from "node:fs";

const PAGE = 500;

const PINNED = {
  series: 178,
  scoreRows: 1246,
  rowsPerSeries: 7,
  nullWinners: 0,
  league: { NBA: 159, BAA: 1, ABA: 18 },
  nullLeague: 0,
  g7Population: 160,
  g7HomeWins: 117,
  g7HomeLosses: 43,
  insightsTotalGameSevens: 160,
};

function readViteEnv(file = ".env") {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

async function getAll(base, key, table, select, order) {
  const rows = [];
  let declaredTotal = null;
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const url = `${base}/rest/v1/${table}?select=${encodeURIComponent(select)}${order ? `&order=${encodeURIComponent(order)}` : ""}`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
        Range: `${from}-${to}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) {
      throw new Error(`${table} page ${from}-${to} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const total = Number((res.headers.get("content-range") ?? "").split("/")[1]);
    if (Number.isFinite(total)) declaredTotal = total;
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`${table} page ${from} returned a non-array body`);
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (declaredTotal !== null && rows.length >= declaredTotal) break;
  }
  if (declaredTotal !== null && rows.length !== declaredTotal) {
    throw new Error(`${table}: fetched ${rows.length} rows but the server declared ${declaredTotal}`);
  }
  return rows;
}

async function main() {
  const env = readViteEnv();
  const base = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) {
    console.error(".env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    process.exitCode = 2;
    return;
  }

  const series = await getAll(base, key, "series", "id,year,league,winner_team_id", "id.asc");
  const scores = await getAll(
    base,
    key,
    "series_game_scores",
    "series_id,game_number,home_team_id,away_team_id,home_score,away_score",
    "series_id.asc,game_number.asc",
  );
  const insights = await getAll(base, key, "insights_cache", "insight_key,insight_value,updated_at", "insight_key.asc");

  const failures = [];
  const check = (label, measured, expected) => {
    const ok = measured === expected;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: measured ${measured}, pinned ${expected}`);
    if (!ok) failures.push(label);
  };

  console.log("Story 2.7 leg 1 — production reconciliation (PostgREST, anon key, GET only)\n");

  // --- totals and the seven-each shape ------------------------------------------------------
  check("series rows", series.length, PINNED.series);
  check("series_game_scores rows", scores.length, PINNED.scoreRows);
  const perSeries = new Map();
  for (const row of scores) perSeries.set(row.series_id, (perSeries.get(row.series_id) ?? 0) + 1);
  const notSeven = series.filter((row) => (perSeries.get(row.id) ?? 0) !== PINNED.rowsPerSeries);
  check("series whose score-row count is not exactly seven", notSeven.length, 0);
  const seriesIds = new Set(series.map((row) => row.id));
  const orphans = [...perSeries.keys()].filter((id) => !seriesIds.has(id));
  check("score rows naming no series", orphans.length, 0);
  check("series with a NULL winner_team_id", series.filter((row) => row.winner_team_id === null).length, PINNED.nullWinners);

  // --- league composition (00016) -----------------------------------------------------------
  const leagueCount = (league) => series.filter((row) => row.league === league).length;
  for (const [league, expected] of Object.entries(PINNED.league)) {
    check(`league = '${league}'`, leagueCount(league), expected);
  }
  check("league IS NULL", series.filter((row) => row.league == null).length, PINNED.nullLeague);
  const otherLeagues = series.filter((row) => row.league != null && !(row.league in PINNED.league));
  check("league outside {NBA, BAA, ABA}", otherLeagues.length, 0);

  // --- the Game-7 census: game 7 of league IN ('NBA','BAA') rows, nothing else ----------------
  const venueReal = new Set(series.filter((row) => row.league === "NBA" || row.league === "BAA").map((row) => row.id));
  const g7 = scores.filter((row) => row.game_number === 7 && venueReal.has(row.series_id));
  const homeWins = g7.filter((row) => row.home_score > row.away_score).length;
  check("NBA/BAA game-7 population", g7.length, PINNED.g7Population);
  check("NBA/BAA game-7 home wins", homeWins, PINNED.g7HomeWins);
  check("NBA/BAA game-7 home losses", g7.length - homeWins, PINNED.g7HomeLosses);

  // --- the insights cache (00017) -----------------------------------------------------------
  const insight = (k) => insights.find((row) => row.insight_key === k)?.insight_value ?? null;
  const g6 = insight("game_6_winner_stats");
  const home = insight("home_team_stats");
  check("insights_cache game_6_winner_stats.total_game_sevens", g6?.total_game_sevens ?? null, PINNED.insightsTotalGameSevens);
  check("insights_cache home_team_stats.total_game_sevens", home?.total_game_sevens ?? null, PINNED.insightsTotalGameSevens);
  check("insights_cache home_team_stats.home_team_wins (against the census above)", home?.home_team_wins ?? null, homeWins);
  const refreshedAt = insights.map((row) => row.updated_at).sort().at(-1) ?? "n/a";

  // --- side by side --------------------------------------------------------------------------
  console.log("\n== the two denominators, side by side ==");
  console.log(`  archive (/historical)      ${series.length} series = ${leagueCount("NBA")} NBA + ${leagueCount("BAA")} BAA + ${leagueCount("ABA")} ABA`);
  console.log(`  insight cards (/insights)  ${g6?.total_game_sevens ?? "n/a"} Game 7s = the NBA + BAA rows; the ${leagueCount("ABA")} ABA rows are archived, not counted`);
  console.log(`  ${series.length} - ${leagueCount("ABA")} = ${series.length - leagueCount("ABA")}; insights cache last refreshed ${refreshedAt}`);

  if (failures.length) {
    console.log(`\nRED: ${failures.length} figure(s) did not reconcile — ${failures.join("; ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nGREEN: every pinned figure reconciled against production.");
}

main().catch((error) => {
  console.error(`reconciliation could not run: ${error.message}`);
  process.exitCode = 2;
});
