-- =========================================================
-- Refresh team logo asset paths from current public assets
-- Migration 00010
-- =========================================================

BEGIN;

WITH logo_map(full_name, logo_url) AS (
  VALUES
    ('Atlanta Hawks', 'assets/teams/hawks.png'),
    ('Baltimore Bullets', 'assets/teams/Baltimore Bullets.gif'),
    ('Boston Celtics', 'assets/teams/celtics.png'),
    ('Brooklyn Nets', 'assets/teams/nets.png'),
    ('Buffalo Braves', 'assets/teams/Buffalo_Braves.png'),
    ('Capital Bullets', 'assets/teams/Capital_Bullets.png'),
    ('Carolina Cougars', 'assets/teams/CarolinaCougars.jpg'),
    ('Charlotte Hornets', 'assets/teams/hornets.png'),
    ('Chicago Bulls', 'assets/teams/bulls.png'),
    ('Cincinnati Royals', 'assets/teams/Cincinnati_Royals.png'),
    ('Cleveland Cavaliers', 'assets/teams/cavaliers.png'),
    ('Dallas Chaparrals', 'assets/teams/Dallas_Chaparrals.jpg'),
    ('Dallas Mavericks', 'assets/teams/mavericks.png'),
    ('Denver Nuggets', 'assets/teams/nuggets.png'),
    ('Denver Rockets', 'assets/teams/Denver_Rockets.webp'),
    ('Detroit Pistons', 'assets/teams/pistons.png'),
    ('Fort Wayne Pistons', 'assets/teams/fort-wayne-pistons-1948-1957.png'),
    ('Golden State Warriors', 'assets/teams/warriors.png'),
    ('Houston Rockets', 'assets/teams/rockets.png'),
    ('Indiana Pacers', 'assets/teams/pacers.png'),
    ('Kansas City Kings', 'assets/teams/kansascity.avif'),
    ('Kentucky Colonels', 'assets/teams/KentuckyColonels.png'),
    ('Los Angeles Clippers', 'assets/teams/clippers.png'),
    ('Los Angeles Lakers', 'assets/teams/lakers.png'),
    ('Memphis Grizzlies', 'assets/teams/grizzlies.png'),
    ('Miami Floridians', 'assets/teams/Miamifloridians.png'),
    ('Miami Heat', 'assets/teams/heat.png'),
    ('Milwaukee Bucks', 'assets/teams/bucks.png'),
    ('Minneapolis Lakers', 'assets/teams/minneapolis_lakers_1948-1960.webp'),
    ('Minnesota Pipers', 'assets/teams/minnesota_pipers_1969.webp'),
    ('Minnesota Timberwolves', 'assets/teams/timberwolves.png'),
    ('New Jersey Nets', 'assets/teams/New_Jersey_Nets.jpg'),
    ('New Orleans Buccaneers', 'assets/teams/Neworleansbucs.png'),
    ('New Orleans Hornets', 'assets/teams/New_Orleans_Hornets_logo_29.webp'),
    ('New Orleans Pelicans', 'assets/teams/pelicans.png'),
    ('New York Knicks', 'assets/teams/knicks.png'),
    ('New York Nets', 'assets/teams/new_york_nets_1973-1977.webp'),
    ('Oakland Oaks', 'assets/teams/OaklandOaks.png'),
    ('Oklahoma City Thunder', 'assets/teams/thunder.png'),
    ('Orlando Magic', 'assets/teams/magic.png'),
    ('Philadelphia 76ers', 'assets/teams/76ers.png'),
    ('Philadelphia Warriors', 'assets/teams/Philadelphia_warriors.webp'),
    ('Phoenix Suns', 'assets/teams/suns.png'),
    ('Portland Trail Blazers', 'assets/teams/trail-blazers.png'),
    ('Rochester Royals', 'assets/teams/Rochester_Royals.png'),
    ('Sacramento Kings', 'assets/teams/kings.png'),
    ('San Antonio Spurs', 'assets/teams/spurs.png'),
    ('San Francisco Warriors', 'assets/teams/San_Francisco_Warriors.jpg'),
    ('Seattle SuperSonics', 'assets/teams/Seattle_SuperSonics.png'),
    ('St. Louis Bombers', 'assets/teams/St._Louis_Bombers.png'),
    ('St. Louis Hawks', 'assets/teams/St._Louis_Hawks.webp'),
    ('Syracuse Nationals', 'assets/teams/Syracuse_nationals_1949-1963.webp'),
    ('Toronto Raptors', 'assets/teams/raptors.png'),
    ('Utah Jazz', 'assets/teams/jazz.png'),
    ('Utah Stars', 'assets/teams/Utah_Stars.png'),
    ('Virginia Squires', 'assets/teams/VirginiaSquires.png'),
    ('Washington Bullets', 'assets/teams/Washington_Bullets.jpg'),
    ('Washington Capitols', 'assets/teams/Washington_Capitals.png'),
    ('Washington Wizards', 'assets/teams/wizards.png')
)
UPDATE teams
SET logo_url = logo_map.logo_url,
    updated_at = NOW()
FROM logo_map
WHERE teams.full_name = logo_map.full_name;

INSERT INTO team_logos (team_name, logo_url, team_id, created_at, updated_at)
SELECT full_name, logo_url, id, NOW(), NOW()
FROM teams
WHERE logo_url IS NOT NULL
ON CONFLICT (team_name) DO UPDATE
SET
  logo_url = EXCLUDED.logo_url,
  team_id = EXCLUDED.team_id,
  updated_at = NOW();

COMMIT;
