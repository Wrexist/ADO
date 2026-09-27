import { closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

export const connectionRecovery = 'Connection store is unreadable, invalid or changed outside this instance. Original file preserved. Close ControlOS, unlock the original file or restore a verified backup into a new profile, then reopen.';

/** Optimistic preservation guard, not an OS sandbox or a multi-process transaction. */
export class ConnectionFile {
  private version: string | null = null;
  constructor(private path: string) {}

  private snapshot() {
    let fd: number | undefined;
    try {
      let before;
      try { before = lstatSync(this.path, { bigint: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      if (!before.isFile() || before.nlink !== 1n || before.size > 8n * 1024n * 1024n) throw new Error('Invalid connection file');
      fd = openSync(this.path, 'r');
      const identity = (stat: typeof before) => `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
      const opened = fstatSync(fd, { bigint: true });
      if (identity(opened) !== identity(before)) throw new Error('Connection file changed');
      const raw = readFileSync(fd, 'utf8');
      const after = lstatSync(this.path, { bigint: true });
      if (!after.isFile() || after.nlink !== 1n || identity(after) !== identity(before) || after.mtimeNs !== before.mtimeNs || after.size !== before.size) throw new Error('Connection file changed');
      return { raw, version: `${identity(after)}:${createHash('sha256').update(raw).digest('hex')}` };
    } catch { throw new Error(connectionRecovery); }
    finally { if (fd !== undefined) closeSync(fd); }
  }

  read(): Record<string, unknown> {
    const snapshot = this.snapshot();
    this.version = snapshot?.version ?? null;
    if (!snapshot) return {};
    try {
      const value: unknown = JSON.parse(snapshot.raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid object');
      return value as Record<string, unknown>;
    } catch { throw new Error(connectionRecovery); }
  }

  write(value: unknown) {
    const unchanged = () => { if ((this.snapshot()?.version ?? null) !== this.version) throw new Error(connectionRecovery); };
    unchanged();
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`, raw = JSON.stringify(value, null, 2);
    let fd: number | undefined;
    try {
      fd = openSync(temp, 'wx', 0o600); writeFileSync(fd, raw); fsyncSync(fd); closeSync(fd); fd = undefined;
      unchanged();
      renameSync(temp, this.path);
      const stored = this.snapshot();
      if (stored?.raw !== raw) throw new Error(connectionRecovery);
      this.version = stored.version;
    } finally { if (fd !== undefined) closeSync(fd); rmSync(temp, { force: true }); }
  }
}
