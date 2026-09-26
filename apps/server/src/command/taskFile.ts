import { closeSync, constants, fstatSync, lstatSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Repository contents are untrusted; configured parent directories are owner-controlled.
 * Open without truncation, validate the descriptor, and write only through that descriptor.
 * This also works on Windows, where O_NOFOLLOW is not available.
 */
export function appendTask(cwd: string, task: string): void {
  const path = join(cwd, 'TASK.md');
  let expected;
  try { expected = lstatSync(path, { bigint: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (expected && (!expected.isFile() || expected.nlink !== 1n)) {
    throw new Error('TASK.md must be a regular file with no symbolic or hard links');
  }
  const flags = constants.O_WRONLY | constants.O_APPEND | (constants.O_NONBLOCK ?? 0) |
    (expected ? (constants.O_NOFOLLOW ?? 0) : constants.O_CREAT | constants.O_EXCL);
  const fd = openSync(path, flags, 0o600);
  try {
    const actual = fstatSync(fd, { bigint: true });
    if (!actual.isFile() || actual.nlink !== 1n || (expected &&
      (expected.dev !== actual.dev || expected.ino !== actual.ino))) {
      throw new Error('TASK.md changed while opening it; no task was written');
    }
    writeFileSync(fd, `\n- [ ] ${task}\n`);
  } finally { closeSync(fd); }
}
