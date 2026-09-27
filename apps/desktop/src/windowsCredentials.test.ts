import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { windowsCredentials } from './windowsCredentials';

it.skipIf(process.platform !== 'win32')('uses fresh native processes to protect and unprotect a per-user DPAPI blob', () => {
  const codec = windowsCredentials(resolve('apps/server/native/dist/ControlOS.CredentialHost.exe'));
  const secret = 'native fixture: å🙂 secret value';
  const encrypted = codec.encrypt(secret);
  expect(encrypted.includes(Buffer.from(secret))).toBe(false);
  expect(codec.decrypt(encrypted)).toBe(secret);
  const changed = Buffer.from(encrypted); changed[changed.length - 1] ^= 1;
  expect(() => codec.decrypt(changed)).toThrow('original profile preserved');
  expect(() => codec.encrypt('x'.repeat(65537))).toThrow('supported size');
  expect(() => windowsCredentials('relative.exe')).toThrow('absolute path');
});
