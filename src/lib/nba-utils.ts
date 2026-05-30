export const TEAM_ABBREVIATIONS: Record<string, string> = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
  'Team A': 'TMA',
  'Team B': 'TMB',
};

export const getTeamAbbreviation = (name: string): string => {
  if (!name) return '';
  const trimmedName = name.trim();
  if (TEAM_ABBREVIATIONS[trimmedName]) return TEAM_ABBREVIATIONS[trimmedName];
  
  const words = trimmedName.split(/\s+/);
  if (words.length >= 2) {
    const abbrev = words.map(w => w[0]).join('').toUpperCase();
    if (abbrev.length >= 2 && abbrev.length <= 3) return abbrev;
  }
  return trimmedName.substring(0, 3).toUpperCase();
};

export const getRoundImportance = (round: string) => {
  const r = round.toLowerCase();
  if (r.includes('finals') && !r.includes('conf')) return 4;
  if (r.includes('conf finals')) return 3;
  if (r.includes('semifinals')) return 2;
  if (r.includes('first round')) return 1;
  return 0;
};
