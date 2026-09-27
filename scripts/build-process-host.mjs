import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  const root = fileURLToPath(new URL('../apps/server/native/', import.meta.url));
  for (const name of ['JobHost', 'CredentialHost']) {
    const source = join(root, `${name}.cs`);
    const output = join(root, 'dist', `ControlOS.${name}.exe`);
    const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
    const stamp = `${output}.source-sha256`;
    if (!existsSync(output) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== digest) {
      const windows = process.env.SystemRoot ?? process.env.SYSTEMROOT;
      if (!windows) throw new Error('SystemRoot is required to build the Windows process host');
      const compiler = join(windows, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
      mkdirSync(dirname(output), { recursive: true });
      execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:x64', '/r:System.Web.Extensions.dll', '/r:System.Security.dll', `/out:${output}`, source], { windowsHide: true, stdio: 'inherit' });
      writeFileSync(stamp, digest);
    }
  }
}
