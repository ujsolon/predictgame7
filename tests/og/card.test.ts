// Story 4.2 — the OG card renderer, driven from fixtures and real repo logos.
// No network and no database: `renderCard` is pure over its inputs, and the
// build step's DB read is injected (`fetchSeries`) in the run tests.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CENTER_SLOT,
  type CardInput,
  CHIP_SIZE,
  LOGO_SIZE,
  type LaidOutNode,
  layoutCard,
  normaliseLogo,
  renderCard,
  type SeriesCardInput,
  TAGLINE,
  WORDMARK,
} from '../../scripts/og/card.ts';
import { type OgSeriesRow, runOgCards } from '../../scripts/og/render.ts';
import type { SeriesGameScore } from '../../src/types/types.ts';

const PUBLIC_DIR = join(import.meta.dirname, '..', '..', 'public');
const logoFile = (name: string) => readFileSync(join(PUBLIC_DIR, 'assets', 'teams', name));
const logo = (name: string) => normaliseLogo(logoFile(name));

// A score-shaped run of digits ("4-3", "103 – 99", "4:3") must never appear on a card.
const SCORE_PATTERN = /\d+\s*[-–—:]\s*\d+/;

async function seriesInput(
  year: number,
  round: string,
  a: [string, string],
  b: [string, string],
): Promise<SeriesCardInput> {
  return {
    kind: 'series',
    year,
    round,
    teamA: { abbreviation: a[0], logoPng: await logo(a[1]) },
    teamB: { abbreviation: b[0], logoPng: await logo(b[1]) },
  };
}

function texts(nodes: LaidOutNode[]): string[] {
  return nodes.flatMap((node) => (node.textContent ? [node.textContent] : []));
}

function chips(nodes: LaidOutNode[]): LaidOutNode[] {
  return nodes.filter((node) => node.width === CHIP_SIZE && node.height === CHIP_SIZE);
}

async function expectCardSize(png: Buffer) {
  const meta = await sharp(png).metadata();
  expect(meta.format).toBe('png');
  expect([meta.width, meta.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
}

/** Pixels inside a chip's logo box that are visibly not the white chip plate. */
async function inkInChip(png: Buffer, chip: LaidOutNode): Promise<number> {
  const inset = (CHIP_SIZE - LOGO_SIZE) / 2;
  const { data, info } = await sharp(png)
    .extract({ left: Math.round(chip.left + inset), top: Math.round(chip.top + inset), width: LOGO_SIZE, height: LOGO_SIZE })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < 220 || data[i + 1] < 220 || data[i + 2] < 220) count += 1;
  }
  return count;
}

/**
 * Light (type-coloured) pixels in the two ink-field gutters between each chip
 * and the center slot, within the chip rows' vertical band. A round name that
 * fails to wrap spills across one of them; a wrapped one leaves both pure ink.
 */
async function lightInGutters(png: Buffer, chipBoxes: LaidOutNode[]): Promise<number> {
  const [left, right] = [...chipBoxes].sort((x, y) => x.left - y.left);
  const slotLeft = (CARD_WIDTH - CENTER_SLOT) / 2;
  const slotRight = slotLeft + CENTER_SLOT;
  const gutters = [
    { left: Math.round(left.left + left.width), width: Math.round(slotLeft - (left.left + left.width)) },
    { left: Math.round(slotRight), width: Math.round(right.left - slotRight) },
  ];
  let count = 0;
  for (const gutter of gutters) {
    const { data, info } = await sharp(png)
      .extract({ left: gutter.left, top: Math.round(left.top), width: gutter.width, height: CHIP_SIZE })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 128 && data[i + 1] > 128 && data[i + 2] > 128) count += 1;
    }
  }
  return count;
}

/** Render, then assert the shared card contract: size, two on-canvas non-blank chips, exact text, no score. */
async function expectSeriesCard(input: SeriesCardInput) {
  const { nodes } = await layoutCard(input);
  const png = await renderCard(input);
  await expectCardSize(png);

  const chipBoxes = chips(nodes);
  expect(chipBoxes).toHaveLength(2);
  for (const chip of chipBoxes) {
    expect(chip.left).toBeGreaterThanOrEqual(0);
    expect(chip.top).toBeGreaterThanOrEqual(0);
    expect(chip.left + chip.width).toBeLessThanOrEqual(CARD_WIDTH);
    expect(chip.top + chip.height).toBeLessThanOrEqual(CARD_HEIGHT);
    // A blank chip (the raw webp/gif/avif failure) is all #FFFFFF.
    expect(await inkInChip(png, chip)).toBeGreaterThan(500);
  }

  // Every text node on the card, in order — nothing else can be there (no score, no winner, no prediction).
  const round = input.round.toUpperCase();
  expect(texts(nodes)).toEqual([
    input.teamA.abbreviation,
    String(input.year),
    round,
    'GAME 7',
    input.teamB.abbreviation,
    WORDMARK,
    TAGLINE,
  ]);
  for (const text of texts(nodes)) {
    expect(text).not.toMatch(SCORE_PATTERN);
  }

  // The round wraps inside the fixed center slot, clear of both team blocks.
  const roundNode = nodes.find((node) => node.textContent === round);
  expect(roundNode).toBeDefined();
  if (roundNode) {
    expect(roundNode.width).toBeLessThanOrEqual(CENTER_SLOT);
    const [left, right] = [...chipBoxes].sort((x, y) => x.left - y.left);
    expect(roundNode.left).toBeGreaterThan(left.left + left.width);
    expect(roundNode.left + roundNode.width).toBeLessThan(right.left);
  }
  // The box above is fixed-width, so only pixels prove the type stayed inside it.
  expect(await lightInGutters(png, chipBoxes)).toBe(0);
  return { nodes, png, roundNode };
}

describe('renderCard — series cards', () => {
  it('wraps "Western Division Semifinals" inside the 296 px slot, never abbreviated', async () => {
    const input = await seriesInput(1969, 'Western Division Semifinals', ['OAK', 'OaklandOaks.png'], ['DNR', 'Denver_Rockets.webp']);
    const { roundNode } = await expectSeriesCard(input);
    expect(CENTER_SLOT).toBe(296);
    // More than one line: the 30 px line box is ~35 px tall.
    expect(roundNode?.height).toBeGreaterThan(60);
  }, 20_000);

  it('wraps "Western Conference Finals" inside the slot', async () => {
    const input = await seriesInput(2026, 'Western Conference Finals', ['OKC', 'thunder.png'], ['SAS', 'spurs.png']);
    const { roundNode } = await expectSeriesCard(input);
    expect(roundNode?.height).toBeGreaterThan(60);
  }, 20_000);

  it('negative control: an unwrappable single-word round spills into a gutter and is caught', async () => {
    const input = await seriesInput(1970, 'Supercalifragilisticexpialidociouslyxyz', ['OAK', 'OaklandOaks.png'], ['DNR', 'Denver_Rockets.webp']);
    const { nodes } = await layoutCard(input);
    const png = await renderCard(input);
    expect(await lightInGutters(png, chips(nodes))).toBeGreaterThan(0);
  }, 20_000);

  it.each([
    ['DNR', 'Denver_Rockets.webp'],
    ['BLB', 'Baltimore Bullets.gif'],
    ['KCK', 'kansascity.avif'],
  ])('converts the %s logo (%s) so its chip is not blank', async (abbreviation, file) => {
    const input = await seriesInput(1970, 'Finals', [abbreviation, file], ['LAL', 'lakers.png']);
    const { png, nodes } = await expectSeriesCard(input);
    const [first] = [...chips(nodes)].sort((x, y) => x.left - y.left);
    expect(await inkInChip(png, first)).toBeGreaterThan(500);
  }, 20_000);

  it('renders a pending series the same way (no outcome field exists to show)', async () => {
    const input = await seriesInput(2027, 'Eastern Conference Semifinals', ['BOS', 'celtics.png'], ['NYK', 'knicks.png']);
    await expectSeriesCard(input);
  }, 20_000);
});

describe('renderCard — fallback', () => {
  it('carries the wordmark and tagline only, no teams', async () => {
    const input: CardInput = { kind: 'fallback' };
    const { nodes } = await layoutCard(input);
    expect(texts(nodes)).toEqual([WORDMARK, TAGLINE]);
    expect(chips(nodes)).toHaveLength(0);
    expect(nodes.some((node) => node.type === 'img')).toBe(false);
    await expectCardSize(await renderCard(input));
  }, 20_000);
});

describe('normaliseLogo', () => {
  it('re-encodes every format to PNG', async () => {
    for (const file of ['Denver_Rockets.webp', 'Baltimore Bullets.gif', 'kansascity.avif', 'CarolinaCougars.jpg']) {
      expect((await sharp(await normaliseLogo(logoFile(file))).metadata()).format).toBe('png');
    }
  });

  it('rejects undecodable bytes', async () => {
    await expect(normaliseLogo(Buffer.from('not an image at all'))).rejects.toThrow();
  });
});

// ── the build step, with the DB read injected ───────────────────────────────

function scores(games: number[]): SeriesGameScore[] {
  return games.map((game_number) => ({ game_number }) as SeriesGameScore);
}

const ENV = { VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_ANON_KEY: 'anon' };

function row(id: string, overrides: Partial<OgSeriesRow> = {}): OgSeriesRow {
  return {
    id,
    year: 2016,
    round: 'Finals',
    winner_team_id: 1,
    team_a: { abbreviation: 'CLE', logo_url: 'assets/teams/cavaliers.png' },
    team_b: { abbreviation: 'GSW', logo_url: 'assets/teams/warriors.png' },
    series_game_scores: scores([1, 2, 3, 4, 5, 6, 7]),
    ...overrides,
  };
}

describe('runOgCards', () => {
  const dirs: string[] = [];
  const outDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'og-cards-'));
    dirs.push(dir);
    return join(dir, 'og');
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('renders archive and pending series plus the fallback, and skips a non-reconciling row', async () => {
    const out = outDir();
    const lines: string[] = [];
    const code = await runOgCards({
      env: ENV,
      outDir: out,
      publicDir: PUBLIC_DIR,
      fetchSeries: async () => [
        row('archived'),
        row('pending', { winner_team_id: null, series_game_scores: scores([1, 2, 3, 4, 5, 6]) }),
        row('broken', { series_game_scores: scores([1, 2, 4, 5, 6, 7]) }),
      ],
      log: (line) => lines.push(line),
      logError: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(readdirSync(out).sort()).toEqual(['archived.png', 'fallback.png', 'pending.png']);
    for (const name of readdirSync(out)) await expectCardSize(readFileSync(join(out, name)));
    expect(lines.join('\n')).toMatch(/3 written \(2 series \+ 1 fallback\)/);
    expect(lines.join('\n')).toMatch(/skipped.*broken \(2016 Finals\)/);
  }, 30_000);

  it('fails loud on an undecodable logo, naming the team code and path, and leaves no output', async () => {
    const out = outDir();
    const errors: string[] = [];
    const code = await runOgCards({
      env: ENV,
      outDir: out,
      publicDir: PUBLIC_DIR,
      fetchSeries: async () => [row('ok'), row('bad', { team_b: { abbreviation: 'XYZ', logo_url: 'assets/teams/broken.webp' } })],
      readFile: (path) => (path.endsWith('broken.webp') ? Buffer.from('garbage') : readFileSync(path)),
      log: () => {},
      logError: (line) => errors.push(line),
    });
    expect(code).not.toBe(0);
    const report = errors.join('\n');
    expect(report).toMatch(/XYZ/);
    expect(report).toMatch(/broken\.webp/);
    expect(report).toMatch(/failed to decode/);
    expect(existsSync(out)).toBe(false);
  }, 30_000);

  it('fails loud on a logo missing from disk, naming the team code and path', async () => {
    const out = outDir();
    const errors: string[] = [];
    const code = await runOgCards({
      env: ENV,
      outDir: out,
      publicDir: PUBLIC_DIR,
      fetchSeries: async () => [row('gone', { team_a: { abbreviation: 'QQQ', logo_url: 'assets/teams/does-not-exist.png' } })],
      log: () => {},
      logError: (line) => errors.push(line),
    });
    expect(code).not.toBe(0);
    expect(errors.join('\n')).toMatch(/QQQ: logo missing at .*does-not-exist\.png/);
    expect(existsSync(out)).toBe(false);
  }, 30_000);

  it('fails loud with no env, and when the DB read fails', async () => {
    const errors: string[] = [];
    const noEnv = await runOgCards({ env: {}, outDir: outDir(), log: () => {}, logError: (line) => errors.push(line) });
    expect(noEnv).not.toBe(0);
    expect(errors.join('\n')).toMatch(/VITE_SUPABASE_URL/);

    const out = outDir();
    const unreachable = await runOgCards({
      env: ENV,
      outDir: out,
      fetchSeries: async () => {
        throw new Error('fetch failed');
      },
      log: () => {},
      logError: (line) => errors.push(line),
    });
    expect(unreachable).not.toBe(0);
    expect(errors.join('\n')).toMatch(/fetch failed/);
    expect(existsSync(out)).toBe(false);
  }, 30_000);

  it('refuses an empty series read rather than publishing only the fallback', async () => {
    const code = await runOgCards({ env: ENV, outDir: outDir(), fetchSeries: async () => [], log: () => {}, logError: () => {} });
    expect(code).not.toBe(0);
  }, 30_000);

  it('fails when every row is skipped, rather than publishing only the fallback', async () => {
    const out = outDir();
    const errors: string[] = [];
    const code = await runOgCards({
      env: ENV,
      outDir: out,
      publicDir: PUBLIC_DIR,
      fetchSeries: async () => [
        row('gap', { series_game_scores: scores([1, 2, 4, 5, 6, 7]) }),
        row('short', { winner_team_id: null, series_game_scores: scores([1, 2, 3]) }),
      ],
      log: () => {},
      logError: (line) => errors.push(line),
    });
    expect(code).toBe(2);
    expect(errors.join('\n')).toMatch(/all 2 series row\(s\) were skipped/);
    expect(existsSync(out)).toBe(false);
  }, 30_000);

  it('names each team when two teams share one failing logo path', async () => {
    const errors: string[] = [];
    const shared = 'assets/teams/shared-broken.webp';
    const code = await runOgCards({
      env: ENV,
      outDir: outDir(),
      publicDir: PUBLIC_DIR,
      fetchSeries: async () => [
        row('one', { team_a: { abbreviation: 'AAA', logo_url: shared } }),
        row('two', { team_b: { abbreviation: 'BBB', logo_url: shared } }),
      ],
      readFile: (path) => (path.endsWith('shared-broken.webp') ? Buffer.from('garbage') : readFileSync(path)),
      log: () => {},
      logError: (line) => errors.push(line),
    });
    expect(code).toBe(2);
    const report = errors.join('\n');
    expect(report).toMatch(/one .*team AAA: logo at .*shared-broken\.webp failed to decode/);
    expect(report).toMatch(/two .*team BBB: logo at .*shared-broken\.webp failed to decode/);
  }, 30_000);
});

describe('the entry script (spawned, as `npm run og:cards` runs it)', { timeout: 30_000 }, () => {
  it('auto-runs as the entry and exits 2 naming VITE_SUPABASE_URL when the env is absent', () => {
    const env = { ...process.env };
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_ANON_KEY;
    const res = spawnSync(process.execPath, ['scripts/og/render.ts'], {
      env,
      cwd: join(import.meta.dirname, '..', '..'),
      encoding: 'utf8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/VITE_SUPABASE_URL/);
  });
});
