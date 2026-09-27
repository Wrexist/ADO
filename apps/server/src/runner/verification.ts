import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { runs, verificationEvidence } from '../db/schema';
import { workspaceEvidence } from './workspace';
import { spawnMerged } from '../lib/spawnMerged';
import { redact } from '../lib/redact';

/** Verification is explicit: executes the repository's own npm verify script in trusted-local mode. */
export class Verifier {
  private active = new Set<string>();
  constructor(private db: Db, private secrets: () => Array<string | undefined>) {}
  async verify(id: string) {
    if (this.active.has(id)) throw new Error('Verification already running');
    this.active.add(id);
    try {
      const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
      if (!run || run.status !== 'done' || !run.workspacePath || !run.baseSha || !run.headSha || !run.diffDigest) throw new Error('A completed isolated run with captured evidence is required');
      const before = await workspaceEvidence(run.workspacePath, run.baseSha);
      if (before.headSha !== run.headSha || before.diffDigest !== run.diffDigest) throw new Error('Working copy changed since the run; start a new attempt');
      const pkg = JSON.parse(readFileSync(join(run.workspacePath, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> };
      if (typeof pkg.scripts?.verify !== 'string') throw new Error('Repository must define an explicit npm verify script');
      const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
      const npm = candidates.find((p): p is string => Boolean(p && p.endsWith('npm-cli.js') && existsSync(p)));
      if (!npm) throw new Error('npm CLI unavailable on this host');
      this.db.update(runs).set({ verifyVerdict: null, humanAction: null }).where(eq(runs.id, id)).run();
      const proc = spawnMerged(process.execPath, [npm, 'run', 'verify'], run.workspacePath);
      let output = '';
      const collect = async () => { for await (const line of proc.lines) output = (output + redact(line, this.secrets()) + '\n').slice(-16000); };
      let exitCode: number;
      try { [exitCode] = await Promise.all([proc.done, collect()]); }
      catch (error) { proc.kill(); await proc.done; throw error; }
      const after = await workspaceEvidence(run.workspacePath, run.baseSha);
      const unchanged = after.headSha === before.headSha && after.diffDigest === before.diffDigest;
      const verdict = exitCode === 0 && unchanged ? 'pass' : 'fail';
      const evidence = { id: randomUUID(), runId: id, ...before, command: 'npm run verify', exitCode, verdict, output: output + (unchanged ? '' : '\nResult changed during verification; evidence invalid.'), recordedTs: new Date().toISOString() };
      this.db.transaction((tx) => {
        tx.insert(verificationEvidence).values(evidence).run();
        tx.update(runs).set({ verifyVerdict: verdict }).where(eq(runs.id, id)).run();
      });
      return evidence;
    } finally { this.active.delete(id); }
  }
}
