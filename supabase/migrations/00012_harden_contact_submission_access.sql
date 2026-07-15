-- =========================================================
-- Predict Game 7 — Harden Contact Submission Access
-- Migration 00012
-- =========================================================

-- Contact submissions are written through the edge function using the service role,
-- so the public insert policy is unnecessary and broadens direct table access.
DROP POLICY IF EXISTS "Allow public insert to contact_submissions" ON public.contact_submissions;
