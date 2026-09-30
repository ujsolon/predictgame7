// Story 2.1 spike — read-only archive audit (proposal §4.10).
//
// Why this exists: Story 2.2 builds the derived-phase rule (AD-4) on the premise that every
// archived series carries seven decided score rows and a decided winner. That premise has been
// asserted in three places with three different totals — 177, 178, and 172+5 — and never
// measured. The epic calls it 2.1's acceptance criterion, so 2.1 measures it.
//
// Read path: PostgREST with the anon key, which is the only DB path this repo has that needs no
// secret beyond what the browser already holds. It is the same surface the app reads, so what the
// audit sees is what the pickers see. No writes, ever — GET only, with `Prefer: count=exact` and
// the `Content-Range` echo checked on every page, because PostgREST caps a response at the
// server's max-rows setting *silently*: a single un-paged select of 1,246 score rows can return
// 1,000 and read as a complete table.
//
// Usage: node scripts/spike-2-1/audit-archive.mjs
// Exit: 0 = audit completed (the audit itself may report anomalies), 2 = could not run.

import { readFileSync } from "node:fs";

const PAGE = 500;

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
    const url = `${base}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${encodeURIComponent(order)}`;
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
    const range = res.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1]);
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
  return { rows, declaredTotal };
}

const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

async function main() {
  const env = readViteEnv();
  const base = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) {
    console.error(".env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    process.exit(2);
  }

  const series = await getAll(base, key, "series", "id,year,round,team_a_id,team_b_id,winner_team_id,status", "year.asc,id.asc");
  const scores = await getAll(base, key, "series_game_scores", "series_id,game_number,home_team_id,away_team_id,home_score,away_score,winner_team_id", "series_id.asc,game_number.asc");

  const seriesRows = series.rows;
  const scoreRows = scores.rows;

  console.log("Story 2.1 — read-only archive audit (PostgREST, anon key, GET only)\n");
  console.log(`series               ${seriesRows.length} rows (server declared ${series.declaredTotal})`);
  console.log(`series_game_scores   ${scoreRows.length} rows (server declared ${scores.declaredTotal})`);

  // --- rows-per-series histogram -------------------------------------------------------------
  const perSeries = new Map();
  for (const row of scoreRows) {
    perSeries.set(row.series_id, (perSeries.get(row.series_id) ?? 0) + 1);
  }
  const hist = new Map();
  for (const row of seriesRows) {
    const n = perSeries.get(row.id) ?? 0;
    hist.set(n, (hist.get(n) ?? 0) + 1);
  }
  const orphanSeries = [...perSeries.keys()].filter((id) => !seriesRows.some((row) => row.id === id));

  console.log("\n== score rows per series ==");
  for (const n of [...hist.keys()].sort((a, b) => a - b)) {
    console.log(`  ${String(n).padStart(2)} rows: ${hist.get(n)} series  (${pct(hist.get(n), seriesRows.length)})`);
  }
  if (orphanSeries.length) {
    console.log(`  !! ${orphanSeries.length} series_game_scores.series_id value(s) match no series row: ${orphanSeries.slice(0, 5).join(", ")}`);
  }

  // --- the AD-4 derivation, cross-tabulated --------------------------------------------------
  const nullWinner = seriesRows.filter((row) => row.winner_team_id === null);
  const decided = seriesRows.filter((row) => row.winner_team_id !== null);
  const decidedWith7 = decided.filter((row) => (perSeries.get(row.id) ?? 0) === 7);
  const decidedNot7 = decided.filter((row) => (perSeries.get(row.id) ?? 0) !== 7);
  const pendingWith6 = nullWinner.filter((row) => (perSeries.get(row.id) ?? 0) === 6);
  const pendingNot6 = nullWinner.filter((row) => (perSeries.get(row.id) ?? 0) !== 6);

  console.log("\n== AD-4 premise, measured ==");
  console.log(`  winner set  & exactly 7 score rows : ${decidedWith7.length} / ${decided.length} decided series`);
  console.log(`  winner set  & NOT 7 score rows     : ${decidedNot7.length}  <- these are what the derivation would mis-file`);
  for (const row of decidedNot7.slice(0, 12)) {
    console.log(`      ${row.year} ${row.round} (id ${row.id}) has ${perSeries.get(row.id) ?? 0} rows`);
  }
  console.log(`  winner NULL & exactly 6 score rows : ${pendingWith6.length}`);
  console.log(`  winner NULL & NOT 6 score rows     : ${pendingNot6.length}`);
  for (const row of pendingNot6.slice(0, 12)) {
    console.log(`      ${row.year} ${row.round} (id ${row.id}) has ${perSeries.get(row.id) ?? 0} rows`);
  }

  // --- score-row integrity -------------------------------------------------------------------
  const nullScoreGames = scoreRows.filter((row) => row.home_score === null || row.away_score === null);
  const nullGameWinner = scoreRows.filter((row) => row.winner_team_id === null);
  const decidedTieGames = scoreRows.filter((row) => row.home_score !== null && row.home_score === row.away_score);
  const badGameNumbers = scoreRows.filter((row) => !(row.game_number >= 1 && row.game_number <= 7));

  console.log("\n== score-row integrity ==");
  console.log(`  rows with a NULL score            : ${nullScoreGames.length}`);
  console.log(`  rows with NULL winner_team_id     : ${nullGameWinner.length}`);
  console.log(`  rows with home_score == away_score: ${decidedTieGames.length}  (NBA games cannot tie)`);
  console.log(`  rows with game_number outside 1-7 : ${badGameNumbers.length}`);

  // Duplicate (series, game_number) pairs are what Story 2.2's UNIQUE(year, round) cannot catch
  // but the pipeline's upsert target must be able to.
  const seenGame = new Map();
  for (const row of scoreRows) {
    const k = `${row.series_id}:${row.game_number}`;
    seenGame.set(k, (seenGame.get(k) ?? 0) + 1);
  }
  const dupGames = [...seenGame.entries()].filter(([, n]) => n > 1);
  console.log(`  duplicate (series_id, game_number): ${dupGames.length}${dupGames.length ? ` -> ${dupGames.slice(0, 5).map(([k, n]) => `${k} x${n}`).join(", ")}` : ""}`);

  // --- Story 2.2's migration pre-flight -------------------------------------------------------
  const byYearRound = new Map();
  for (const row of seriesRows) {
    const k = `${row.year}|${row.round}`;
    byYearRound.set(k, [...(byYearRound.get(k) ?? []), row.id]);
  }
  const dupYearRound = [...byYearRound.entries()].filter(([, ids]) => ids.length > 1);
  console.log("\n== Story 2.2 pre-flight: UNIQUE(year, round) ==");
  console.log(`  duplicate (year, round) groups    : ${dupYearRound.length}`);
  for (const [k, ids] of dupYearRound.slice(0, 10)) {
    console.log(`      ${k} -> ${ids.length} series (${ids.join(", ")})`);
  }

  const roundDomain = new Map();
  for (const row of seriesRows) roundDomain.set(row.round, (roundDomain.get(row.round) ?? 0) + 1);
  console.log("\n== `round` value domain (feeds AD-5's CHECK) ==");
  for (const [value, n] of [...roundDomain.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(value)}`);
  }

  const statusDomain = new Map();
  for (const row of seriesRows) statusDomain.set(row.status, (statusDomain.get(row.status) ?? 0) + 1);
  console.log("\n== `status` domain (vestigial; 2.2 drops it) ==");
  for (const [value, n] of statusDomain) console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(value)}`);

  const years = seriesRows.map((row) => row.year).sort((a, b) => a - b);
  console.log(`\n== year range == ${years[0]}..${years.at(-1)} across ${new Set(years).size} distinct years`);

  console.log("\nThe audit reports; it does not judge. Anomalies are the finding Story 2.2 needs");
  console.log("before its derivation ships, not a pass/fail for this story.");
}

main().catch((error) => {
  console.error(`audit could not complete: ${error.message}`);
  process.exit(2);
});
