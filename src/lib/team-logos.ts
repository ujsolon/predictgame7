import { getTeamCode } from '@/lib/nba-utils';
import type { Team } from '@/types/types';

type TeamLogoEntry = {
  path: string;
  aliases: string[];
};

const TEAM_LOGO_ENTRIES: TeamLogoEntry[] = [
  { path: 'assets/teams/hawks.png', aliases: ['Atlanta Hawks', 'Hawks', 'ATL'] },
  { path: 'assets/teams/Baltimore Bullets.gif', aliases: ['Baltimore Bullets', 'Bullets', 'BLB'] },
  { path: 'assets/teams/celtics.png', aliases: ['Boston Celtics', 'Celtics', 'BOS'] },
  { path: 'assets/teams/nets.png', aliases: ['Brooklyn Nets', 'Nets', 'BKN'] },
  { path: 'assets/teams/Buffalo_Braves.png', aliases: ['Buffalo Braves', 'Braves', 'BUF'] },
  { path: 'assets/teams/Capital_Bullets.png', aliases: ['Capital Bullets', 'CPB'] },
  { path: 'assets/teams/CarolinaCougars.jpg', aliases: ['Carolina Cougars', 'Cougars', 'CAC'] },
  { path: 'assets/teams/hornets.png', aliases: ['Charlotte Hornets', 'Hornets', 'CHA'] },
  { path: 'assets/teams/bulls.png', aliases: ['Chicago Bulls', 'Bulls', 'CHI'] },
  { path: 'assets/teams/Cincinnati_Royals.png', aliases: ['Cincinnati Royals', 'Royals', 'CNR'] },
  { path: 'assets/teams/cavaliers.png', aliases: ['Cleveland Cavaliers', 'Cavaliers', 'CLE'] },
  { path: 'assets/teams/Dallas_Chaparrals.jpg', aliases: ['Dallas Chaparrals', 'Chaparrals', 'DCH'] },
  { path: 'assets/teams/mavericks.png', aliases: ['Dallas Mavericks', 'Mavericks', 'DAL'] },
  { path: 'assets/teams/nuggets.png', aliases: ['Denver Nuggets', 'Nuggets', 'DEN'] },
  { path: 'assets/teams/Denver_Rockets.webp', aliases: ['Denver Rockets', 'DNR'] },
  { path: 'assets/teams/pistons.png', aliases: ['Detroit Pistons', 'Pistons', 'DET'] },
  { path: 'assets/teams/fort-wayne-pistons-1948-1957.png', aliases: ['Fort Wayne Pistons', 'FWP'] },
  { path: 'assets/teams/warriors.png', aliases: ['Golden State Warriors', 'Warriors', 'GSW'] },
  { path: 'assets/teams/rockets.png', aliases: ['Houston Rockets', 'Rockets', 'HOU'] },
  { path: 'assets/teams/pacers.png', aliases: ['Indiana Pacers', 'Pacers', 'IND'] },
  { path: 'assets/teams/kansascity.avif', aliases: ['Kansas City Kings', 'KCK'] },
  { path: 'assets/teams/KentuckyColonels.png', aliases: ['Kentucky Colonels', 'Colonels', 'KEN'] },
  { path: 'assets/teams/clippers.png', aliases: ['Los Angeles Clippers', 'Clippers', 'LAC'] },
  { path: 'assets/teams/lakers.png', aliases: ['Los Angeles Lakers', 'Lakers', 'LAL'] },
  { path: 'assets/teams/grizzlies.png', aliases: ['Memphis Grizzlies', 'Grizzlies', 'MEM'] },
  { path: 'assets/teams/Miamifloridians.png', aliases: ['Miami Floridians', 'Floridians', 'MFL'] },
  { path: 'assets/teams/heat.png', aliases: ['Miami Heat', 'Heat', 'MIA'] },
  { path: 'assets/teams/bucks.png', aliases: ['Milwaukee Bucks', 'Bucks', 'MIL'] },
  { path: 'assets/teams/minneapolis_lakers_1948-1960.webp', aliases: ['Minneapolis Lakers', 'MPL'] },
  { path: 'assets/teams/minnesota_pipers_1969.webp', aliases: ['Minnesota Pipers', 'Pipers', 'MNP'] },
  { path: 'assets/teams/timberwolves.png', aliases: ['Minnesota Timberwolves', 'Timberwolves', 'Wolves', 'MIN'] },
  { path: 'assets/teams/New_Jersey_Nets.jpg', aliases: ['New Jersey Nets', 'NJN'] },
  { path: 'assets/teams/Neworleansbucs.png', aliases: ['New Orleans Buccaneers', 'Buccaneers', 'NOB'] },
  { path: 'assets/teams/New_Orleans_Hornets_logo_29.webp', aliases: ['New Orleans Hornets', 'NOH'] },
  { path: 'assets/teams/pelicans.png', aliases: ['New Orleans Pelicans', 'Pelicans', 'NOP'] },
  { path: 'assets/teams/knicks.png', aliases: ['New York Knicks', 'Knicks', 'NYK'] },
  { path: 'assets/teams/new_york_nets_1973-1977.webp', aliases: ['New York Nets', 'NYN'] },
  { path: 'assets/teams/OaklandOaks.png', aliases: ['Oakland Oaks', 'Oaks', 'OAK'] },
  { path: 'assets/teams/thunder.png', aliases: ['Oklahoma City Thunder', 'Thunder', 'OKC'] },
  { path: 'assets/teams/magic.png', aliases: ['Orlando Magic', 'Magic', 'ORL'] },
  { path: 'assets/teams/76ers.png', aliases: ['Philadelphia 76ers', '76ers', 'Sixers', 'PHI'] },
  { path: 'assets/teams/Philadelphia_warriors.webp', aliases: ['Philadelphia Warriors', 'PHW'] },
  { path: 'assets/teams/suns.png', aliases: ['Phoenix Suns', 'Suns', 'PHX'] },
  { path: 'assets/teams/trail-blazers.png', aliases: ['Portland Trail Blazers', 'Trail Blazers', 'Blazers', 'POR'] },
  { path: 'assets/teams/Rochester_Royals.png', aliases: ['Rochester Royals', 'ROR'] },
  { path: 'assets/teams/kings.png', aliases: ['Sacramento Kings', 'Kings', 'SAC'] },
  { path: 'assets/teams/spurs.png', aliases: ['San Antonio Spurs', 'Spurs', 'SAS'] },
  { path: 'assets/teams/San_Francisco_Warriors.jpg', aliases: ['San Francisco Warriors', 'SFW'] },
  { path: 'assets/teams/Seattle_SuperSonics.png', aliases: ['Seattle SuperSonics', 'SuperSonics', 'Sonics', 'SEA'] },
  { path: 'assets/teams/St._Louis_Bombers.png', aliases: ['St. Louis Bombers', 'Bombers', 'SLB'] },
  { path: 'assets/teams/St._Louis_Hawks.webp', aliases: ['St. Louis Hawks', 'SLH'] },
  { path: 'assets/teams/Syracuse_nationals_1949-1963.webp', aliases: ['Syracuse Nationals', 'Nationals', 'SYR'] },
  { path: 'assets/teams/raptors.png', aliases: ['Toronto Raptors', 'Raptors', 'TOR'] },
  { path: 'assets/teams/jazz.png', aliases: ['Utah Jazz', 'Jazz', 'UTA'] },
  { path: 'assets/teams/Utah_Stars.png', aliases: ['Utah Stars', 'Stars', 'UTS'] },
  { path: 'assets/teams/VirginiaSquires.png', aliases: ['Virginia Squires', 'Squires', 'VAS'] },
  { path: 'assets/teams/Washington_Bullets.jpg', aliases: ['Washington Bullets', 'WSB'] },
  { path: 'assets/teams/Washington_Capitals.png', aliases: ['Washington Capitols', 'Capitols', 'WSC'] },
  { path: 'assets/teams/wizards.png', aliases: ['Washington Wizards', 'Wizards', 'WAS'] },
  { path: 'assets/teams/teama.png', aliases: ['Team A', 'TMA'] },
  { path: 'assets/teams/teamb.png', aliases: ['Team B', 'TMB'] },
];

const normalizeTeamAlias = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const TEAM_LOGO_ALIAS_MAP = new Map(
  TEAM_LOGO_ENTRIES.flatMap((entry) =>
    entry.aliases.map((alias) => [normalizeTeamAlias(alias), entry.path] as const)
  )
);

// Story 2.11 (owner decision U16, 2026-10-05): a typed custom name prints the
// code of the team whose logo it shows. Every entry's **last** alias is that
// team's stored `teams.abbreviation` (`TMA`/`TMB` for the placeholders) —
// pinned against the `00005` + `00007` seeds in `team-logos.test.ts` — so the
// code comes from the same alias, through the same normalization, that picked
// the logo, and the two cannot disagree. A nickname several franchises shared
// (`Bullets`, `Royals`, `Kings`, `Warriors`, `Hawks`, `Lakers`, `Rockets`,
// `Nets`, `Hornets`, `Pistons`) resolves to the one team this table lists it
// under — the choice the logo already made.
const TEAM_CODE_ALIAS_MAP = new Map(
  TEAM_LOGO_ENTRIES.flatMap((entry) =>
    entry.aliases.map((alias) => [normalizeTeamAlias(alias), entry.aliases[entry.aliases.length - 1]] as const)
  )
);

/** The stored code of the team a typed name resolves to, or `undefined` when no alias matches. */
export const getAliasTeamCode = (teamName: string): string | undefined => {
  if (!teamName) return undefined;
  return TEAM_CODE_ALIAS_MAP.get(normalizeTeamAlias(teamName.trim()));
};

/**
 * A **typed** team name's code (Story 2.11, owner decision U16, 2026-10-05) —
 * the custom-matchup form, where the fan's text is the only input. Order:
 *   1. a matching loaded row (U15, exactly as `getTeamCode` step 1);
 *   2. the logo alias table (`getAliasTeamCode`): the same aliases and the same
 *      normalization `getTeamLogo` resolves through, so `Jazz`, `UtahJazz` and
 *      `Sixers` print `UTA`/`UTA`/`PHI` beside the logo they already show, and a
 *      shared nickname takes the team the logo picked;
 *   3. `getTeamCode`'s remaining steps (placeholder literal, then the name path).
 * The archive and every FK-backed surface keep `getTeamCode`: a row is in hand
 * there, and an empty stored code must stay visible rather than be papered over
 * by the alias table. It lives here, not in `nba-utils.ts`, because this module
 * reads `import.meta.env` and `nba-utils.ts` must stay importable by the
 * pipeline program, which has no Vite types — the import runs one way, from
 * here to there. [2026-10-06, Story 2.16: the pipeline-program file that
 * imported it was Story 2.4's adapter suite, deleted with that adapter; no
 * pipeline file imports `nba-utils.ts` today, and the one-way rule stays so the
 * next one can.]
 */
export const getTypedTeamCode = (name: string, ...rows: Array<Team | null | undefined>): string => {
  const trimmed = (name ?? '').trim();
  const needle = trimmed.toLowerCase();
  const match = rows.find((row) => row?.full_name?.toLowerCase() === needle && row.abbreviation);
  if (match) return match.abbreviation;
  return getAliasTeamCode(trimmed) ?? getTeamCode(trimmed);
};

/**
 * Side-effect-free "is this a recognized team?" check over the same alias map
 * `getTeamLogo` resolves through (same normalization). Lets callers warn about
 * an unrecognized custom team name without triggering `getTeamLogo`'s
 * `console.warn`.
 */
export const isRecognizedTeam = (teamName: string): boolean => {
  if (!teamName) return false;
  return TEAM_LOGO_ALIAS_MAP.has(normalizeTeamAlias(teamName.trim()));
};

export const resolveTeamLogoUrl = (logoUrl?: string | null) => {
  if (!logoUrl) return undefined;
  if (/^(https?:)?\/\//.test(logoUrl)) return logoUrl;
  return `${import.meta.env.BASE_URL}${logoUrl.replace(/^\/+/, '')}`;
};

export const getTeamLogo = (teamName: string) => {
  if (!teamName) return undefined;
  const normalized = normalizeTeamAlias(teamName.trim());
  const url = TEAM_LOGO_ALIAS_MAP.get(normalized);
  if (!url) {
    console.warn(`Logo not found for team: "${teamName}".`);
    return undefined;
  }
  return resolveTeamLogoUrl(url);
};
