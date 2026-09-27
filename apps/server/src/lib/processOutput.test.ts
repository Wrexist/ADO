import { PassThrough } from 'node:stream';
import { expect, it } from 'vitest';
import { boundedDiagnostics, boundedLines } from './processOutput';

it('rejects unbroken oversized stdout and continues draining without retaining it', async () => {
  const stream = new PassThrough(); let stopped = 0;
  const lines = boundedLines(stream, () => stopped++, 32, 64);
  stream.write('a'.repeat(33)); stream.end('b'.repeat(100000));
  await expect(async () => { for await (const line of lines) void line; }).rejects.toThrow('frame exceeds');
  expect(stopped).toBe(1);
});

it('bounds queued lines for a stalled consumer and preserves UTF-8 for normal frames', async () => {
  const stream = new PassThrough();
  const lines = boundedLines(stream, () => {}, 32, 64);
  stream.end('x\n'.repeat(1100));
  await expect(async () => { for await (const line of lines) void line; }).rejects.toThrow('backlog exceeds');
  const normal = new PassThrough(); const accepted = boundedLines(normal, () => {});
  const bytes = Buffer.from('å🙂\r\nlast');
  for (const byte of bytes) normal.write(Buffer.from([byte]));
  normal.end();
  const found = []; for await (const line of accepted) found.push(line);
  expect(found).toEqual(['å🙂', 'last']);
});

it('redacts split credentials before retaining complete lines and flags discarded diagnostics', async () => {
  const stream = new PassThrough(); const text = boundedDiagnostics(stream, ['canary-private-value']);
  stream.write('canary-pri'); stream.write('vate-value\n');
  expect(text()).toBe('[redacted]');
  stream.write('oversized-canary-private-value' + 'x'.repeat(10000));
  stream.write('\n');
  for (let i = 0; i < 200; i++) stream.write('ordinary bounded diagnostic line\n');
  stream.end('final canary-private-value\n');
  await new Promise<void>((resolve) => stream.on('end', resolve));
  expect(text()).toContain('[diagnostics truncated: output was discarded]');
  expect(text()).toContain('final [redacted]');
  expect(text()).not.toContain('canary');
  expect(text().length).toBeLessThan(4000);
});
