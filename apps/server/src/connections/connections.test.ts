import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionsStore } from './store';

let dir: string;
const newPath = () => {
  dir = mkdtempSync(join(tmpdir(), 'acc-conn-'));
  return join(dir, 'connections.json');
};
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

describe('connections store (secrets never leave the server)', () => {
  it('stores a value, reports masked status, and resolves it back internally', () => {
    const store = new ConnectionsStore(newPath());
    expect(store.status('github').connected).toBe(false);

    store.set('github', 'ghp_supersecrettoken1234');
    const st = store.status('github');
    expect(st.connected).toBe(true);
    expect(st.hint).toBe('••••1234'); // only the last 4 ever surface
    expect(JSON.stringify(st)).not.toContain('supersecret'); // never in the status payload
    expect(store.resolve('github')).toBe('ghp_supersecrettoken1234'); // server-only
  });

  it('falls back to .env, and a stored value overrides it', () => {
    const path = newPath();
    const store = new ConnectionsStore(path, (id) => (id === 'anthropic' ? 'sk-ant-fromenv' : undefined));
    expect(store.status('anthropic').connected).toBe(true);
    expect(store.status('anthropic').updatedTs).toBe('from .env');
    store.set('anthropic', 'sk-ant-fromsettings');
    expect(store.resolve('anthropic')).toBe('sk-ant-fromsettings'); // stored wins
  });

  it('rejects unknown connectors and empty values', () => {
    const store = new ConnectionsStore(newPath());
    expect(() => store.set('not-a-real-service', 'x')).toThrow(/unknown/);
    expect(() => store.set('github', '   ')).toThrow(/empty/);
  });

  it('persists across instances and removes cleanly', () => {
    const path = newPath();
    new ConnectionsStore(path).set('figma', 'figd_abc');
    const reopened = new ConnectionsStore(path);
    expect(reopened.status('figma').connected).toBe(true);
    reopened.remove('figma');
    expect(new ConnectionsStore(path).status('figma').connected).toBe(false);
  });

  it('keeps the secret on disk (like .env) but never in the status API', () => {
    const path = newPath();
    const store = new ConnectionsStore(path);
    store.set('vercel', 'vercel_ondisk_secret');
    expect(readFileSync(path, 'utf8')).toContain('vercel_ondisk_secret'); // file is the vault
    expect(JSON.stringify(store.statusAll())).not.toContain('vercel_ondisk_secret'); // API is masked
  });
});
