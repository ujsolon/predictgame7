// src/lib/team-logos.ts
// src/lib/team-logos.ts
const TEAM_LOGOS: Record<string, string> = {
  'Atlanta Hawks': `${import.meta.env.BASE_URL}assets/teams/hawks.png`,
  'Boston Celtics': `${import.meta.env.BASE_URL}assets/teams/celtics.png`,
  'Brooklyn Nets': `${import.meta.env.BASE_URL}assets/teams/nets.png`,
  'Charlotte Hornets': `${import.meta.env.BASE_URL}assets/teams/hornets.png`,
  'Chicago Bulls': `${import.meta.env.BASE_URL}assets/teams/bulls.png`,
  'Cleveland Cavaliers': `${import.meta.env.BASE_URL}assets/teams/cavaliers.png`,
  'Dallas Mavericks': `${import.meta.env.BASE_URL}assets/teams/mavericks.png`,
  'Denver Nuggets': `${import.meta.env.BASE_URL}assets/teams/nuggets.png`,
  'Detroit Pistons': `${import.meta.env.BASE_URL}assets/teams/pistons.png`,
  'Golden State Warriors': `${import.meta.env.BASE_URL}assets/teams/warriors.png`,
  'Houston Rockets': `${import.meta.env.BASE_URL}assets/teams/rockets.png`,
  'Indiana Pacers': `${import.meta.env.BASE_URL}assets/teams/pacers.png`,
  'LA Clippers': `${import.meta.env.BASE_URL}assets/teams/clippers.png`,
  'Los Angeles Lakers': `${import.meta.env.BASE_URL}assets/teams/lakers.png`,
  'Memphis Grizzlies': `${import.meta.env.BASE_URL}assets/teams/grizzlies.png`,
  'Miami Heat': `${import.meta.env.BASE_URL}assets/teams/heat.png`,
  'Milwaukee Bucks': `${import.meta.env.BASE_URL}assets/teams/bucks.png`,
  'Minnesota Timberwolves': `${import.meta.env.BASE_URL}assets/teams/timberwolves.png`,
  'New Orleans Pelicans': `${import.meta.env.BASE_URL}assets/teams/pelicans.png`,
  'New York Knicks': `${import.meta.env.BASE_URL}assets/teams/knicks.png`,
  'Oklahoma City Thunder': `${import.meta.env.BASE_URL}assets/teams/thunder.png`,
  'Orlando Magic': `${import.meta.env.BASE_URL}assets/teams/magic.png`,
  'Philadelphia 76ers': `${import.meta.env.BASE_URL}assets/teams/76ers.png`,
  'Phoenix Suns': `${import.meta.env.BASE_URL}assets/teams/suns.png`,
  'Portland Trail Blazers': `${import.meta.env.BASE_URL}assets/teams/trail-blazers.png`,
  'Sacramento Kings': `${import.meta.env.BASE_URL}assets/teams/kings.png`,
  'San Antonio Spurs': `${import.meta.env.BASE_URL}assets/teams/spurs.png`,
  'Toronto Raptors': `${import.meta.env.BASE_URL}assets/teams/raptors.png`,
  'Utah Jazz': `${import.meta.env.BASE_URL}assets/teams/jazz.png`,
  'Washington Wizards': `${import.meta.env.BASE_URL}assets/teams/wizards.png`,
};

export const getTeamLogo = (teamName: string) => {
  if (!teamName) return undefined;
  const name = teamName.trim();
  const url = TEAM_LOGOS[name];
  if (!url) {
    console.warn(`Logo not found for team: "${teamName}". Available teams:`, Object.keys(TEAM_LOGOS));
  }
  return url;
};