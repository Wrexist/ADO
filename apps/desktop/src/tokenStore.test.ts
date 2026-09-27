import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { loadOrCreateToken } from './tokenStore';

const codec = { encrypt: (text: string) => Buffer.from(text.split('').reverse().join('')), decrypt: (bytes: Buffer) => bytes.toString().split('').reverse().join('') };
it('migrates a legacy key once and preserves it across reopen', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-token-'));
  try {
    writeFileSync(join(root, 'acc-token'), 'legacy-access-key\n');
    expect(loadOrCreateToken(root, codec)).toBe('legacy-access-key');
    const stored = readFileSync(join(root, 'acc-token'), 'utf8');
    expect(stored).not.toContain('legacy-access-key');
    expect(loadOrCreateToken(root, codec)).toBe('legacy-access-key');
    expect(readFileSync(join(root, 'acc-token'), 'utf8')).toBe(stored);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it('preserves empty, malformed, unsupported and undecryptable token files', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-token-invalid-'));
  const file = join(root, 'acc-token');
  try {
    for (const original of ['', 'os:v1:%%%', 'os:v2:cipher', 'os:v1:YQ==']) {
      writeFileSync(file, original);
      expect(() => loadOrCreateToken(root, { ...codec, decrypt() { throw new Error('locked'); } })).toThrow();
      expect(readFileSync(file, 'utf8')).toBe(original);
    }
    writeFileSync(file, 'legacy-key');
    expect(() => loadOrCreateToken(root, { ...codec, decrypt: () => 'wrong' })).toThrow('original profile preserved');
    expect(readFileSync(file, 'utf8')).toBe('legacy-key');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
