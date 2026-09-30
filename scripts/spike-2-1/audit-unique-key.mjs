// Story 2.1 follow-up audit: which column combination can actually serve as the
// idempotent upsert key AD-5 asks for?
//
// Why: `series` was specified to get UNIQUE(year, round), but the archive stores the
// seven-game series only, so a round in a year legitimately holds several of them. This
// measures the duplicate count for each candidate key against the live table instead of
// reasoning about it, including whether a team-pair key needs canonical ordering.
//
// Read path: PostgREST with the anon key, GET only, paged with `Prefer: count=exact` and
// the `Content-Range` echo checked, because PostgREST truncates silently at max-rows.
//
// Usage: node scripts/spike-2-1/audit-unique-key.mjs
// Exit: 0 = audit completed (it may report that no candidate is unique), 2 = could not run.

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

const group = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
};

const report = (label, map) => {
  const dupes = [...map].filter(([, members]) => members.length > 1);
  const extra = dupes.reduce((n, [, m]) => n + m.length - 1, 0);
  const sizes = {};
  for (const [, m] of dupes) sizes[m.length] = (sizes[m.length] ?? 0) + 1;
  console.log(`\n${label}`);
  console.log(`  distinct groups=${map.size}  duplicate groups=${dupes.length}  rows beyond one-per-group=${extra}`);
  console.log(`  duplicate group sizes=${JSON.stringify(sizes)}`);
  for (const [k, m] of dupes.slice(0, 6)) {
    console.log(`  ${k}: ${m.length} rows -> ${m.map((r) => `${r.id}`).join(", ")}`);
  }
  return dupes.length;
};

async function main() {
  const env = readViteEnv();
  const base = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) {
    console.error(".env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    process.exit(2);
  }

  const rows = await getAll(base, key, "series", "id,year,round,team_a_id,team_b_id,winner_team_id,status", "year.asc,round.asc");
  console.log(`series rows fetched: ${rows.length}`);

  const nullTeams = rows.filter((r) => r.team_a_id == null || r.team_b_id == null);
  console.log(`rows with a NULL team id: ${nullTeams.length}${nullTeams.length ? ` -> ${nullTeams.map((r) => r.id).join(", ")}` : ""}`);
  const sameTeam = rows.filter((r) => r.team_a_id === r.team_b_id);
  console.log(`rows with team_a_id === team_b_id: ${sameTeam.length}`);
  const uncannonical = rows.filter((r) => r.team_a_id != null && r.team_b_id != null && Number(r.team_a_id) > Number(r.team_b_id));
  console.log(`rows stored with team_a_id > team_b_id (so the pair is NOT canonically ordered): ${uncannonical.length} of ${rows.length}`);

  const pair = (r, ordered) =>
    r.team_a_id == null || r.team_b_id == null
      ? `${r.year}|nullpair|${r.id}`
      : ordered
        ? `${r.year}|${r.team_a_id}-${r.team_b_id}`
        : `${r.year}|${[Number(r.team_a_id), Number(r.team_b_id)].sort((a, b) => a - b).join("-")}`;

  console.log("\n== candidate uniqueness keys ==");
  const d1 = report("(year, round)                 [AD-5 as specified]", group(rows, (r) => `${r.year}|${r.round}`));
  const d2 = report("(year, team pair, unordered)  [owner's proposal]", group(rows, (r) => pair(r, false)));
  const d3 = report("(year, team_a, team_b) ordered", group(rows, (r) => pair(r, true)));
  const d4 = report("(year, round, team pair)", group(rows, (r) => `${pair(r, false)}|${r.round}`));

  console.log("\n== verdict ==");
  const unique = [["(year, round)", d1], ["(year, unordered pair)", d2], ["(year, ordered pair)", d3], ["(year, round, pair)", d4]].filter(([, n]) => n === 0).map(([l]) => l);
  console.log(`duplicate-free candidates: ${unique.length ? unique.join(", ") : "NONE"}`);

  console.log("\n== why (year, round) collides: series per (year, round) ==");
  const byRound = group(rows, (r) => `${r.year}|${r.round}`);
  const hist = {};
  for (const [, m] of byRound) hist[m.length] = (hist[m.length] ?? 0) + 1;
  console.log(`  groups-of-n histogram: ${JSON.stringify(hist)}`);
  const worst = [...byRound].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  for (const [k, m] of worst) console.log(`  ${k}: ${m.length} seven-game series in that one round`);

  console.log("\n== round domain (the CHECK's problem) ==");
  const rounds = group(rows, (r) => r.round);
  console.log(`  distinct round values: ${rounds.size}`);
  for (const [name, m] of [...rounds].sort((a, b) => b[1].length - a[1].length)) {
    const years = [...new Set(m.map((r) => r.year))].sort((a, b) => a - b);
    console.log(`  ${String(m.length).padStart(3)}  ${name}   [years ${years[0]}..${years[years.length - 1]}]`);
  }

  console.log("\n== era check: can one canonical name per round be inferred? ==");
  const families = new Map();
  for (const name of rounds.keys()) {
    const conf = name.match(/East|West/i)?.[0] ?? "neutral";
    const stage = /Finals$/i.test(name) && !/Conf|Div/i.test(name) ? "Finals" : /Final/i.test(name) ? "ConfFinals" : /Semifinal/i.test(name) ? "Semifinals" : /First Round|Division Semifinal|Div Semifinal|Quarterfinal/i.test(name) ? "FirstRound" : "other";
    const fam = `${conf}/${stage}`;
    families.set(fam, [...(families.get(fam) ?? []), name]);
  }
  for (const [fam, names] of [...families].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${fam}: ${names.length} spellings -> ${names.join(" | ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`audit could not run: ${err.message}`);
  process.exit(2);
});
