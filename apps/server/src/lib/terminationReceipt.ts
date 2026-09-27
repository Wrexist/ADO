import { createHmac, timingSafeEqual } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const Identity = z.object({
  version: z.literal(2), platform: z.literal('win32'), id: z.string().uuid(),
  jobName: z.string(), pid: z.number().int().positive(), creationTime: z.string().regex(/^\d+$/),
  receiptKey: z.string().regex(/^[a-f0-9]{64}$/),
});
const Receipt = z.object({
  version: z.literal(1), id: z.string().uuid(), jobName: z.string(), pid: z.number().int().positive(),
  creationTime: z.string(), activeProcesses: z.literal(0), exitCode: z.number().int(), recordedUtc: z.string().datetime({ offset: true }),
});

/** Only the configured profile directory is read. PID lookup/termination is never used.
 * The HMAC key stays in the server DB and private host channel, not agent env/argv.
 * Same-OS-user tampering with the server/DB remains inside the local trust boundary.
 */
export function readTerminationReceipt(root: string, encodedIdentity: string | null) {
  let fd: number | undefined;
  try {
    const identity = Identity.parse(JSON.parse(encodedIdentity ?? 'null'));
    if (identity.jobName !== `Local\\ControlOS.${identity.id}`) return null;
    const path = join(root, `${identity.id}.json`);
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > 8192n) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const actual = fstatSync(fd, { bigint: true });
    if (!actual.isFile() || actual.nlink !== 1n || actual.dev !== before.dev || actual.ino !== before.ino || actual.size > 8192n) return null;
    const data = Buffer.alloc(8193);
    let size = 0;
    while (size < data.length) { const count = readSync(fd, data, size, data.length - size, null); if (!count) break; size += count; }
    if (size > 8192) return null;
    const envelope = z.object({ payload: z.string(), mac: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(data.subarray(0, size).toString('utf8')));
    const expected = createHmac('sha256', Buffer.from(identity.receiptKey, 'hex')).update(envelope.payload, 'utf8').digest();
    if (!timingSafeEqual(expected, Buffer.from(envelope.mac, 'hex'))) return null;
    const receipt = Receipt.parse(JSON.parse(envelope.payload));
    if (receipt.id !== identity.id || receipt.jobName !== identity.jobName || receipt.pid !== identity.pid || receipt.creationTime !== identity.creationTime) return null;
    return receipt;
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}
