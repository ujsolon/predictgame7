/**
 * Story 4.2 — the OG card renderer (FR-31, AD-6/AD-7 as amended 2026-10-07).
 *
 * Pure over its inputs: card facts plus PNG logo bytes in, PNG bytes out. No
 * network and no database — `render.ts` owns the read; tests drive this file
 * from fixtures and real repo logos.
 *
 * The tree is DESIGN.md · OG card and `mockups/key-og-card.html`: an ink
 * field, two team blocks (logo on a white chip + mono abbreviation) around a
 * fixed-width center slot ({YEAR} over the stored round name — the stored
 * league before it for a non-NBA row, as `yearRound` prints it (Story 6.1) —
 * over "GAME 7"),
 * and a lower band (hairline rule, wordmark, tagline). The input type carries
 * no score, winner or prediction field, so none can reach a card.
 *
 * Fonts are read from the `@fontsource/*` packages in `node_modules` — never
 * fetched. Round names are ASCII (spike sweep), so the latin subsets suffice.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const MARGIN = 64;
const TEAM_COLUMN = 340;
const COLUMN_GAP = 48;
/** The fixed center slot: 1200 − 2×64 − 2×340 − 2×48 = 296 px (spike sweep). */
export const CENTER_SLOT = CARD_WIDTH - 2 * MARGIN - 2 * TEAM_COLUMN - 2 * COLUMN_GAP;
export const CHIP_SIZE = 232;
const CHIP_RADIUS = 28;
export const LOGO_SIZE = 192;
/** Longest edge a normalised logo keeps: 2× its 192 px display box. */
const LOGO_MAX_EDGE = LOGO_SIZE * 2;

const INK = '#1A1A1A';
const TYPE = '#FAFAFA';
const CHIP = '#FFFFFF';
const GAME_7_GREY = '#8A8A8A';
const TAGLINE_GREY = '#D4D4D4';
const HAIRLINE = 'rgba(250, 250, 250, 0.22)';

export const WORDMARK = 'PredictGame7';
export const TAGLINE = 'Where data meets playoff drama';

/** One team block's inputs. `logoPng` must already be `normaliseLogo` output. */
export interface CardTeam {
  abbreviation: string;
  logoPng: Buffer;
}

/**
 * A series card. Deliberately no score, winner or prediction field: the card
 * is the same for an archived and a pending series (spoiler discipline).
 */
export interface SeriesCardInput {
  kind: 'series';
  year: number;
  /** The stored round name — rendered uppercase and wrapped, never abbreviated. */
  round: string;
  /** The stored league (`series.league`), verbatim; shown before the round unless it is `NBA`. */
  league: string;
  teamA: CardTeam;
  teamB: CardTeam;
}

export interface FallbackCardInput {
  kind: 'fallback';
}

export type CardInput = SeriesCardInput | FallbackCardInput;

type Style = Record<string, string | number>;
type Child = CardNode | string;

/** A satori element: the plain `{ type, props }` shape, no React runtime. */
export interface CardNode {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown };
}

type SatoriElement = Parameters<typeof satori>[0];
type SatoriFonts = Parameters<typeof satori>[1]['fonts'];

function el(type: string, style: Style, children?: Child | Child[]): CardNode {
  return { type, props: { style, children } };
}

const nodeRequire = createRequire(import.meta.url);

function fontFile(specifier: string): Buffer {
  return readFileSync(nodeRequire.resolve(specifier));
}

let fontCache: SatoriFonts | undefined;

function loadFonts(): SatoriFonts {
  if (!fontCache) {
    const montserrat = (weight: 400 | 500 | 600) => ({
      name: 'Montserrat',
      data: fontFile(`@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff`),
      weight,
      style: 'normal' as const,
    });
    fontCache = [
      montserrat(400),
      montserrat(500),
      montserrat(600),
      {
        name: 'JetBrains Mono',
        data: fontFile('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'),
        weight: 700,
        style: 'normal',
      },
    ];
  }
  return fontCache;
}

/**
 * Decode any logo format sharp reads (png, jpg, webp, gif, avif, svg …) and
 * re-encode it as PNG. resvg draws a raw webp/gif/avif `data:` image as an
 * empty box with no error (spike finding 1), so every logo goes through here.
 * Undecodable bytes reject — the caller names the team and path.
 */
export async function normaliseLogo(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize(LOGO_MAX_EDGE, LOGO_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

function teamBlock(team: CardTeam): CardNode {
  return el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: TEAM_COLUMN }, [
    el(
      'div',
      {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: CHIP_SIZE,
        height: CHIP_SIZE,
        backgroundColor: CHIP,
        borderRadius: CHIP_RADIUS,
      },
      {
        type: 'img',
        props: {
          src: `data:image/png;base64,${team.logoPng.toString('base64')}`,
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          style: { width: LOGO_SIZE, height: LOGO_SIZE, objectFit: 'contain' },
        },
      },
    ),
    el(
      'div',
      { fontFamily: 'JetBrains Mono', fontSize: 64, fontWeight: 700, letterSpacing: 4, lineHeight: 1, color: TYPE },
      team.abbreviation,
    ),
  ]);
}

/** The center slot's round line: `{LEAGUE }{ROUND}`, the league only for a non-NBA row (as `yearRound`). */
export function roundLine(league: string, round: string): string {
  return `${league !== 'NBA' ? `${league} ` : ''}${round}`.toUpperCase();
}

function centerSlot(year: number, league: string, round: string): CardNode {
  const context: Style = {
    display: 'flex',
    justifyContent: 'center',
    width: CENTER_SLOT,
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: 3,
    lineHeight: 1.15,
    textAlign: 'center',
  };
  return el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: CENTER_SLOT }, [
    el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', width: CENTER_SLOT }, [
      el('div', context, String(year)),
      el('div', context, roundLine(league, round)),
    ]),
    el('div', { fontSize: 20, fontWeight: 600, letterSpacing: 2.8, color: GAME_7_GREY }, 'GAME 7'),
  ]);
}

const wordmark = el('div', { fontSize: 48, fontWeight: 500, letterSpacing: -0.48, lineHeight: 1 }, WORDMARK);
const tagline = el('div', { fontSize: 20, fontWeight: 400, color: TAGLINE_GREY }, TAGLINE);

function field(children: CardNode[]): CardNode {
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      padding: MARGIN,
      backgroundColor: INK,
      color: TYPE,
      fontFamily: 'Montserrat',
    },
    children,
  );
}

/** The satori tree for a card — exported so tests can inspect it without rendering. */
export function cardTree(input: CardInput): CardNode {
  if (input.kind === 'fallback') {
    return field([
      el('div', { display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }, [
        wordmark,
        tagline,
      ]),
    ]);
  }
  return field([
    el('div', { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between' }, [
      teamBlock(input.teamA),
      centerSlot(input.year, input.league, input.round),
      teamBlock(input.teamB),
    ]),
    el(
      'div',
      {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        borderTop: `1px solid ${HAIRLINE}`,
        paddingTop: 28,
      },
      [wordmark, tagline],
    ),
  ]);
}

/** A laid-out node as satori reports it (absolute position, text if any). */
export interface LaidOutNode {
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  textContent?: string;
}

export interface CardLayout {
  svg: string;
  nodes: LaidOutNode[];
}

/** satori pass only: the SVG plus every laid-out node (tests read the text and the chip boxes). */
export async function layoutCard(input: CardInput): Promise<CardLayout> {
  const nodes: LaidOutNode[] = [];
  const svg = await satori(cardTree(input) as unknown as SatoriElement, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: loadFonts(),
    onNodeDetected: (node) => {
      nodes.push({
        type: node.type,
        left: node.left,
        top: node.top,
        width: node.width,
        height: node.height,
        textContent: node.textContent,
      });
    },
  });
  return { svg, nodes };
}

/** Render a card to a 1200×630 PNG (satori → resvg). */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const { svg } = await layoutCard(input);
  return new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
}
