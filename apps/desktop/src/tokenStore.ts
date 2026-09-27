import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TokenCodec {
  prefix?: string;
  legacyDecrypt?: (value: Buffer) => string;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

/** Only ENOENT means a new profile. Never replace an unreadable or corrupt key. */
export function loadOrCreateToken(dir: string, codec: TokenCodec): string {
  const file = join(dir, 'acc-token');
  let existing: string | undefined;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw new Error('Invalid access-key file');
    existing = readFileSync(file, 'utf8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read access key; original profile preserved. Restore a verified backup into a new profile.');
  }
  const prefix = codec.prefix ?? 'os:v1:';
  let legacyToken: string | undefined;
  if (existing !== undefined && !existing) throw new Error('Access-key file is empty; original profile preserved. Restore a verified backup into a new profile.');
  if (existing?.startsWith('os:')) {
    const legacy = !existing.startsWith(prefix) && existing.startsWith('os:v1:') && codec.legacyDecrypt;
    if (!existing.startsWith(prefix) && !legacy) throw new Error('Unsupported access-key encoding; original profile preserved');
    const encoded = existing.slice(legacy ? 'os:v1:'.length : prefix.length);
    const bytes = Buffer.from(encoded, 'base64');
    if (!encoded || bytes.toString('base64') !== encoded) throw new Error('Invalid encrypted access key; original profile preserved');
    try {
      const token = legacy ? legacy(bytes) : codec.decrypt(bytes);
      if (!token.trim()) throw new Error('empty decrypted value');
      if (!legacy) return token;
      legacyToken = token;
    } catch { throw new Error('Cannot decrypt access key. Unlock the original OS credential store or restore a verified backup into a new profile.'); }
  }
  const token = legacyToken ?? existing ?? randomBytes(24).toString('hex');
  let encrypted: Buffer;
  try {
    encrypted = codec.encrypt(token);
    if (codec.decrypt(encrypted) !== token) throw new Error('round-trip failed');
  } catch { throw new Error('Access-key encryption failed; original profile preserved'); }
  const temp = `${file}.${randomBytes(12).toString('hex')}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temp, 'wx', 0o600);
    writeFileSync(fd, `${prefix}${encrypted.toString('base64')}\n`);
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temp, file); chmodSync(file, 0o600);
  } finally { if (fd !== undefined) closeSync(fd); rmSync(temp, { force: true }); }
  return token;
}
