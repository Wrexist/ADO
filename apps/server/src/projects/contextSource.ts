import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { ContextPreviewRequest } from '@ado/shared';
import type { ContextSourcePreview } from '@ado/shared';
import { commonGitIdentity } from './checkoutIdentity';

const exec = promisify(execFile);
const FILE_BYTES = 16_384, TOTAL_BYTES = 65_536;
const excluded = /^(?:\.git|node_modules|\.cache|\.next|dist|build|coverage|\.env.*|\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|.*(?:secret|credential).*|.*\.(?:pem|key|p12|pfx))$/i;
const textExtension = /\.(?:md|txt|ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml|py|rs|go|swift|kt|kts|java|cs|cpp|c|h|hpp|css|scss|html|sql|sh|ps1|dart|xml)$/i;
const containsControl = (value: string, allowWhitespace = false) => Array.from(value).some(char => {
  const code = char.codePointAt(0)!;
  return code === 127 || (code < 32 && !(allowWhitespace && [9, 10, 13].includes(code)));
});
function removeTemporaryView(tempRoot: string, view: string) {
  const within = relative(tempRoot, resolve(view));
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Unsafe context temporary-directory cleanup refused');
  rmSync(view, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** Explicit committed blobs only. No working-tree reads, text conversion, filters or repository scripts. */
export async function previewContextSources(cwd: string, identity: string, request: ContextPreviewRequest, secrets: Array<string | undefined> | (() => Array<string | undefined>)) {
  ContextPreviewRequest.parse(request);
  const containsSecret = (value: string) => (typeof secrets === 'function' ? secrets() : secrets).some(secret => secret && value.includes(secret));
  for (const file of request.files) {
    const parts = file.path.split('/');
    if (containsControl(file.path) || /[\\:]/.test(file.path) || parts.some(p => !p || p === '.' || p === '..' || excluded.test(p)) || !textExtension.test(file.path)) throw new Error('Context file path is outside the allowed text-source selection');
    if (containsSecret(file.path)) throw new Error('Context source contains a configured secret; selection refused');
  }
  const assertIdentity = () => { if (commonGitIdentity(cwd) !== identity) throw new Error('Context repository identity changed; review required'); };
  assertIdentity();
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_LITERAL_PATHSPECS: '1' };
  const metadata = async (args: string[]) => (await exec('git', ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', ...args], { cwd, env, windowsHide: true, timeout: 15000, maxBuffer: 4096 })).stdout.replace(/\r?\n$/, '');
  if (await metadata(['rev-parse', '--verify', 'HEAD']) !== request.baseSha) throw new Error('Context base revision changed; review required');
  const common = resolve(cwd, await metadata(['rev-parse', '--git-common-dir']));
  if (/[\r\n"]/.test(common)) throw new Error('Unsupported context object-store path');
  const tempRoot = realpathSync(tmpdir()), view = mkdtempSync(join(tempRoot, 'controlos-context-git-'));
  try {
    mkdirSync(join(view, 'objects', 'info'), { recursive: true }); mkdirSync(join(view, 'refs'));
    writeFileSync(join(view, 'HEAD'), `${request.baseSha}\n`);
    writeFileSync(join(view, 'objects', 'info', 'alternates'), `${join(common, 'objects').replace(/\\/g, '/')}\n`);
    writeFileSync(join(view, 'config'), `[core]\nrepositoryformatversion = ${request.baseSha.length === 64 ? 1 : 0}\nbare = true\n${request.baseSha.length === 64 ? '[extensions]\nobjectformat = sha256\n' : ''}`);
    const git = async (args: string[], maxBuffer = FILE_BYTES + 1) => (await exec('git', ['--git-dir', view, '-c', 'protocol.allow=never', ...args], { cwd: view, env, encoding: 'buffer', windowsHide: true, timeout: 15000, maxBuffer })).stdout;
    const files: ContextSourcePreview['files'] = [];
    let totalBytes = 0;
    for (const selected of request.files) {
      const listing = new TextDecoder('utf-8', { fatal: true }).decode(await git(['ls-tree', '--full-tree', '-z', request.baseSha, '--', selected.path], 4096));
      const match = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t([^\0]+)\0$/.exec(listing);
      if (!match || match[3] !== selected.path) throw new Error('Context selection must name an existing committed regular file');
      const blobId = match[2], size = Number((await git(['cat-file', '-s', blobId], 128)).toString('ascii').trim());
      if (!Number.isSafeInteger(size) || size < 0 || size > FILE_BYTES || totalBytes + size > TOTAL_BYTES) throw new Error('Context source byte budget exceeded');
      const bytes = await git(['cat-file', 'blob', blobId]);
      if (bytes.length !== size || bytes.includes(0)) throw new Error('Context source is not supported text');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw new Error('Context source is not valid UTF-8 text'); }
      if (containsControl(text, true)) throw new Error('Context source contains unsupported control bytes');
      if (containsSecret(text)) throw new Error('Context source contains a configured secret; selection refused');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      files.push({ path: selected.path, blobId, sha256, bytes: size, text, comparison: !selected.expectedSha256 ? 'not_supplied' : sha256 === selected.expectedSha256 ? 'matches_supplied_hash' : 'differs_from_supplied_hash' });
      totalBytes += size;
    }
    if (await metadata(['rev-parse', '--verify', 'HEAD']) !== request.baseSha) throw new Error('Context base revision changed during inspection; review required');
    assertIdentity();
    if (files.some(file => containsSecret(file.path) || containsSecret(file.text))) throw new Error('Context source contains a configured secret; selection refused');
    return { files, totalBytes, maxBytes: TOTAL_BYTES, status: files.some(f => f.comparison === 'differs_from_supplied_hash') ? 'review_required' as const : 'unreviewed' as const };
  } finally {
    // Delete only the temporary metadata directory created by this invocation.
    removeTemporaryView(tempRoot, view);
  }
}
