/**
 * Story 4.0 pass-2 review — the AD-1 import guard must be able to go red.
 *
 * `biome.json`'s `noRestrictedImports` rule is the only automatic enforcement
 * of the analytics isolation port, and its efficacy had rested on throwaway
 * manual probes. Review pass 1 caught a shipped bypass (the initial rule
 * missed subpath specifiers like `posthog-js/react`); a future override edit or
 * Biome upgrade can silently un-enforce the boundary with the gate green.
 *
 * This test spawns the repo's own Biome binary against temporary fixtures and
 * pins the decided shape: exact specifiers, subpath specifiers, and the
 * `src/lib/analytics/**` exemption all behave as configured.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The platform package `@biomejs/biome` installs as an optional dependency;
// spawning its binary directly keeps the test off PATH and off shell
// interpretation (`.bin/biome.cmd` cannot be spawned without a shell here).
const biomeBin = join(
  repoRoot,
  'node_modules',
  '@biomejs',
  `cli-${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'biome.exe' : 'biome',
);

const FIXTURE = 'src/__ad1_guard_fixture__.ts';
const PORT_FIXTURE = join('src', 'lib', 'analytics', '__ad1_guard_fixture__.ts');

const VENDOR_IMPORTS = [
  "import posthog from 'posthog-js';",
  "import { usePostHog } from '@posthog/react';",
  "import { captureException } from 'posthog-js/react';",
  'export const probe = [posthog, usePostHog, captureException];',
].join('\n');

function biomeLint(file: string) {
  return spawnSync(biomeBin, ['lint', '--reporter=github', file], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

// Measured under the full `npm test` run: each spawned Biome takes 2.7-4.8 s
// while the other workers load the machine, past Vitest's 5 s default. These
// cases carry an explicit budget up to the spawn ceiling instead of any global
// timeout raise.
const IT_TIMEOUT = 30_000;

afterEach(() => {
  rmSync(join(repoRoot, FIXTURE), { force: true });
  rmSync(join(repoRoot, PORT_FIXTURE), { force: true });
});

describe('AD-1 analytics import guard (biome.json noRestrictedImports)', () => {
  it('the spawned Biome is the repo-installed binary', () => {
    // Abort loudly rather than vacuously: every case below is worthless if
    // this path ever stops resolving.
    expect(existsSync(biomeBin), `Biome binary missing at ${biomeBin}`).toBe(true);
  });

  it('vendor imports outside the port fail with one diagnostic per specifier', () => {
    writeFileSync(join(repoRoot, FIXTURE), `${VENDOR_IMPORTS}\n`);

    const res = biomeLint(FIXTURE);
    const out = `${res.stdout}\n${res.stderr}`;
    const lines = [...out.matchAll(/title=lint\/style\/noRestrictedImports,file=[^,]*,line=(\d+)/g)].map(
      (m) => Number(m[1]),
    );

    expect(res.status, `expected lint failure, got exit ${res.status}: ${out}`).not.toBe(0);
    // One restricted diagnostic on each of the three import lines: posthog-js,
    // @posthog/react, and the posthog-js/react subpath — the exact miss review
    // pass 1 found in the first cut of the rule. Line 2 may carry a second
    // diagnostic (`@posthog/**` also matches the bare specifier), so distinct
    // lines are pinned, not the total count.
    expect([...new Set(lines)].sort()).toEqual([1, 2, 3]);
  }, IT_TIMEOUT);

  it('the same imports inside src/lib/analytics/** stay exempt', () => {
    writeFileSync(join(repoRoot, PORT_FIXTURE), `${VENDOR_IMPORTS}\n`);

    const res = biomeLint(PORT_FIXTURE);

    // Proves the override still fires; if someone deletes it, the port folder
    // itself stops linting and this case goes red.
    expect(res.stdout, res.stdout).toBe('');
    expect(res.status, `expected clean lint, got: ${res.stdout}${res.stderr}`).toBe(0);
  }, IT_TIMEOUT);

  it('a vendor-free feature file passes the harness (control)', () => {
    writeFileSync(join(repoRoot, FIXTURE), 'export const probe = 1;\n');

    const res = biomeLint(FIXTURE);

    expect(res.status, `control fixture must lint clean, got: ${res.stdout}${res.stderr}`).toBe(0);
  }, IT_TIMEOUT);
});
