import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { spawnOwned } from './ownedProcess';
import { commandFor } from './processControl';
import { ProcessNotStartedError } from './processLaunch';

describe.skipIf(process.platform !== 'win32')('definitive launch preflight refusals', () => {
  it('classifies only configuration and receipt setup checks before native process creation', () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-launch-preflight-'));
    const savedHost = process.env.ACC_PROCESS_HOST;
    try {
      expect(() => spawnOwned('relative.exe', [], root)).toThrow(ProcessNotStartedError);
      process.env.ACC_PROCESS_HOST = 'relative-host.exe';
      expect(() => spawnOwned(process.execPath, [], root)).toThrow(ProcessNotStartedError);
      if (savedHost === undefined) delete process.env.ACC_PROCESS_HOST; else process.env.ACC_PROCESS_HOST = savedHost;
      const receiptFile = join(root, 'not-a-directory'); writeFileSync(receiptFile, 'preserve');
      expect(() => spawnOwned(process.execPath, [], root, undefined, receiptFile)).toThrow(ProcessNotStartedError);
    } finally {
      if (savedHost === undefined) delete process.env.ACC_PROCESS_HOST; else process.env.ACC_PROCESS_HOST = savedHost;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies missing provider executable resolution without attempting spawn', () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-no-provider-'));
    const emptyPath = join(root, 'empty'); mkdirSync(emptyPath);
    const key = Object.keys(process.env).find((name) => name.toLowerCase() === 'path') ?? 'PATH', previous = process.env[key];
    try {
      process.env[key] = emptyPath;
      expect(() => commandFor('claude', [])).toThrow(ProcessNotStartedError);
      expect(() => commandFor('codex', [])).toThrow(ProcessNotStartedError);
    } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; rmSync(root, { recursive: true, force: true }); }
  });
});
