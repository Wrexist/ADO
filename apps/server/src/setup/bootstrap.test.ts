import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { expect, it } from 'vitest';

it('bootstraps the shipped commented template and preserves an existing secret without building it into browser assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'ado-bootstrap-'));
  try {
    writeFileSync(join(root, '.env.example'), readFileSync(resolve('.env.example')));
    const run = () => execFileSync(process.execPath, [resolve('scripts/bootstrap-env.mjs')], { env: { ...process.env, ACC_ENV_DIR: root } });
    run(); const first = parseEnv(readFileSync(join(root, '.env'), 'utf8'));
    expect(first.ACC_TOKEN).toMatch(/^[a-f0-9]{48}$/); expect(first.VITE_ACC_TOKEN).toBeUndefined();
    run(); expect(parseEnv(readFileSync(join(root, '.env'), 'utf8')).ACC_TOKEN).toBe(first.ACC_TOKEN);
    writeFileSync(join(root, '.env'), 'ACC_TOKEN="existing#secret"\nVITE_ACC_TOKEN=legacy\nPORT=9999\n');
    run(); const migrated = parseEnv(readFileSync(join(root, '.env'), 'utf8'));
    expect(migrated.ACC_TOKEN).toBe('existing#secret'); expect(migrated.PORT).toBe('9999'); expect(migrated.VITE_ACC_TOKEN).toBeUndefined();
    for (const assignment of ["ACC_TOKEN='abc\\def'\n", "ACC_TOKEN='abc\"def'\n", "export ACC_TOKEN = 'value$&'\n"]) {
      writeFileSync(join(root, '.env'), assignment); run(); run();
      expect(readFileSync(join(root, '.env'), 'utf8')).toBe(assignment);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
