// Story 4.8 · the prerender entry script, spawned as `npm run prerender` runs
// it (mirrors tests/og/card.test.ts's entry-script block).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../scripts/og/render.ts';

describe('the prerender entry script (spawned, as `npm run prerender` runs it)', { timeout: 30_000 }, () => {
  it('auto-runs as the entry and exits 2 naming VITE_SUPABASE_URL when the env is absent', () => {
    // The argv comes from package.json's own `prerender` line, so a script path
    // or node-flag move is caught here rather than at deploy time.
    const scripts = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> })
      .scripts;
    const tokens = scripts.prerender.split(' ');
    expect(tokens[0]).toBe('node');
    // The checkout has a real `.env`; an empty file keeps this off the live database.
    const emptyEnv = join(mkdtempSync(join(tmpdir(), 'prerender-env-')), 'empty.env');
    writeFileSync(emptyEnv, '');
    const argv = tokens.slice(1).map((token) => (token.startsWith('--env-file') ? token.replace(/=.*$/, `=${emptyEnv}`) : token));
    expect(argv[argv.length - 1]).toBe('scripts/prerender/run.ts');

    const env = { ...process.env };
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_ANON_KEY;
    const res = spawnSync(process.execPath, argv, { env, cwd: REPO_ROOT, encoding: 'utf8' });
    rmSync(join(emptyEnv, '..'), { recursive: true, force: true });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/VITE_SUPABASE_URL/);
  });

  it('exits non-zero rather than quietly skipping the run when the launcher path does not resolve', () => {
    const bogus = join(mkdtempSync(join(tmpdir(), 'prerender-launcher-')), 'gone.js');
    const moduleUrl = pathToFileURL(join(REPO_ROOT, 'scripts', 'prerender', 'run.ts')).href;
    const env = { ...process.env };
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_ANON_KEY;
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', `process.argv[1] = ${JSON.stringify(bogus)}; await import(${JSON.stringify(moduleUrl)});`], {
      env,
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/ENOENT/);
  });
});
