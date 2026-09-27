import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { linkSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { readTerminationReceipt } from './terminationReceipt';

it('accepts only bounded, single-file, authenticated receipts for the exact process identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-receipt-'));
  const id = randomUUID();
  const identity = { version: 2, platform: 'win32', id, jobName: `Local\\ControlOS.${id}`, pid: 123, creationTime: '134000000000000000', receiptKey: randomBytes(32).toString('hex') };
  const record = { version: 1, id, jobName: identity.jobName, pid: identity.pid, creationTime: identity.creationTime, activeProcesses: 0, exitCode: -1, recordedUtc: new Date().toISOString() };
  const path = join(root, `${id}.json`);
  const write = (value: unknown) => {
    const payload = JSON.stringify(value);
    writeFileSync(path, JSON.stringify({ payload, mac: createHmac('sha256', Buffer.from(identity.receiptKey, 'hex')).update(payload).digest('hex') }));
  };
  const encoded = JSON.stringify(identity);
  try {
    expect(readTerminationReceipt(root, encoded)).toBeNull();
    write(record);
    expect(readTerminationReceipt(root, encoded)).toEqual(record);
    expect(readTerminationReceipt(root, JSON.stringify({ ...identity, receiptKey: randomBytes(32).toString('hex') }))).toBeNull();
    for (const patch of [{ pid: 124 }, { creationTime: '1' }, { activeProcesses: 1 }, { id: randomUUID() }, { jobName: 'other-job' }]) {
      write({ ...record, ...patch });
      expect(readTerminationReceipt(root, encoded)).toBeNull();
    }
    writeFileSync(path, '{bad json'); expect(readTerminationReceipt(root, encoded)).toBeNull();
    writeFileSync(path, 'x'.repeat(8193)); expect(readTerminationReceipt(root, encoded)).toBeNull();
    write(record);
    linkSync(path, join(root, 'hardlink'));
    expect(readTerminationReceipt(root, encoded)).toBeNull();
    expect(readTerminationReceipt(root, JSON.stringify({ ...identity, id: '../outside' }))).toBeNull();
    expect(readTerminationReceipt(root, JSON.stringify({ ...identity, version: 1 }))).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
