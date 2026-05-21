CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Allow public to insert (with captcha validation in edge function ideally, but table needs insert)
CREATE POLICY "Allow public insert to contact_submissions" ON contact_submissions
FOR INSERT WITH CHECK (true);

-- Allow admins to read (if we had admin auth, but for now just table setup)
CREATE POLICY "Allow authenticated to read contact_submissions" ON contact_submissions
FOR SELECT TO authenticated USING (true);
