-- =========================================================
-- Predict Game 7 — Archive Legacy Tables
-- Migration 00013
-- =========================================================

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'game_sevens'
  ) THEN
    ALTER TABLE public.game_sevens SET SCHEMA archive;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'current_game_sevens'
  ) THEN
    ALTER TABLE public.current_game_sevens SET SCHEMA archive;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'model_parameters'
  ) THEN
    ALTER TABLE public.model_parameters SET SCHEMA archive;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'team_logos'
  ) THEN
    ALTER TABLE public.team_logos SET SCHEMA archive;
  END IF;
END $$;
