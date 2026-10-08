-- =========================================================
-- Predict Game 7 — series editorial content + featured flag
-- Migration 00019 (Story 4.5, FR-13 pilot)
-- =========================================================
-- Additive only: one new column on `series` and one new table. Nothing that
-- reads the live schema today changes behaviour when this lands, so it can be
-- applied (owner, `npx supabase db push`) before the code that reads it ships.
--
-- 1. `series.is_featured` replaces `src/lib/flagship-series.ts`, the pinned
--    id list Story 4.3 shipped. A featured archived series gets the
--    preview/result page pair; a featured pending series gets the preview only.
--    Phase is still derived (`winner_team_id`, AD-4), never stored here.
-- 2. `series_content` holds at most one "before" and one "resolution" part per
--    series — the `(series_id, part)` primary key makes that a database fact.
--    The spoiler strip on a preview page removes one row.
--
-- Writes (AD-8): owner SQL or service-role scripts only. RLS is on with a
-- SELECT-only policy for anon/authenticated; there is no insert, update or
-- delete policy, so no client can write.

BEGIN;

ALTER TABLE public.series ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- The five pilot series the owner pinned on 2026-09-25 (the ids that were
-- `FLAGSHIP_SERIES_IDS`).
UPDATE public.series
SET is_featured = true
WHERE id IN (
  'dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a', -- 2013 Finals, Heat–Spurs
  '06715a85-ec33-46a4-8383-d058055eefe6', -- 2016 Finals, Cavaliers–Warriors
  '29638c4e-261a-4d09-81aa-5740f76175f5', -- 2019 Eastern Conference Semifinals, Raptors–76ers
  '626257bc-1678-4c88-84a6-37e0a6cdb49c', -- 2025 Finals, Thunder–Pacers
  '6ecb170c-e781-47f8-b7ee-881ba719d6d5'  -- 2026 Western Conference Finals, Thunder–Spurs
);

CREATE TABLE IF NOT EXISTS public.series_content (
  series_id uuid NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  part text NOT NULL CHECK (part IN ('before', 'resolution')),
  headline text NULL,
  body_md text NULL,
  videos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(videos) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, part)
);

ALTER TABLE public.series_content ENABLE ROW LEVEL SECURITY;

-- The 00011 idempotent public-read pattern.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'series_content'
      AND policyname = 'Public can read series content'
  ) THEN
    CREATE POLICY "Public can read series content"
      ON public.series_content
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

COMMIT;
