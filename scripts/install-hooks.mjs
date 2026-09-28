import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const hooksDir = join(resolve(repoRoot, gitDir), 'hooks');
const source = join(repoRoot, '.githooks', 'pre-push');

if (!existsSync(source)) {
  console.error(`hooks:install: missing ${source}`);
  process.exit(1);
}

const target = join(hooksDir, 'pre-push');
const tracked = readFileSync(source, 'utf8');
if (existsSync(target) && readFileSync(target, 'utf8') === tracked) {
  console.log('hooks:install: .git/hooks/pre-push already up to date');
} else {
  mkdirSync(hooksDir, { recursive: true });
  copyFileSync(source, target);
  console.log(`hooks:install: installed pre-push -> ${target}`);
}
// The mode bit is what makes the hook fire; setting it costs nothing where it is ignored.
try {
  chmodSync(target, 0o755);
} catch {
  console.warn('hooks:install: could not set the executable bit (harmless on Windows)');
}
