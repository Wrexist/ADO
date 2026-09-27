import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { AutomationStore } from './store';
import { AutomationEngine } from './engine';

const fault = vi.hoisted(() => ({ denyRename: false }));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (fault.denyRename) throw Object.assign(new Error('injected rename denial'), { code: 'EPERM' });
    return fs.renameSync(...args);
  } };
});
const input = { repoId: 'fixture', name: 'Original', task: 'fixture task', enabled: true, trigger: { on: 'event' as const, event: 'build.failed' as const } };

it('preserves committed memory, file bytes and reopen state after failed create/update/remove/history writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-persist-')), file = join(root, 'automations.json');
  try {
    const store = new AutomationStore(file), initial = store.upsert(input), bytes = readFileSync(file);
    fault.denyRename = true;
    for (const save of [
      () => store.upsert({ ...input, name: 'Uncommitted create' }),
      () => store.upsert({ ...input, id: initial.id, enabled: false }),
      () => store.remove(initial.id),
      () => store.markRun(initial.id, 'uncommitted-run', '2026-09-27T00:00:00Z'),
    ]) {
      expect(save).toThrow('injected rename denial');
      expect(store.list()).toEqual([initial]);
      expect(store.get(initial.id)).toEqual(initial);
      expect(readFileSync(file)).toEqual(bytes);
      expect(new AutomationStore(file).list()).toEqual([initial]);
      expect(readdirSync(root)).toEqual(['automations.json']);
    }
    fault.denyRename = false;
    store.upsert({ ...input, id: initial.id, enabled: false });
    expect(new AutomationStore(file).get(initial.id)?.enabled).toBe(false);
  } finally { fault.denyRename = false; rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('reports the already dispatched run and blocks further session dispatch after history persistence fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-recording-'));
  try {
    const store = new AutomationStore(join(root, 'automations.json')), first = store.upsert(input);
    const second = store.upsert({ ...input, name: 'Other automation', trigger: { on: 'schedule', every: 'day' } });
    const dispatch = vi.fn(() => ({ runId: 'created-run-1' })), messages: string[] = [];
    let now = 1_000;
    const engine = new AutomationEngine(store, dispatch, message => messages.push(message), () => now);
    fault.denyRename = true;
    engine.onBuildEvent('fixture', 'build.failed');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(messages.join('\n')).toContain('dispatched run created-run-1');
    expect(messages.join('\n')).not.toContain('skipped');
    expect(store.get(first.id)?.lastRunId).toBeNull();
    fault.denyRename = false; now += 48 * 60 * 60 * 1_000;
    engine.onBuildEvent('fixture', 'build.failed'); engine.tickScheduled();
    expect(() => engine.runNow(second.id)).toThrow('created-run-1');
    expect(dispatch).toHaveBeenCalledTimes(1);
  } finally { fault.denyRename = false; rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it.skipIf(process.platform !== 'win32')('preserves automation state when Windows denies replacing an open file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-denied-')), file = join(root, 'automations.json');
  const store = new AutomationStore(file), initial = store.upsert(input), bytes = readFileSync(file);
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$stream = [System.IO.File]::Open($env:CONTROL_OS_FIXTURE_FILE, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); try { [Console]::WriteLine("locked"); [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }'], { env: { ...process.env, CONTROL_OS_FIXTURE_FILE: file }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  try {
    const [chunk] = await once(child.stdout!, 'data'); expect(String(chunk)).toContain('locked');
    expect(() => store.upsert({ ...input, id: initial.id, enabled: false })).toThrow();
    expect(() => store.remove(initial.id)).toThrow();
    expect(store.list()).toEqual([initial]); expect(readFileSync(file)).toEqual(bytes);
    expect(new AutomationStore(file).list()).toEqual([initial]);
    child.stdin!.end('\n'); await exited;
    expect(store.remove(initial.id)).toBe(true); expect(new AutomationStore(file).list()).toEqual([]);
  } finally {
    if (child.exitCode === null) { child.kill(); await exited; }
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
