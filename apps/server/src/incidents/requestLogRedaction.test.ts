import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('masks a stored connector credential in actual request logs, including encoded URL values', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-request-redaction-'));
  const secret = 'CANARY-request/private value?&tail';
  const moduleUrl = (path: string) => JSON.stringify(new URL(path, import.meta.url).href);
  const code = `
    import { buildServer } from ${moduleUrl('../app.ts')};
    import { ConnectionsStore } from ${moduleUrl('../connections/store.ts')};
    const secret = ${JSON.stringify(secret)};
    const store = new ConnectionsStore(${JSON.stringify(join(root, 'connections.json'))});
    store.set('slack', secret);
    const server = await buildServer({port:8787,webOrigin:'http://localhost:5173',accToken:'fixture-access-key',dbPath:${JSON.stringify(join(root, 'profile.sqlite'))},demo:false,projectDirs:[]},{startSystem:false,startScanner:false});
    try {
      const response = await server.app.inject({url:'/health?debug='+encodeURIComponent(secret),headers:{host:'127.0.0.1:8787'}});
      if(response.statusCode!==200) throw Error('fixture request failed');
    } finally { await server.close(); }
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { windowsHide: true, timeout: 30000, encoding: 'utf8' });
  expect(child.error, child.stderr).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
  const exposed = child.stdout + child.stderr;
  expect(exposed).toContain('request completed'); expect(exposed).toContain('debug=[redacted]');
  expect(exposed).not.toContain('CANARY');
}, 35000);
