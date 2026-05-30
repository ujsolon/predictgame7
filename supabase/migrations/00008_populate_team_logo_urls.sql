-- =========================================================
-- Populate canonical team logo URLs
-- Migration 00008
-- =========================================================

BEGIN;

WITH logo_map(full_name, logo_url) AS (
  VALUES
    ('Atlanta Hawks', 'assets/teams/hawks.png'),
    ('Baltimore Bullets', 'assets/teams/Baltimore Bullets.gif'),
    ('Boston Celtics', 'assets/teams/celtics.png'),
    ('Brooklyn Nets', 'assets/teams/nets.png'),
    ('Buffalo Braves', 'assets/teams/clippers.png'),
    ('Capital Bullets', 'assets/teams/Baltimore Bullets.gif'),
    ('Carolina Cougars', 'assets/teams/hornets.png'),
    ('Charlotte Hornets', 'assets/teams/hornets.png'),
    ('Chicago Bulls', 'assets/teams/bulls.png'),
    ('Cincinnati Royals', 'assets/teams/kings.png'),
    ('Cleveland Cavaliers', 'assets/teams/cavaliers.png'),
    ('Dallas Chaparrals', 'assets/teams/spurs.png'),
    ('Dallas Mavericks', 'assets/teams/mavericks.png'),
    ('Denver Nuggets', 'assets/teams/nuggets.png'),
    ('Denver Rockets', 'assets/teams/nuggets.png'),
    ('Detroit Pistons', 'assets/teams/pistons.png'),
    ('Fort Wayne Pistons', 'assets/teams/pistons.png'),
    ('Golden State Warriors', 'assets/teams/warriors.png'),
    ('Houston Rockets', 'assets/teams/rockets.png'),
    ('Indiana Pacers', 'assets/teams/pacers.png'),
    ('Kansas City Kings', 'assets/teams/kings.png'),
    ('Kentucky Colonels', 'assets/teams/pacers.png'),
    ('Los Angeles Clippers', 'assets/teams/clippers.png'),
    ('Los Angeles Lakers', 'assets/teams/lakers.png'),
    ('Memphis Grizzlies', 'assets/teams/grizzlies.png'),
    ('Miami Floridians', 'assets/teams/heat.png'),
    ('Miami Heat', 'assets/teams/heat.png'),
    ('Milwaukee Bucks', 'assets/teams/bucks.png'),
    ('Minneapolis Lakers', 'assets/teams/lakers.png'),
    ('Minnesota Pipers', 'assets/teams/timberwolves.png'),
    ('Minnesota Timberwolves', 'assets/teams/timberwolves.png'),
    ('New Jersey Nets', 'assets/teams/nets.png'),
    ('New Orleans Buccaneers', 'assets/teams/pelicans.png'),
    ('New Orleans Hornets', 'assets/teams/hornets.png'),
    ('New Orleans Pelicans', 'assets/teams/pelicans.png'),
    ('New York Knicks', 'assets/teams/knicks.png'),
    ('New York Nets', 'assets/teams/nets.png'),
    ('Oakland Oaks', 'assets/teams/warriors.png'),
    ('Oklahoma City Thunder', 'assets/teams/thunder.png'),
    ('Orlando Magic', 'assets/teams/magic.png'),
    ('Philadelphia 76ers', 'assets/teams/76ers.png'),
    ('Philadelphia Warriors', 'assets/teams/warriors.png'),
    ('Phoenix Suns', 'assets/teams/suns.png'),
    ('Portland Trail Blazers', 'assets/teams/trail-blazers.png'),
    ('Rochester Royals', 'assets/teams/kings.png'),
    ('Sacramento Kings', 'assets/teams/kings.png'),
    ('San Antonio Spurs', 'assets/teams/spurs.png'),
    ('San Francisco Warriors', 'assets/teams/warriors.png'),
    ('Seattle SuperSonics', 'assets/teams/thunder.png'),
    ('St. Louis Bombers', 'assets/teams/hawks.png'),
    ('St. Louis Hawks', 'assets/teams/hawks.png'),
    ('Syracuse Nationals', 'assets/teams/76ers.png'),
    ('Toronto Raptors', 'assets/teams/raptors.png'),
    ('Utah Jazz', 'assets/teams/jazz.png'),
    ('Utah Stars', 'assets/teams/jazz.png'),
    ('Virginia Squires', 'assets/teams/wizards.png'),
    ('Washington Bullets', 'assets/teams/Baltimore Bullets.gif'),
    ('Washington Capitols', 'assets/teams/wizards.png'),
    ('Washington Wizards', 'assets/teams/wizards.png')
)
UPDATE teams
SET logo_url = logo_map.logo_url,
    updated_at = NOW()
FROM logo_map
WHERE teams.full_name = logo_map.full_name;

INSERT INTO team_logos (team_name, logo_url)
SELECT full_name, logo_url
FROM teams
WHERE logo_url IS NOT NULL
ON CONFLICT (team_name) DO UPDATE
SET logo_url = EXCLUDED.logo_url;

COMMIT;
