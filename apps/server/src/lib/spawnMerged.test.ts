import { describe, expect, it } from 'vitest';
import { spawnMerged } from './spawnMerged';

async function drain(lines: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const l of lines) out.push(l);
  return out;
}

describe('spawnMerged', () => {
  it('terminates the line stream when the binary is missing (no hang) and reports failure', async () => {
    const p = spawnMerged('definitely-not-a-real-binary-xyz', ['--nope']);
    // If the merge only ended on stream "end" (not on error), this for-await would hang forever.
    const lines = await drain(p.lines);
    expect(await p.done).toBe(-1);
    expect(Array.isArray(lines)).toBe(true);
  });

  it('streams merged output and the real exit code for a present command', async () => {
    const p = spawnMerged('node', ['--version']); // node is always on PATH in the test runner
    const lines = await drain(p.lines);
    expect(await p.done).toBe(0);
    expect(lines.join('\n')).toMatch(/\d+\.\d+\.\d+/);
  });
});
