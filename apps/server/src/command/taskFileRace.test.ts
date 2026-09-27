import { afterEach, expect, it, vi } from 'vitest';
const race = vi.hoisted(() => ({ swap: undefined as (() => void) | undefined }));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, openSync: (...args: Parameters<typeof fs.openSync>) => {
    race.swap?.(); race.swap = undefined; return fs.openSync(...args);
  } };
});
import { linkSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTask } from './taskFile';
let root = '';
afterEach(() => { race.swap = undefined; if (root) rmSync(root, { recursive: true, force: true }); });
it('rejects an inode replacement between checking and opening without modifying the replacement', () => {
  root = mkdtempSync(join(tmpdir(), 'ado-task-race-')); const task = join(root, 'TASK.md');
  writeFileSync(task, 'original');
  race.swap = () => { renameSync(task, join(root, 'saved')); writeFileSync(task, 'replacement'); };
  expect(() => appendTask(root, 'bad')).toThrow(/changed/);
  expect(readFileSync(task, 'utf8')).toBe('replacement');
});
it('rejects a hard-link replacement between checking and opening', () => {
  root = mkdtempSync(join(tmpdir(), 'ado-task-race-')); const task = join(root, 'TASK.md'); const outside = join(root, 'outside');
  writeFileSync(task, 'original'); writeFileSync(outside, 'unchanged');
  race.swap = () => { rmSync(task); linkSync(outside, task); };
  expect(() => appendTask(root, 'bad')).toThrow(/changed/);
  expect(readFileSync(outside, 'utf8')).toBe('unchanged');
});
