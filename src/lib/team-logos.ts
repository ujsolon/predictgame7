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
