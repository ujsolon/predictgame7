// Story 2.7, leg 2 — the derivation write leg on a throwaway stack (owner decision D1).
//
// What it proves, end to end, with no production write anywhere:
//   a pending series is BORN by the shipped runner (`run.ts --source=manual_csv`, through 00015's
//   `pipeline_birth_series`), shows in the picker's "Current Game 7s" group and as a Home link
//   because it has six score rows and a NULL winner — no flag says so — stays off /historical,
//   survives an identical re-run with zero writes, and on the next night LEAVES the Active group
//   and ENTERS the archive on the single write that fills its winner (`pipeline_complete_series`),
//   with game 7's score on its record and the insight cards' denominators moving by exactly one
//   (00017's refresh fires on a winner-filling run). A second series is born the same night and
//   completed the night after with a road win in the `team_b` slot, so the picker ends empty again.
//
// The stack, all local and all removed at the end (unless --keep):
//   - Docker `postgres:16` replaying supabase/migrations/00001..00018 in filename order, with the
//     178x7 fixture archive seeded immediately before 00016 — the same bootstrap and seed
//     `scripts/rehearse-migration-00014.mjs` certifies (its assertions are not repeated here);
//   - a `postgrest/postgrest` container on a private Docker network, reached through an in-process
//     proxy at http://127.0.0.1:54321 that maps Supabase's `/rest/v1/*` onto PostgREST's root and
//     answers CORS, so supabase-js (runner AND browser bundle) talks to it unmodified;
//   - anon / service_role JWTs minted here (HS256) against a per-run secret: nothing is read from
//     `.env` for the database, and no real key is used or printed;
//   - a production bundle built with VITE_SUPABASE_URL/ANON_KEY pointed at the proxy
//     (`vite build --outDir dist-drill-2-7`) served by `vite preview` on :4174, driven over CDP by
//     the Story 2.7 harness in scripts/measure-predict-latency.mjs (PostHog answered locally there).
//
// Usage:  node scripts/drill-2-7-local-stack.mjs [--keep]
//   --keep  leave the stack and the preview running after the assertions (Ctrl+C tears it down),
//           so the owner can look at http://localhost:4174/predictgame7/ by hand.
// Needs:  Docker Desktop running (`docker ps` answers), Node >= 22.18, Chrome/Edge installed.
// Exit:   0 = every assertion held; 1 = at least one assertion failed (each printed as FAIL);
//         2 = the stack could not be brought up (Docker down, image pull, build) — infra, not a red;
//         130 = interrupted (Ctrl+C), after the teardown below.
// Exit codes go through process.exitCode, never process.exit() (the Windows libuv race, W1) —
// with the SIGINT path as the one exception, so an interrupt cannot be re-reported as 1 or 2.

import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createLedger, openBrowserSession } from "./measure-predict-latency.mjs";

const venueBackfill = await import("../supabase/scripts/pipeline/venueBackfill.ts");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const fixturesDir = join(repoRoot, "tests", "fixtures", "drill-2-7");
const runTs = join(repoRoot, "supabase", "scripts", "pipeline", "run.ts");
const viteBin = join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const distDir = "dist-drill-2-7";

const tag = `pg7-drill-2-7-${process.pid}`;
const net = `${tag}-net`;
const pgName = `${tag}-pg`;
const restName = `${tag}-rest`;
const dbName = "drill";
const authPassword = randomBytes(12).toString("hex");
const jwtSecret = randomBytes(32).toString("hex");
const PROXY_PORT = 54321;
const PREVIEW_PORT = 4174;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
const PREVIEW_BASE = `http://localhost:${PREVIEW_PORT}/predictgame7/`;
const DOCKER_TIMEOUT_MS = 10 * 60 * 1000;

const keep = process.argv.includes("--keep");
const unknown = process.argv.slice(2).filter((a) => a !== "--keep");
if (unknown.length) {
  console.error(`unrecognised argument(s): ${unknown.join(" ")} — the only flag is --keep`);
  process.exitCode = 2;
}

class InfraError extends Error {}

// --- docker / psql ------------------------------------------------------------------------------

function docker(args, { input, allowFail, timeout = DOCKER_TIMEOUT_MS } = {}) {
  const res = spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, timeout });
  if (res.error) throw new InfraError(`docker ${args[0]} failed to run: ${res.error.message}. Is Docker Desktop running? (docker ps)`);
  if (res.status !== 0 && !allowFail) {
    throw new InfraError(`docker ${args.slice(0, 2).join(" ")} exited ${res.status}:\n${`${res.stdout ?? ""}${res.stderr ?? ""}`.trim()}`);
  }
  return res;
}

function psql({ file, sql }) {
  const exec = file !== undefined ? ["exec", "-i"] : ["exec"];
  const session = file !== undefined ? ["-f", "-"] : ["-tA", "-c", sql];
  const res = docker([...exec, pgName, "psql", "-U", "postgres", "-d", dbName, "-v", "ON_ERROR_STOP=1", ...session], { input: file, allowFail: true });
  if (res.status !== 0) throw new InfraError(`psql failed (exit ${res.status}):\n${res.stdout ?? ""}${res.stderr ?? ""}`);
  return res.stdout.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(1000);
  }
  throw new InfraError(`${what} did not come up within ${seconds}s`);
}

// --- JWTs ---------------------------------------------------------------------------------------

function mintJwt(role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "drill-2-7", iat: now, exp: now + 6 * 3600 })}`;
  return `${body}.${createHmac("sha256", jwtSecret).update(body).digest("base64url")}`;
}

// --- the proxy: Supabase's /rest/v1 on top of PostgREST's root ------------------------------------

function startProxy(restPort) {
  const server = http.createServer((req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "Content-Range, Content-Profile, Preference-Applied",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, "Access-Control-Max-Age": "600" });
      res.end();
      return;
    }
    if (!req.url.startsWith("/rest/v1/")) {
      res.writeHead(404, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `drill stack serves /rest/v1 only, not ${req.url.split("?")[0]}` }));
      return;
    }
    const headers = { ...req.headers, host: `127.0.0.1:${restPort}` };
    const up = http.request({ host: "127.0.0.1", port: restPort, path: req.url.slice("/rest/v1".length), method: req.method, headers }, (upRes) => {
      const out = Object.fromEntries(Object.entries(upRes.headers).filter(([k]) => !k.toLowerCase().startsWith("access-control-")));
      res.writeHead(upRes.statusCode ?? 502, { ...out, ...cors });
      upRes.pipe(res);
    });
    up.on("error", (e) => {
      // An upstream failure mid-body (teardown's `docker rm -f`, a container death) lands here
      // with the response already started; writeHead would then throw ERR_HTTP_HEADERS_SENT and
      // kill the drill with a stack and exit 1 instead of the InfraError / exit 2 it documents.
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      res.writeHead(502, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `PostgREST unreachable: ${e.message}` }));
    });
    req.pipe(up);
  });
  return new Promise((resolve, reject) => {
    server.once("error", (e) => reject(new InfraError(`proxy could not listen on ${PROXY_PORT}: ${e.message}`)));
    server.listen(PROXY_PORT, "127.0.0.1", () => resolve(server));
  });
}

// --- child processes that talk to the proxy (async: a spawnSync would block the proxy) ------------

function run(cmd, args, env, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: repoRoot, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (!quiet) process.stdout.write(`       | ${d.toString().replace(/\n(?=.)/g, "\n       | ")}`);
    });
    child.stderr.on("data", (d) => {
      out += d;
      if (!quiet) process.stdout.write(`       ! ${d.toString().replace(/\n(?=.)/g, "\n       ! ")}`);
    });
    child.on("close", (code) => resolve({ code, out }));
  });
}

const serviceKey = () => mintJwt("service_role");
const pipeline = (args) =>
  run(process.execPath, [runTs, ...args], { SUPABASE_URL: PROXY_URL, SUPABASE_SERVICE_ROLE_KEY: serviceKey() });

// --- teardown -------------------------------------------------------------------------------------

const live = { proxy: null, preview: null, browser: null, containers: false };
let tornDown = false;
function teardown() {
  if (tornDown) return;
  tornDown = true;
  try {
    live.browser?.close();
  } catch {}
  try {
    live.preview?.kill();
  } catch {}
  try {
    live.proxy?.close();
    // close() alone waits on keep-alive sockets, which hung the process after Ctrl+C.
    live.proxy?.closeAllConnections();
  } catch {}
  if (live.containers) {
    docker(["rm", "-f", restName, pgName], { allowFail: true });
    docker(["network", "rm", net], { allowFail: true });
  }
  try {
    rmSync(join(repoRoot, distDir), { recursive: true, force: true });
  } catch {}
}

// --- bring-up -------------------------------------------------------------------------------------

async function bringUp() {
  const files = readdirSync(migrationsDir).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
  const m016 = files.find((f) => f.startsWith("00016"));
  if (!m016) throw new InfraError("supabase/migrations has no 00016 — the fixture archive is seeded immediately before it");
  const curated = venueBackfill.parseVenuesCsv(readFileSync(venueBackfill.CURATED_CSV_PATH, "utf8"), "game7_venues_curated.csv");
  const seed = venueBackfill.renderFixtureSeed(curated);

  // A stopped Docker Desktop makes the CLI hang rather than fail; probe with a short ceiling.
  docker(["version", "--format", "{{.Server.Version}}"], { timeout: 20000 });
  live.containers = true;
  docker(["network", "create", net]);
  docker(["run", "-d", "--name", pgName, "--network", net, "-e", `POSTGRES_PASSWORD=${tag}`, "-e", `POSTGRES_DB=${dbName}`, "postgres:16"]);
  await waitFor("postgres", () => docker(["exec", pgName, "psql", "-U", "postgres", "-d", dbName, "-tA", "-c", "SELECT 1"], { allowFail: true }).stdout?.trim() === "1");

  // Environment scaffolding — the rehearsal's roles plus what Supabase's platform gives every
  // project and PostgREST needs: an authenticator login, BYPASSRLS on service_role, schema usage,
  // and the platform's default grants (RLS, enabled by 00011, is what actually restricts anon).
  psql({
    file: `
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${authPassword}';
      GRANT anon, authenticated, service_role TO authenticator;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    `,
  });
  for (const file of files) {
    if (file === m016) psql({ file: seed });
    psql({ file: readFileSync(join(migrationsDir, file), "utf8") });
  }
  console.log(`stack  replayed ${files.length} migrations (${files[0]} .. ${files.at(-1)}), fixture archive seeded before ${m016}`);

  docker([
    "run", "-d", "--name", restName, "--network", net, "-p", "127.0.0.1::3000",
    "-e", `PGRST_DB_URI=postgres://authenticator:${authPassword}@${pgName}:5432/${dbName}`,
    "-e", "PGRST_DB_SCHEMAS=public",
    "-e", "PGRST_DB_ANON_ROLE=anon",
    "-e", `PGRST_JWT_SECRET=${jwtSecret}`,
    "postgrest/postgrest:v12.2.3",
  ]);
  const mapped = docker(["port", restName, "3000/tcp"]).stdout.trim().split(/\r?\n/)[0];
  const restPort = Number(mapped.split(":").pop());
  live.proxy = await startProxy(restPort);
  const anon = mintJwt("anon");
  let lastAnswer = "no response";
  try {
    await waitFor("PostgREST", async () => {
      const r = await fetch(`${PROXY_URL}/rest/v1/teams?select=id&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }).catch((e) => {
        lastAnswer = e.message;
        return null;
      });
      if (r && !r.ok) lastAnswer = `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`;
      return r?.ok;
    });
  } catch (err) {
    const logs = docker(["logs", "--tail", "40", restName], { allowFail: true });
    throw new InfraError(`${err.message}; last answer through the proxy: ${lastAnswer}
--- docker logs ${restName} ---
${`${logs.stdout ?? ""}${logs.stderr ?? ""}`.trim()}`);
  }
  console.log(`stack  PostgREST on 127.0.0.1:${restPort}, proxied as ${PROXY_URL}/rest/v1`);

  // The insight cards need a populated cache; the operator refresh is the shipped path for that.
  const refresh = await pipeline(["--refresh-insights"]);
  if (refresh.code !== 0) throw new InfraError(`initial --refresh-insights exited ${refresh.code}`);

  console.log(`build  vite build --outDir ${distDir} (VITE_SUPABASE_URL=${PROXY_URL})`);
  const build = await run(process.execPath, [viteBin, "build", "--outDir", distDir, "--emptyOutDir"], { VITE_SUPABASE_URL: PROXY_URL, VITE_SUPABASE_ANON_KEY: anon }, { quiet: true });
  if (build.code !== 0) throw new InfraError(`vite build exited ${build.code}:\n${build.out.slice(-2000)}`);
  live.preview = spawn(process.execPath, [viteBin, "preview", "--outDir", distDir, "--port", String(PREVIEW_PORT), "--strictPort"], { cwd: repoRoot, stdio: "ignore" });
  await waitFor("vite preview", async () => (await fetch(`${PREVIEW_BASE}predict`).catch(() => null))?.ok, 60);
  console.log(`build  preview on ${PREVIEW_BASE}`);
  console.log("build  the bundle was built with (to rebuild it by hand against this stack while --keep holds it up):");
  console.log(`         VITE_SUPABASE_URL=${PROXY_URL}`);
  console.log(`         VITE_SUPABASE_ANON_KEY=${anon}   # minted for this run only, against a throwaway secret\n`);
}

// --- what the stack and the UI say, at each step ------------------------------------------------

function dbState() {
  const row = psql({
    sql: `SELECT json_build_object(
      'series', (SELECT count(*) FROM public.series),
      'pending', (SELECT count(*) FROM public.series WHERE winner_team_id IS NULL),
      'scores', (SELECT count(*) FROM public.series_game_scores),
      'fingerprint', (SELECT md5(coalesce(string_agg(row_to_json(s)::text, ',' ORDER BY s.id), ''))
                        || md5(coalesce((SELECT string_agg(row_to_json(g)::text, ',' ORDER BY g.series_id, g.game_number) FROM public.series_game_scores g), ''))
                      FROM public.series s),
      'drill', (SELECT coalesce(json_agg(json_build_object('pair', ta.abbreviation || '/' || tb.abbreviation, 'winner', w.abbreviation,
                  'games', (SELECT count(*) FROM public.series_game_scores g WHERE g.series_id = s.id)) ORDER BY ta.abbreviation), '[]'::json)
                FROM public.series s JOIN public.teams ta ON ta.id = s.team_a_id JOIN public.teams tb ON tb.id = s.team_b_id
                LEFT JOIN public.teams w ON w.id = s.winner_team_id WHERE s.year = 2027)
    )`,
  });
  return JSON.parse(row);
}

async function uiState(S, { expectHome }) {
  await S.navigate(`${PREVIEW_BASE}predict`);
  const group = await S.evaluate("window.__drill.readActiveGroup()");
  await S.evaluate("window.__drill.closeDialog()");

  const loadsBefore = S.seriesLoads.length;
  await S.navigate(PREVIEW_BASE);
  // Home renders nothing when nothing is pending, so "absent" is only a claim once Home's own
  // pending read (`winner_team_id=is.null`) has landed — a fixed sleep could read before it.
  let home;
  if (expectHome) {
    home = await S.evaluate(`window.__p1.waitFor(() => window.__drill.homePending().length ? window.__drill.homePending() : null, "a Home pending link", 30000)`);
  } else {
    const landed = await S.waitForSeriesLoad((u) => /[?&]winner_team_id=is\.null/.test(decodeURIComponent(u)), loadsBefore);
    if (!landed) throw new Error("Home's pending-series read never landed, so its absence cannot be asserted");
    await sleep(500);
    home = await S.evaluate("window.__drill.homePending()");
  }

  await S.navigate(`${PREVIEW_BASE}historical`);
  const hist = await S.evaluate("window.__drill.readHistorical()", 180000);
  const rows2027 = hist.rows.filter((r) => /2027/.test(r.text)).map((r) => r.text);

  await S.navigate(`${PREVIEW_BASE}insights`);
  const insights = await S.evaluate(`window.__p1.waitFor(() => {
    const t = (document.body.textContent || "").replace(/\\s+/g, " ");
    const g6 = /Based on (\\d+) historical Game 7s/.exec(t);
    const home = /Home teams won (\\d+) out of (\\d+) Game 7s/.exec(t);
    return g6 && Number(g6[1]) > 0 && home ? { g6: Number(g6[1]), homeWins: Number(home[1]), homeTotal: Number(home[2]) } : null;
  }, "the insight cards", 60000)`);

  return { active: group.options, emptyCopy: group.emptyCopy, home, archiveTotal: hist.announced.total, rows2027, insights };
}

/** Open the /historical record whose row matches `re` and return its full text (for the game-7 score). */
async function recordText(S, re) {
  await S.navigate(`${PREVIEW_BASE}historical`);
  await S.evaluate("window.__drill.readHistorical()", 180000);
  return S.evaluate(`(async () => {
    const H = window.__p1, norm = window.__drill.norm;
    const tr = Array.from(document.querySelectorAll("tbody tr")).find((r) => ${re.toString()}.test(norm(r.textContent)));
    if (!tr) return null;
    tr.click();
    const card = await H.waitFor(() => Array.from(document.querySelectorAll("div.fixed")).find((n) => /Close/.test(n.textContent || "")) || null, "the record card", 15000);
    return norm(card.textContent);
  })()`);
}

const show = (label, o) => console.log(`     ${label}: ${JSON.stringify(o)}`);

// --- the drill --------------------------------------------------------------------------------------

async function drill() {
  const L = createLedger();
  const S = await openBrowserSession({});
  live.browser = S;
  const csv = (name) => `--csv=${join(fixturesDir, name)}`;

  console.log("== step 0 — before any run: the offseason state ==");
  const db0 = dbState();
  const ui0 = await uiState(S, { expectHome: false });
  show("db", { ...db0, fingerprint: undefined });
  show("ui", ui0);
  L.check("db: fixture archive of 178 series, none pending", db0.series === 178 && db0.pending === 0);
  L.check("picker: Active group empty, empty-state copy shown", ui0.active.length === 0 && ui0.emptyCopy === true);
  L.check("Home: no pending link", ui0.home.length === 0);
  L.check("/historical announces 178", ui0.archiveTotal === 178);
  const base = ui0.insights;

  console.log("\n== step 1 — night 1: BOS/MIA reaches 3-3 (birth) ==");
  const r1 = await pipeline(["--source=manual_csv", csv("night-1-birth.csv")]);
  const db1 = dbState();
  const ui1 = await uiState(S, { expectHome: true });
  show("db", { ...db1, fingerprint: undefined });
  show("ui", ui1);
  L.check("runner exit 0, one birth written", r1.code === 0 && /applied: 1 birth\(s\), 0 completion\(s\)/.test(r1.out));
  L.check("db: one 2027 series with six score rows and a NULL winner", db1.series === 179 && db1.pending === 1 && db1.drill.length === 1 && db1.drill[0].games === 6 && db1.drill[0].winner === null);
  L.check("picker: Active group lists BOS vs MIA (derived: six rows + NULL winner)", ui1.active.length === 1 && /^BOS vs MIA/.test(ui1.active[0]) && ui1.emptyCopy === false);
  L.check("Home: one pending link, to its preview page", ui1.home.length === 1 && /BOS vs MIA/.test(ui1.home[0].text) && /\/predict\?series=[0-9a-f-]{36}$/.test(ui1.home[0].href ?? ""));
  L.check("/historical still 178 and lists no 2027 row (a pending series is not archive)", ui1.archiveTotal === 178 && ui1.rows2027.length === 0);
  L.check("insight cards unchanged by a birth (no winner filled, no refresh)", JSON.stringify(ui1.insights) === JSON.stringify(base));

  console.log("\n== step 2 — the same night re-run: idempotent ==");
  const r2 = await pipeline(["--source=manual_csv", csv("night-1-birth.csv")]);
  const db2 = dbState();
  L.check("runner exit 0, zero writes applied", r2.code === 0 && /applied: 0 birth\(s\), 0 completion\(s\)/.test(r2.out));
  L.check("db byte-identical to step 1 (every column of series + scores)", db2.fingerprint === db1.fingerprint, `${db1.fingerprint} vs ${db2.fingerprint}`);
  const ui2 = await uiState(S, { expectHome: true });
  show("ui", ui2);
  // Every field, Home's link text and href included: collapsing `home` to its id let a re-run
  // that rendered a different label or destination still read as "identical to step 1".
  const sameUi = (u) => JSON.stringify(u);
  L.check("UI identical to step 1 after the re-run", sameUi(ui2) === sameUi(ui1));

  console.log("\n== step 3 — night 2: BOS/MIA game 7 (completion) + OKC/DEN reaches 3-3 (birth) ==");
  const r3 = await pipeline(["--source=manual_csv", csv("night-2-complete-and-birth.csv")]);
  const db3 = dbState();
  const ui3 = await uiState(S, { expectHome: true });
  show("db", { ...db3, fingerprint: undefined });
  show("ui", ui3);
  const bos = db3.drill.find((d) => d.pair === "BOS/MIA");
  L.check("runner exit 0, one birth and one completion written", r3.code === 0 && /applied: 1 birth\(s\), 1 completion\(s\)/.test(r3.out));
  L.check("db: BOS/MIA now has seven rows and winner BOS, set by that one write", bos?.games === 7 && bos?.winner === "BOS");
  L.check("picker: BOS vs MIA left the Active group; OKC vs DEN is the only entry", ui3.active.length === 1 && /^OKC vs DEN/.test(ui3.active[0]));
  L.check("Home: links OKC vs DEN only", ui3.home.length === 1 && /OKC vs DEN/.test(ui3.home[0].text));
  L.check("/historical: 179, with the 2027 BOS/MIA row now listed", ui3.archiveTotal === 179 && ui3.rows2027.length === 1 && /Boston|BOS/.test(ui3.rows2027[0]));
  const rec = await recordText(S, /2027.*(Boston|BOS)|(Boston|BOS).*2027/);
  L.check("its record shows the game-7 score (scores updated after the run)", Boolean(rec) && /G7\s*10599/.test(rec.replace(/\s+/g, "")), rec ? rec.slice(0, 160) : "record not found");
  L.check(
    "insight cards moved by exactly one Game 7 (+1 home win): the winner-filling run refreshed the cache",
    ui3.insights.g6 === base.g6 + 1 && ui3.insights.homeTotal === base.homeTotal + 1 && ui3.insights.homeWins === base.homeWins + 1,
    `${JSON.stringify(base)} -> ${JSON.stringify(ui3.insights)}`
  );

  console.log("\n== step 4 — night 3: OKC/DEN game 7, road win in the team_b slot (completion) ==");
  const r4 = await pipeline(["--source=manual_csv", csv("night-3-complete.csv")]);
  const db4 = dbState();
  const ui4 = await uiState(S, { expectHome: false });
  show("db", { ...db4, fingerprint: undefined });
  show("ui", ui4);
  const okc = db4.drill.find((d) => d.pair === "OKC/DEN");
  L.check("runner exit 0, one completion written", r4.code === 0 && /applied: 0 birth\(s\), 1 completion\(s\)/.test(r4.out));
  L.check("db: OKC/DEN seven rows, winner DEN (team_b), none pending", okc?.games === 7 && okc?.winner === "DEN" && db4.pending === 0);
  L.check("picker: Active group empty again, empty-state copy back", ui4.active.length === 0 && ui4.emptyCopy === true);
  L.check("Home: no pending link", ui4.home.length === 0);
  L.check("/historical: 180", ui4.archiveTotal === 180 && ui4.rows2027.length === 2);
  L.check(
    "insight cards: +2 Game 7s, +1 home win overall (the road win adds none)",
    ui4.insights.g6 === base.g6 + 2 && ui4.insights.homeTotal === base.homeTotal + 2 && ui4.insights.homeWins === base.homeWins + 1,
    `${JSON.stringify(base)} -> ${JSON.stringify(ui4.insights)}`
  );
  return L;
}

// --- main -------------------------------------------------------------------------------------------

async function main() {
  if (process.exitCode) return;
  console.log(`Story 2.7 leg 2 — derivation write leg on a throwaway stack (${tag})\n`);
  try {
    await bringUp();
  } catch (err) {
    console.error(`\nINFRA: ${err.message}`);
    process.exitCode = 2;
    teardown();
    return;
  }
  let L;
  try {
    L = await drill();
  } catch (err) {
    console.error(`\nFAIL the drill stopped: ${err.stack || err.message}`);
    process.exitCode = 1;
  }
  if (L) {
    if (L.failures.length) {
      console.log(`\nRED: ${L.failures.length} assertion(s) failed — ${L.failures.join("; ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nGREEN: leg 2 — every assertion held.");
    }
  }
  if (keep) {
    live.browser?.close();
    live.browser = null;
    console.log(`\n--keep: stack left up. Look at ${PREVIEW_BASE} — Ctrl+C tears it all down.`);
    return;
  }
  teardown();
}

process.on("exit", teardown);
// Ctrl+C skips 'exit' listeners: without this, a run stopped mid-way (or a --keep session) left
// both containers, the network, the proxy on 54321 and dist-drill-2-7/ behind.
// Printed before the teardown so the line has the ~1s of docker calls to flush, then exit(130):
// an interrupt can land inside bringUp's 120 s waitFor or the harness's 60 s navigation race,
// and either would keep the loop alive long enough for main's catch to report 2 or 1 over it.
process.on("SIGINT", () => {
  console.log("\ninterrupted: tearing the stack down (containers, network, proxy, dist-drill-2-7/).");
  teardown();
  process.exit(130);
});
main();
