import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(store.status('github').configured).toBe(false);

    store.set('github', 'ghp_supersecrettoken1234');
    const st = store.status('github');
    expect(st.configured).toBe(true);
    expect(st.hint).toBe('••••1234'); // only the last 4 ever surface
    expect(JSON.stringify(st)).not.toContain('supersecret'); // never in the status payload
    expect(store.resolve('github')).toBe('ghp_supersecrettoken1234'); // server-only
  });

  it('falls back to .env, and a stored value overrides it', () => {
    const path = newPath();
    const store = new ConnectionsStore(path, (id) => (id === 'anthropic' ? 'sk-ant-fromenv' : undefined));
    expect(store.status('anthropic').configured).toBe(true);
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
    expect(reopened.status('figma').configured).toBe(true);
    reopened.remove('figma');
    expect(new ConnectionsStore(path).status('figma').configured).toBe(false);
  });

  it('keeps the secret on disk (like .env) but never in the status API', () => {
    const path = newPath();
    const store = new ConnectionsStore(path);
    store.set('vercel', 'vercel_ondisk_secret');
    expect(readFileSync(path, 'utf8')).toContain('vercel_ondisk_secret'); // file is the vault
    expect(JSON.stringify(store.statusAll())).not.toContain('vercel_ondisk_secret'); // API is masked
  });
});

it('migrates plaintext through a codec and refuses to silently read ciphertext without it', () => {
  const path = newPath(); new ConnectionsStore(path).set('github', 'sensitive-value');
  const codec = { id: 'test-codec', encrypt: (value: string) => Buffer.from(value).toString('base64'), decrypt: (value: string) => Buffer.from(value, 'base64').toString() };
  const store = new ConnectionsStore(path, undefined, codec);
  expect(store.resolve('github')).toBe('sensitive-value');
  expect(readFileSync(path, 'utf8')).not.toContain('sensitive-value');
  expect(new ConnectionsStore(path, undefined, codec).resolve('github')).toBe('sensitive-value');
  expect(() => new ConnectionsStore(path)).toThrow(/original OS key provider/);
});
it('preserves the original store if encryption verification fails', () => {
  const path = newPath(); new ConnectionsStore(path).set('github', 'keep-me'); const original = readFileSync(path, 'utf8');
  expect(() => new ConnectionsStore(path, undefined, { id: 'broken', encrypt: () => 'cipher', decrypt: () => 'wrong' })).toThrow(/round-trip/);
  expect(readFileSync(path, 'utf8')).toBe(original);
});
it('migrates an explicitly supported legacy encoding and rejects inherited decoder names', () => {
  const path = newPath();
  const old = { id: 'old', encrypt: (value: string) => Buffer.from(value).toString('base64'), decrypt: (value: string) => Buffer.from(value, 'base64').toString() };
  new ConnectionsStore(path, undefined, old).set('github', 'legacy-secret');
  const next = { ...old, id: 'new', legacyDecoders: { old: old.decrypt } };
  expect(new ConnectionsStore(path, undefined, next).resolve('github')).toBe('legacy-secret');
  expect(readFileSync(path, 'utf8')).toContain('"encoding": "new"');
  const invalid = JSON.stringify({ github: { value: 'cipher', encoding: 'toString', updatedTs: 'now' } });
  writeFileSync(path, invalid);
  expect(() => new ConnectionsStore(path, undefined, next)).toThrow('original OS key provider');
  expect(readFileSync(path, 'utf8')).toBe(invalid);
});
