// Story 2.0 wire probe — stateless, no browser, no timing assumptions.
//
// Hits the deployed predict-game-7 with six rejection shapes and one success per
// method for each of two fixtures (a custom matchup and a real stored series, per
// AC line 280's two verification surfaces), then compares what came back against a
// recorded expectation. It exists because the story's boundary ("never change a
// successful response") and its deliverable (four new 400 rows) are both properties
// of the wire, and nothing in `npm run gate` can see the wire — the Edge Function
// deploy path is gated by nothing (AGENTS.md), so a stale deployment is
// indistinguishable from a working one from the client side.
//
// Usage:
//   node scripts/probe-predict-contract.mjs --expect=baseline
//   node scripts/probe-predict-contract.mjs --expect=validated   # after `supabase functions deploy`
//
// --expect=baseline encodes what the function answered on 2026-09-30, before the
// validator was deployed: only the missing-names row is a 400, the other five
// shapes return 200 — blank and self-vs-self as painted-over matchups, bad and
// missing scores as `win_probability_a: null`, and an unknown method labelled with
// the method it did not run. That is D2's evidence, committed rather than described.
// It is a point-in-time snapshot: once the validator is deployed, five of those
// rows flip to 400 by design and `--expect=baseline` goes red permanently. The mode
// that should pass after a deploy is `--expect=validated`.
//
// --expect=validated is the post-deploy proof: the same six bodies return the four
// 400 rows, and the eight successes must still match their baseline bodies exactly
// after masking `computation_time_ms` (which measures the function's own timing, so
// it varies per call and is the only field allowed to).
//
// Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env. Both are client-
// visible by design (NFR-S1); the key is read and sent, never printed.
//
// Exit code: 0 all rows matched, 1 a mismatch, 2 the script could not run.

import { readFileSync } from "node:fs";

const METHOD_SLUGS = [
  "logistic_regression",
  "bayes",
  "elo",
  "exponential_smoothing",
];

const SAME_TEAM_MESSAGE =
  "Team A and Team B are the same team. Pick two different teams to predict.";
const SCORES_MESSAGE =
  "Game scores for games 1-6 must all be numbers. Invalid: game_3_score_b";
const MISSING_SCORE_MESSAGE =
  "Game scores for games 1-6 must all be numbers. Invalid: game_6_score_b";
const UNKNOWN_METHOD_MESSAGE =
  'Unknown prediction method "not_a_method". Accepted methods: logistic_regression, bayes, elo, exponential_smoothing';

// Fixed so the two expectation modes are comparable against one another.
function scores() {
  const out = {};
  for (let g = 1; g <= 6; g++) {
    out[`game_${g}_score_a`] = 110 - g;
    out[`game_${g}_score_b`] = 100 + g;
  }
  return out;
}

const BASE = {
  team_a: "Boston Celtics",
  team_b: "Miami Heat",
  home_team: "Boston Celtics",
  ...scores(),
};

// A real stored series, read out of `series` + `series_game_scores` on 2026-09-30 (the
// 2026 Western Conference Finals), mapped the way `PredictPage`'s series path maps it:
// `score_a` is team_a's score for that game, and `home_team` comes from the game-7 row.
// It carries `series_id`, which the function ignores — the point is the second AC
// surface, not a second code path. The recorded bodies below show what that buys: this
// fixture reaches factor branches the custom one never produces ("dominated Games 5–6"
// and the "Game 6 victory" factor instead of "leads cumulative differential" and a
// generic closing streak; Game 6 and Game 4 Bayesian differentials instead of Game 1),
// and it is not degenerate — three of the four methods pick team_b over the home team.
const SERIES_BASE = {
  series_id: "6ecb170c-e781-47f8-b7ee-881ba719d6d5",
  team_a: "Oklahoma City Thunder",
  team_b: "San Antonio Spurs",
  home_team: "Oklahoma City Thunder",
  game_1_score_a: 115,
  game_1_score_b: 122,
  game_2_score_a: 122,
  game_2_score_b: 113,
  game_3_score_a: 123,
  game_3_score_b: 108,
  game_4_score_a: 82,
  game_4_score_b: 103,
  game_5_score_a: 127,
  game_5_score_b: 114,
  game_6_score_a: 91,
  game_6_score_b: 118,
};

const REJECTIONS = [
  {
    label: "no team names",
    body: { home_team: "Boston Celtics", ...scores() },
    baseline: { status: 400, error: "Team names are required" },
    validated: { status: 400, error: "Team names are required" },
  },
  {
    label: "blank team_a",
    body: { ...BASE, team_a: "   " },
    // Today a whitespace name wins the matchup outright.
    baseline: { status: 200 },
    validated: { status: 400, error: "Team names are required" },
  },
  {
    label: "self vs self",
    body: { ...BASE, team_b: "Boston Celtics" },
    baseline: { status: 200 },
    validated: { status: 400, error: SAME_TEAM_MESSAGE },
  },
  {
    label: "non-numeric score",
    body: { ...BASE, game_3_score_b: "abc" },
    // Serialises as null probabilities, which the client reports as an unreadable
    // result rather than the real cause.
    baseline: { status: 200, nullProbabilities: true },
    validated: { status: 400, error: SCORES_MESSAGE },
  },
  {
    label: "missing score",
    body: { ...BASE, game_6_score_b: undefined },
    baseline: { status: 200, nullProbabilities: true },
    validated: { status: 400, error: MISSING_SCORE_MESSAGE },
  },
  {
    label: "unknown method",
    body: { ...BASE, method: "not_a_method" },
    // The branch chain's final `else` is logistic regression, so this runs that
    // maths and echoes the caller's string back as method_used.
    baseline: { status: 200, methodUsed: "not_a_method" },
    validated: { status: 400, error: UNKNOWN_METHOD_MESSAGE },
  },
];

// Masked raw bodies from the baseline run, field order included — the equality the
// "never change a successful response" boundary needs is over the text, not fields.
const SUCCESS_MASKED = {
  logistic_regression:
    '{"predicted_winner":"Boston Celtics","team_a":"Boston Celtics","team_b":"Miami Heat","team_a_logo":"assets/teams/celtics.png","team_b_logo":"assets/teams/heat.png","win_probability_a":61.77,"win_probability_b":38.23,"confidence_level":"Medium","contributing_factors":[{"factor":"Boston Celtics has home court for Game 7","description":"Home teams win ~62% of Game 7s historically.","impact":0.3},{"factor":"Boston Celtics leads cumulative differential","description":"Boston Celtics outscored the opposition by 18 total points across all 6 games.","impact":0.18},{"factor":"Miami Heat on a 2-game closing streak","description":"Miami Heat won the last 2 games — strong momentum heading into Game 7.","impact":0.1}],"computation_time_ms":<masked>,"method_used":"logistic_regression"}',
  bayes:
    '{"predicted_winner":"Boston Celtics","team_a":"Boston Celtics","team_b":"Miami Heat","team_a_logo":"assets/teams/celtics.png","team_b_logo":"assets/teams/heat.png","win_probability_a":77.02,"win_probability_b":22.98,"confidence_level":"High","contributing_factors":[{"factor":"Home Court Prior","description":"Historical data gives Boston Celtics a 62% prior probability as the home team.","impact":0.12},{"factor":"Series Aggregate Evidence","description":"The total 18pt differential across 6 games shifts the Bayesian posterior towards Boston Celtics.","impact":0.09},{"factor":"Game 1 Differential Evidence","description":"Boston Celtics\'s 8pt Game 1 victory provides significant Bayesian evidence for a Game 7 win.","impact":0.0793242521487495}],"computation_time_ms":<masked>,"method_used":"bayes"}',
  elo:
    '{"predicted_winner":"Boston Celtics","team_a":"Boston Celtics","team_b":"Miami Heat","team_a_logo":"assets/teams/celtics.png","team_b_logo":"assets/teams/heat.png","win_probability_a":62.6,"win_probability_b":37.4,"confidence_level":"Medium","contributing_factors":[{"factor":"Boston Celtics has home court for Game 7","description":"Home teams win ~62% of Game 7s historically.","impact":0.3},{"factor":"Boston Celtics leads cumulative differential","description":"Boston Celtics outscored the opposition by 18 total points across all 6 games.","impact":0.18},{"factor":"Miami Heat on a 2-game closing streak","description":"Miami Heat won the last 2 games — strong momentum heading into Game 7.","impact":0.1}],"computation_time_ms":<masked>,"method_used":"elo"}',
  exponential_smoothing:
    '{"predicted_winner":"Miami Heat","team_a":"Boston Celtics","team_b":"Miami Heat","team_a_logo":"assets/teams/celtics.png","team_b_logo":"assets/teams/heat.png","win_probability_a":47.14,"win_probability_b":52.86,"confidence_level":"Low","contributing_factors":[{"factor":"Boston Celtics has home court for Game 7","description":"Home teams win ~62% of Game 7s historically.","impact":0.3},{"factor":"Boston Celtics leads cumulative differential","description":"Boston Celtics outscored the opposition by 18 total points across all 6 games.","impact":0.18},{"factor":"Miami Heat on a 2-game closing streak","description":"Miami Heat won the last 2 games — strong momentum heading into Game 7.","impact":0.1}],"computation_time_ms":<masked>,"method_used":"exponential_smoothing"}',
};

const SUCCESS_MASKED_SERIES = {
  logistic_regression:
    '{"predicted_winner":"Oklahoma City Thunder","team_a":"Oklahoma City Thunder","team_b":"San Antonio Spurs","team_a_logo":"assets/teams/thunder.png","team_b_logo":"assets/teams/spurs.png","win_probability_a":70.47,"win_probability_b":29.53,"confidence_level":"High","contributing_factors":[{"factor":"Oklahoma City Thunder has home court for Game 7","description":"Home teams win ~62% of Game 7s historically.","impact":0.3},{"factor":"San Antonio Spurs dominated Games 5–6","description":"San Antonio Spurs outscored the opposition by 14 pts across the last two games.","impact":0.28},{"factor":"Game 6 San Antonio Spurs victory","description":"San Antonio Spurs won Game 6 by 27 pts — Game 6 winners take Game 7 ~62% of the time.","impact":0.27}],"computation_time_ms":<masked>,"method_used":"logistic_regression"}',
  bayes:
    '{"predicted_winner":"San Antonio Spurs","team_a":"Oklahoma City Thunder","team_b":"San Antonio Spurs","team_a_logo":"assets/teams/thunder.png","team_b_logo":"assets/teams/spurs.png","win_probability_a":44.26,"win_probability_b":55.74,"confidence_level":"Low","contributing_factors":[{"factor":"Game 6 Differential Evidence","description":"San Antonio Spurs\'s 27pt Game 6 victory provides significant Bayesian evidence for a Game 7 win.","impact":0.24649398333766215},{"factor":"Game 4 Differential Evidence","description":"San Antonio Spurs\'s 21pt Game 4 victory provides significant Bayesian evidence for a Game 7 win.","impact":0.19846521600253875},{"factor":"Home Court Prior","description":"Historical data gives Oklahoma City Thunder a 62% prior probability as the home team.","impact":0.12}],"computation_time_ms":<masked>,"method_used":"bayes"}',
  elo:
    '{"predicted_winner":"San Antonio Spurs","team_a":"Oklahoma City Thunder","team_b":"San Antonio Spurs","team_a_logo":"assets/teams/thunder.png","team_b_logo":"assets/teams/spurs.png","win_probability_a":45.65,"win_probability_b":54.35,"confidence_level":"Low","contributing_factors":[{"factor":"Oklahoma City Thunder has home court for Game 7","description":"Home teams win ~62% of Game 7s historically.","impact":0.3},{"factor":"San Antonio Spurs dominated Games 5–6","description":"San Antonio Spurs outscored the opposition by 14 pts across the last two games.","impact":0.28},{"factor":"Game 6 San Antonio Spurs victory","description":"San Antonio Spurs won Game 6 by 27 pts — Game 6 winners take Game 7 ~62% of the time.","impact":0.27}],"computation_time_ms":<masked>,"method_used":"elo"}',
  exponential_smoothing:
    '{"predicted_winner":"San Antonio Spurs","team_a":"Oklahoma City Thunder","team_b":"San Antonio Spurs","team_a_logo":"assets/teams/thunder.png","team_b_logo":"assets/teams/spurs.png","win_probability_a":15.22,"win_probability_b":84.78,"confidence_level":"High","contributing_factors":[{"factor":"Oklahoma City Thunder has home court for Game 7","description":"Home teams win ~62% of Game 7s historically.","impact":0.3},{"factor":"San Antonio Spurs dominated Games 5–6","description":"San Antonio Spurs outscored the opposition by 14 pts across the last two games.","impact":0.28},{"factor":"Game 6 San Antonio Spurs victory","description":"San Antonio Spurs won Game 6 by 27 pts — Game 6 winners take Game 7 ~62% of the time.","impact":0.27}],"computation_time_ms":<masked>,"method_used":"exponential_smoothing"}',
};

// Both AC-280 surfaces, each against every method.
const FIXTURES = [
  { label: "custom", body: BASE, masked: SUCCESS_MASKED },
  { label: "series", body: SERIES_BASE, masked: SUCCESS_MASKED_SERIES },
];

function readViteEnv(file = ".env") {
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function parseExpect(argv) {
  for (const arg of argv) {
    const m = /^--expect=(baseline|validated)$/.exec(arg);
    if (m) return m[1];
  }
  return null;
}

const mask = (text) => text.replace(/"computation_time_ms":\d+/, '"computation_time_ms":<masked>');

async function post(endpoint, key, body) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    // Without this, a connection that is accepted but never answered leaves the run
    // with no verdict at all — and this run is the story's post-deploy evidence.
    signal: AbortSignal.timeout(20000),
    // JSON.stringify drops undefined, so a "missing score" probe really omits the key.
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

function checkRejection(expect, row, response) {
  const want = row[expect];
  const problems = [];
  if (response.status !== want.status) {
    problems.push(`expected ${want.status}, got ${response.status}`);
  }
  // Every body assertion below describes a response of the status it was recorded
  // against, so a row that answered a different status reports that and stops: parsing
  // a 400 envelope for null probabilities would add a second, misleading complaint.
  if (response.status !== want.status) return problems;
  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    // One FAIL row, not an abort that leaves the remaining rows unrun.
    problems.push(`${response.status} body is not JSON`);
    return problems;
  }
  if (want.status === 400) {
    // No truthiness guard on `parsed`: a body of literal `null` is valid JSON whose
    // envelope is wrong, which is exactly the case that must not read as a pass.
    if (parsed?.error !== want.error) {
      problems.push(`envelope differs: got ${JSON.stringify(parsed?.error)}`);
    }
  }
  if (want.nullProbabilities && (parsed?.win_probability_a !== null || parsed?.win_probability_b !== null)) {
    problems.push("expected the null-probability shape");
  }
  if (want.methodUsed && parsed?.method_used !== want.methodUsed) {
    problems.push(`method_used is ${JSON.stringify(parsed?.method_used)}`);
  }
  return problems;
}

async function main() {
  const expect = parseExpect(process.argv.slice(2));
  if (!expect) {
    console.error("usage: node scripts/probe-predict-contract.mjs --expect=baseline|validated");
    process.exit(2);
  }
  let env;
  try {
    env = readViteEnv();
  } catch {
    console.error("no readable .env in the current directory");
    process.exit(2);
  }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.error(".env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    process.exit(2);
  }
  const endpoint = `${env.VITE_SUPABASE_URL}/functions/v1/predict-game-7`;
  console.log(`endpoint ${endpoint}`);
  console.log(`mode     --expect=${expect}\n`);

  let failed = 0;
  console.log("== rejection shapes ==");
  for (const row of REJECTIONS) {
    const response = await post(endpoint, env.VITE_SUPABASE_ANON_KEY, row.body);
    const problems = checkRejection(expect, row, response);
    const shown =
      response.status === 400
        ? `error ${response.text.slice(0, 200)}`
        : `body (masked) ${mask(response.text).slice(0, 90)}…`;
    console.log(
      `${problems.length ? "FAIL" : "ok  "} ${row.label.padEnd(19)} ${response.status}  ${shown}${problems.length ? `  ← ${problems.join("; ")}` : ""}`
    );
    if (problems.length) failed++;
  }

  console.log("\n== success path: body equality against the recorded baseline, both AC-280 surfaces ==");
  for (const fixture of FIXTURES) {
    for (const method of METHOD_SLUGS) {
      const response = await post(endpoint, env.VITE_SUPABASE_ANON_KEY, { ...fixture.body, method });
      const problems = [];
      if (response.status !== 200) problems.push(`expected 200, got ${response.status}`);
      else if (mask(response.text) !== fixture.masked[method]) {
        problems.push("masked body differs from the recorded baseline");
      }
      console.log(
        `${problems.length ? "FAIL" : "ok  "} ${`${fixture.label}/${method}`.padEnd(30)} ${response.status}  ${
          response.status === 200 ? `${problems.length ? mask(response.text).slice(0, 160) : "unchanged"}` : response.text.slice(0, 160)
        }${problems.length ? `  ← ${problems.join("; ")}` : ""}`
      );
      if (problems.length) failed++;
    }
  }

  console.log(
    `\n${failed ? `${failed} row(s) differ from --expect=${expect}` : `all rows match --expect=${expect}`}`
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  // Same narrowing Story 2.0 applied to the function's own catch arm: `error` is
  // `unknown`, and reading `.message` off it printed "undefined" for a non-Error.
  console.error(
    `probe could not complete: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(2);
});
