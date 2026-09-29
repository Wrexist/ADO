#!/usr/bin/env node
/**
 * Build the Windows installer (ACC-Setup-<version>.exe) from the current commit.
 *
 * Runs in a throwaway copy made with `git archive`, so Electron's native-module rebuild
 * (better-sqlite3 for Electron's ABI) never touches this development checkout's Node
 * modules. Uncommitted changes are NOT included: commit first. The installer is unsigned,
 * so Windows SmartScreen asks "More info → Run anyway" on first install (docs/DESKTOP.md).
 *
 * Usage: node scripts/build-windows-app.mjs [--keep]
 *   --keep   leave the temporary build copy in place for inspection
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'win32') throw new Error('The Windows installer must be built on Windows.');
const repo = resolve(import.meta.dirname, '..');
const keep = process.argv.includes('--keep');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args, cwd) => {
  console.log(`\n> ${command} ${args.join(' ')}  (${cwd})`);
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: command.endsWith('.cmd'), env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
};

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim();
if (dirty) console.warn('Note: uncommitted changes are not part of the installer; building the last commit.');
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

const work = mkdtempSync(join(tmpdir(), 'controlos-app-build-'));
try {
  const archive = join(work, 'source.tar'), src = join(work, 'src');
  mkdirSync(src);
  run('git', ['archive', '--format=tar', '-o', archive, 'HEAD'], repo);
  run('tar', ['-xf', 'source.tar', '-C', 'src'], work); // relative: GNU tar reads 'C:' as a remote host
  run(npm, ['ci', '--no-audit', '--no-fund'], src);
  run(npm, ['run', 'build'], src);
  run(npm, ['exec', '--', 'electron-builder', '--win', 'nsis', '--x64', '--publish', 'never'], join(src, 'apps', 'desktop'));

  const releaseDir = join(src, 'apps', 'desktop', 'release');
  const installer = readdirSync(releaseDir).find((name) => /^ACC-Setup-.*\.exe$/.test(name));
  if (!installer) throw new Error('electron-builder finished without an installer');
  const outDir = join(repo, 'apps', 'desktop', 'release');
  mkdirSync(outDir, { recursive: true });
  copyFileSync(join(releaseDir, installer), join(outDir, installer));
  console.log(`\nInstaller ready (commit ${commit}): ${join(outDir, installer)}`);
} finally {
  if (keep) console.log(`Build copy kept at ${work}`);
  else rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
