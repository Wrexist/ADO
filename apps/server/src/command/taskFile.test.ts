import { afterEach, describe, expect, it } from 'vitest';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendTask } from './taskFile';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ado-task-file-')); roots.push(root);
  const repo = join(root, 'repo'); mkdirSync(repo);
  const outside = join(root, 'outside.md'); writeFileSync(outside, 'unchanged');
  return { repo, outside, target: join(repo, 'TASK.md') };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('task file write boundary', () => {
  it('creates an absent file and appends to an ordinary existing file', () => {
    const { repo, target } = fixture(); appendTask(repo, 'one'); appendTask(repo, 'two');
    expect(readFileSync(target, 'utf8')).toBe('\n- [ ] one\n\n- [ ] two\n');
  });
  it('rejects hard links without changing the external inode', () => {
    const { repo, target, outside } = fixture(); linkSync(outside, target);
    expect(() => appendTask(repo, 'bad')).toThrow(/regular file/);
    expect(readFileSync(outside, 'utf8')).toBe('unchanged');
  });
  it('rejects directory targets', () => {
    const { repo, target } = fixture(); mkdirSync(target);
    expect(() => appendTask(repo, 'bad')).toThrow(/regular file/);
  });
  it('rejects file and dangling symlinks without writing their targets', ({ skip }) => {
    const { repo, target, outside } = fixture();
    try { symlinkSync(outside, target, 'file'); }
    catch (error) {
      if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { skip(); return; }
      throw error;
    }
    expect(() => appendTask(repo, 'bad')).toThrow(/regular file/);
    expect(readFileSync(outside, 'utf8')).toBe('unchanged');
    rmSync(outside);
    expect(() => appendTask(repo, 'bad')).toThrow(/regular file/);
  });
});
