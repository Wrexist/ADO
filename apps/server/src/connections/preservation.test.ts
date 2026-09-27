import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, linkSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { ConnectionsStore } from './store';
import { connectionRecovery } from './file';
import { buildServer } from '../app';

it('preserves externally corrupted, deleted, replaced and linked files when an already open store saves', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-preservation-')), file = join(root, 'connections.json');
  try {
    const store = new ConnectionsStore(file); store.set('figma', 'original-fixture-key');
    const original = readFileSync(file, 'utf8');
    for (const value of ['{corrupt canary-secret', 'null', '{}']) {
      writeFileSync(file, value);
      expect(() => store.set('figma', 'replacement')).toThrow(connectionRecovery);
      expect(() => store.remove('figma')).toThrow(connectionRecovery);
      expect(readFileSync(file, 'utf8')).toBe(value);
      expect(store.resolve('figma')).toBe('original-fixture-key');
    }
    rmSync(file);
    expect(() => store.set('figma', 'replacement')).toThrow(connectionRecovery);
    writeFileSync(file, original);
    expect(() => store.set('figma', 'replacement')).toThrow(connectionRecovery);
    const reopened = new ConnectionsStore(file);
    linkSync(file, join(root, 'linked'));
    expect(() => reopened.remove('figma')).toThrow(connectionRecovery);
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(() => new ConnectionsStore(file)).toThrow(connectionRecovery);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('rejects stale authenticated API saves and returns a recovery path without exposing corrupt bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-api-')), file = join(root, 'connections.json');
  new ConnectionsStore(file).set('figma', 'original-fixture-key');
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture-access', dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false }, { startSystem: false });
  try {
    writeFileSync(file, '{corrupt canary-secret');
    const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'fixture-access' };
    const response = await server.app.inject({ method: 'POST', url: '/api/connections/figma', headers, payload: { value: 'new-fixture-key' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: connectionRecovery });
    expect(response.body).not.toContain('canary-secret');
    const removed = await server.app.inject({ method: 'DELETE', url: '/api/connections/figma', headers });
    expect(removed.statusCode).toBe(400); expect(removed.json()).toEqual({ error: connectionRecovery });
    expect(readFileSync(file, 'utf8')).toBe('{corrupt canary-secret');
    expect(() => new ConnectionsStore(file)).toThrow(connectionRecovery);
    await expect(buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture-access', dbPath: join(root, 'not-created.sqlite'), projectDirs: [], demo: false }, { startSystem: false })).rejects.toThrow(connectionRecovery);
    expect(existsSync(join(root, 'not-created.sqlite'))).toBe(false);
    const status = (await server.app.inject({ url: '/api/connections', headers })).json().connections.find((c: { id: string }) => c.id === 'figma');
    expect(status).toMatchObject({ configured: true, authentication: 'unverified' });
  } finally { await server.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it.skipIf(process.platform !== 'win32')('preserves a real Windows read-denied connection file at startup and on save', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-denied-')), file = join(root, 'connections.json');
  const store = new ConnectionsStore(file); store.set('figma', 'locked-fixture-key');
  const original = readFileSync(file, 'utf8');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$stream = [System.IO.File]::Open($env:CONTROL_OS_FIXTURE_FILE, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); try { [Console]::WriteLine("locked"); [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }'], { env: { ...process.env, CONTROL_OS_FIXTURE_FILE: file }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  try {
    const [chunk] = await once(child.stdout!, 'data'); expect(String(chunk)).toContain('locked');
    expect(() => new ConnectionsStore(file)).toThrow(connectionRecovery);
    await expect(buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture-access', dbPath: join(root, 'not-created.sqlite'), projectDirs: [], demo: false }, { startSystem: false })).rejects.toThrow(connectionRecovery);
    expect(existsSync(join(root, 'not-created.sqlite'))).toBe(false);
    expect(() => store.set('figma', 'replacement')).toThrow(connectionRecovery);
    expect(() => store.remove('figma')).toThrow(connectionRecovery);
    child.stdin!.end('\n'); await exited;
    expect(readFileSync(file, 'utf8')).toBe(original);
    store.set('figma', 'after-unlock');
    expect(new ConnectionsStore(file).resolve('figma')).toBe('after-unlock');
    renameSync(file, join(root, 'retained.json'));
    expect(() => store.remove('figma')).toThrow(connectionRecovery);
  } finally { if (child.exitCode === null) { child.kill(); await exited; } rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
