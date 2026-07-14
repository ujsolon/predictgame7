-- =========================================================
-- Predict Game 7 — Enable RLS on Public Release Tables
-- Migration 00011
-- =========================================================

-- Enable RLS on all public-facing normalized tables flagged by the linter.
ALTER TABLE public.prediction_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Public read access for reference data used by the app UI and prediction edge function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teams'
      AND policyname = 'Public can read teams'
  ) THEN
    CREATE POLICY "Public can read teams"
      ON public.teams
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'series'
      AND policyname = 'Public can read series'
  ) THEN
    CREATE POLICY "Public can read series"
      ON public.series
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'series_game_scores'
      AND policyname = 'Public can read series game scores'
  ) THEN
    CREATE POLICY "Public can read series game scores"
      ON public.series_game_scores
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'prediction_methods'
      AND policyname = 'Public can read active prediction methods'
  ) THEN
    CREATE POLICY "Public can read active prediction methods"
      ON public.prediction_methods
      FOR SELECT
      TO anon, authenticated
      USING (is_active = true);
  END IF;
END $$;

-- Keep predictions private by default.
-- Service role operations used by backend jobs and edge functions bypass RLS.
