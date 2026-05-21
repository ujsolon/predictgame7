CREATE TABLE IF NOT EXISTS team_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL UNIQUE,
  logo_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON team_logos FOR SELECT USING (true);