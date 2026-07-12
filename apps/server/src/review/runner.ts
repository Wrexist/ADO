/**
 * Review runner — runs `claude ultrareview` (cloud-hosted multi-agent review of the repo's
 * current branch) as an async, streamed run. Same trust model as the runner/installer: the
 * command is fixed (never client input), spawned with a minimal env allow-list (HOME lets the
 * `claude` CLI use its own login) in the repo's allow-listed cwd, with a hard timeout.
 */
import { randomUUID } from 'node:crypto';
import type { ReviewRun } from '@ado/shared';
import { spawnMerged, type MergedProc } from '../lib/spawnMerged';

const OUTPUT_CAP = 800;
const TIMEOUT_MS = 15 * 60 * 1000; // a cloud multi-agent review can take several minutes

export type ReviewSpawn = (cwd: string) => MergedProc;

const realSpawn: ReviewSpawn = (cwd) => spawnMerged('claude', ['ultrareview'], cwd);

export class ReviewRunner {
  private runs = new Map<string, ReviewRun>();

  constructor(
    private cwdFor: (repoId: string) => string | null,
    private log: (msg: string) => void = () => {},
    private spawnImpl: ReviewSpawn = realSpawn,
  ) {}

  /** Begin a review, or an error if the repo isn't dispatchable (not in the scanner allow-list). */
  start(repoId: string): { run: ReviewRun } | { error: string } {
    const cwd = this.cwdFor(repoId);
    if (!cwd) return { error: `repo '${repoId}' is not in the scanner allow-list — only scanned repos can be reviewed` };
    const run: ReviewRun = {
      runId: randomUUID(),
      repoId,
      status: 'running',
      command: 'claude ultrareview',
      output: [],
      code: null,
      startedTs: new Date().toISOString(),
      endedTs: null,
    };
    this.runs.set(run.runId, run);
    void this.execute(run, cwd);
    return { run };
  }

  private async execute(run: ReviewRun, cwd: string): Promise<void> {
    const append = (line: string) => {
      run.output.push(line);
      if (run.output.length > OUTPUT_CAP) run.output.splice(0, run.output.length - OUTPUT_CAP);
    };
    append(`$ ${run.command}  (in ${cwd})`);
    let proc: MergedProc;
    try {
      proc = this.spawnImpl(cwd);
    } catch (err) {
      run.status = 'failed';
      run.code = -1;
      run.endedTs = new Date().toISOString();
      append(`failed to start: ${(err as Error).message}`);
      return;
    }
    const timer = setTimeout(() => {
      append(`timed out after ${Math.round(TIMEOUT_MS / 60000)} min — killed`);
      proc.kill();
    }, TIMEOUT_MS);
    try {
      for await (const line of proc.lines) append(line);
    } catch {
      /* stream ended abruptly — exit code below is the source of truth */
    }
    const code = await proc.done;
    clearTimeout(timer);
    run.code = code;
    run.status = code === 0 ? 'done' : 'failed';
    run.endedTs = new Date().toISOString();
    this.log(`review ${run.repoId}: ${run.status} (exit ${code})`);
  }

  get(runId: string): ReviewRun | undefined {
    return this.runs.get(runId);
  }
}
