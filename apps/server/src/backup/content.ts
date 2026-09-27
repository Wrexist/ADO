import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { workspaceEvidence, assertWorkspaceIdentity } from '../runner/workspace';
import type { RecoveryContentReport } from '@ado/shared';
import type { runs } from '../db/schema';

export async function compareRecoveredContent(run: typeof runs.$inferSelect): Promise<RecoveryContentReport> {
  const report: RecoveryContentReport = { runId: run.id, checkedAt: new Date().toISOString(), status: 'not_recorded', executionEnabled: false };
  if (!run.workspacePath || !run.workspaceGitIdentity || !run.baseSha || !run.headSha || !run.diffDigest) return report;
  try {
    const observed = await recoveryContentEvidence(run.workspacePath, run.baseSha, run.workspaceGitIdentity);
    report.status = observed.headSha === run.headSha && observed.diffDigest === run.diffDigest ? 'matches_recorded' : 'differs_from_recorded';
  } catch { report.status = 'unavailable'; }
  report.checkedAt = new Date().toISOString();
  return report;
}

const exec = promisify(execFile);
/** Repository commands/configuration never enter the temporary Git metadata view. */
export async function recoveryContentEvidence(cwd: string, baseSha: string, identity: string) {
  assertWorkspaceIdentity(cwd, identity);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  env.GIT_OPTIONAL_LOCKS = '0'; env.GIT_NO_LAZY_FETCH = '1';
  const query = async (args: string[]) => (await exec('git', ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', ...args], { cwd, env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 })).stdout.trim();
  // These metadata-only builtins do not inspect/convert working-tree content.
  const head = await query(['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(head) || !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(baseSha)) throw new Error('Invalid recorded Git revision');
  const gitDir = resolve(cwd, await query(['rev-parse', '--git-dir']));
  const common = resolve(cwd, await query(['rev-parse', '--git-common-dir']));
  if (/[\r\n"]/.test(common)) throw new Error('Unsupported Git objects path');
  const view = mkdtempSync(join(tmpdir(), 'controlos-recovery-git-'));
  try {
    mkdirSync(join(view, 'objects', 'info'), { recursive: true }); mkdirSync(join(view, 'refs'));
    writeFileSync(join(view, 'HEAD'), `${head}\n`);
    writeFileSync(join(view, 'objects', 'info', 'alternates'), `${join(common, 'objects').replace(/\\/g, '/')}\n`);
    let config = `[core]\nrepositoryformatversion = ${head.length === 64 ? 1 : 0}\nbare = false\nfsmonitor = false\n`;
    for (const [key, allowed] of Object.entries({ autocrlf: ['true', 'false', 'input'], eol: ['lf', 'crlf', 'native'], filemode: ['true', 'false'], symlinks: ['true', 'false'], ignorecase: ['true', 'false'] })) {
      try { const value = await query(['config', '--get', `core.${key}`]); if (!allowed.includes(value)) throw new Error('Unsupported Git content setting'); config += `${key} = ${value}\n`; }
      catch (error) { if ((error as { code?: number }).code !== 1) throw error; }
    }
    if (head.length === 64) config += '[extensions]\nobjectformat = sha256\n';
    writeFileSync(join(view, 'config'), config);
    for (const name of ['index', ...readdirSync(common).filter((name) => /^sharedindex\.[a-f0-9]+$/.test(name))]) {
      const from = join(name === 'index' ? gitDir : common, name);
      if (!existsSync(from)) continue;
      const stat = lstatSync(from); if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Unsupported Git index');
      copyFileSync(from, join(view, name));
    }
    const isolatedEnv = { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
    const stages = (await exec('git', ['--git-dir', view, '--work-tree', cwd, 'ls-files', '--stage'], { cwd, env: isolatedEnv, windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 })).stdout;
    if (/^160000 /m.test(stages)) throw new Error('Submodule content needs separate recovery review');
    const result = await workspaceEvidence(cwd, baseSha, identity, view);
    if (await query(['rev-parse', '--verify', 'HEAD']) !== head) throw new Error('Workspace changed during recovery review');
    assertWorkspaceIdentity(cwd, identity);
    return result;
  } finally { rmSync(view, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}
