import { spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
export function windowsCredentials(executable: string) {
  if (!isAbsolute(executable)) throw new Error('Credential host must have an absolute path');
  const operate = (action: 'encrypt' | 'decrypt', value: Buffer): Buffer => {
    if (value.length > 65536) throw new Error('Credential exceeds supported size');
    // Credential bytes only use private stdin/stdout, never command arguments.
    const result = spawnSync(executable, [action], { input: value.toString('base64') + '\n', encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 256 * 1024,
      env: { SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT, WINDIR: process.env.WINDIR } });
    if (result.error || result.status !== 0) throw new Error('OS credential operation failed; original profile preserved');
    const encoded = result.stdout.trim(); const bytes = Buffer.from(encoded, 'base64');
    if (!encoded || bytes.toString('base64') !== encoded) throw new Error('Invalid credential host response');
    return bytes;
  };
  return { encrypt: (value: string) => operate('encrypt', Buffer.from(value, 'utf8')), decrypt: (value: Buffer) => operate('decrypt', value).toString('utf8') };
}
