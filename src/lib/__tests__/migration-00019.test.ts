// Story 4.5 · migration 00019, read statically (no database here): the file
// exists, `series_content` has RLS on with one SELECT-only policy and no write
// policy (AD-8: owner SQL / service-role scripts are the only writers), and
// the five pilot ids are the ones seeded `is_featured`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILE = join(process.cwd(), 'supabase', 'migrations', '00019_series_editorial_content.sql');

/** The SQL with `--` comments removed, so commentary cannot satisfy or trip an assertion. */
function sql(): string {
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** The owner's 2026-09-25 pilot pins (the ids `src/lib/flagship-series.ts` carried until Story 4.5). */
const PILOT_IDS = [
  'dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a',
  '06715a85-ec33-46a4-8383-d058055eefe6',
  '29638c4e-261a-4d09-81aa-5740f76175f5',
  '626257bc-1678-4c88-84a6-37e0a6cdb49c',
  '6ecb170c-e781-47f8-b7ee-881ba719d6d5',
];

describe('migration 00019 (Story 4.5)', () => {
  it('exists', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('adds series.is_featured NOT NULL DEFAULT false', () => {
    expect(sql()).toMatch(/ALTER TABLE public\.series ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;/);
  });

  it('seeds exactly the five pilot ids as featured', () => {
    const update = /UPDATE public\.series\s+SET is_featured = true\s+WHERE id IN \(([^)]*)\);/.exec(sql());
    expect(update).not.toBeNull();
    const ids = [...(update?.[1] ?? '').matchAll(/'([0-9a-f-]{36})'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual([...PILOT_IDS].sort());
    expect(sql().match(/UPDATE /g)).toHaveLength(1);
  });

  it('creates series_content with the (series_id, part) key, the part CHECK, the cascade and the videos array CHECK', () => {
    const table = /CREATE TABLE IF NOT EXISTS public\.series_content \(([\s\S]*?)\n\);/.exec(sql())?.[1] ?? '';
    expect(table).toMatch(/series_id uuid NOT NULL REFERENCES public\.series\(id\) ON DELETE CASCADE/);
    expect(table).toMatch(/part text NOT NULL CHECK \(part IN \('before', 'resolution'\)\)/);
    expect(table).toMatch(/headline text NULL/);
    expect(table).toMatch(/body_md text NULL/);
    expect(table).toMatch(/videos jsonb NOT NULL DEFAULT '\[\]'::jsonb CHECK \(jsonb_typeof\(videos\) = 'array'\)/);
    expect(table).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(table).toMatch(/PRIMARY KEY \(series_id, part\)/);
  });

  it('enables RLS with one SELECT-only policy for anon/authenticated and no write policy', () => {
    const text = sql();
    expect(text).toMatch(/ALTER TABLE public\.series_content ENABLE ROW LEVEL SECURITY;/);
    const policies = [...text.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0]);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/ON public\.series_content\s+FOR SELECT\s+TO anon, authenticated\s+USING \(true\)/);
    expect(text).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/);
    expect(text).not.toMatch(/\bGRANT\b/);
    // The 00011 idempotent pattern.
    expect(text).toMatch(/IF NOT EXISTS \(\s*SELECT 1\s+FROM pg_policies/);
  });

  it('is additive: it drops and renames nothing', () => {
    expect(sql()).not.toMatch(/\b(DROP|RENAME|DELETE FROM|TRUNCATE)\b/i);
  });
});
