import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
import './build-process-host.mjs';

if (process.platform !== 'win32') throw new Error('This native credential acceptance probe requires Windows');

const root = mkdtempSync(join(tmpdir(), 'controlos-native-profile-'));
const bundle = join(root, 'probe.cjs');
await build({ entryPoints: ['scripts/native-profile-worker.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' });
writeFileSync(join(root, 'acc-token'), 'native-fixture-access-key\n');
writeFileSync(join(root, 'connections.json'), JSON.stringify({ github: { value: 'native-fixture-provider-key', updatedTs: '2026-09-27T00:00:00.000Z' } }));
const other = JSON.stringify({ profile: 'untouched fixture settings' });
writeFileSync(join(root, 'project-settings.json'), other);
const require = createRequire(import.meta.url); const electron = require('electron');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
for (const phase of ['interrupt', 'migrate', 'reopen', 'legacy', 'reopen']) {
  const code = await new Promise((accept, reject) => {
    const child = spawn(electron, [bundle, root, phase, resolve('apps/server/native/dist/ControlOS.CredentialHost.exe')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Native fixture deadline exceeded')); }, 30000);
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    child.once('error', reject); child.once('close', (code) => { clearTimeout(timeout); accept(code); });
  });
  assert.equal(code, phase === 'interrupt' ? 73 : 0, `Native phase failed: ${phase}; evidence: ${root}`);
  assert.equal(readFileSync(join(root, 'project-settings.json'), 'utf8'), other);
}
// Only this newly allocated disposable profile is removed, never a user profile.
assert.equal(dirname(resolve(root)), resolve(tmpdir()));
assert(root.includes('controlos-native-profile-'));
rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
console.log('Native credential migration, interrupted migration and reopen passed. No real credentials used.');
