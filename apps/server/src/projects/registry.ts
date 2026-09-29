import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { hostname } from 'node:os';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PortfolioProjectInput, PortfolioImport, type Repo } from '@ado/shared';
import type { Db } from '../db';
import { portfolioProjects as projects, portfolioRepositories as repositories, portfolioCheckouts as checkouts, portfolioSources as sources } from '../db/schema';
import type { GhRepo } from '../integrations/github/types';
import { isGitRepo } from '../scanner/git';
import { readGitLink } from './github';
import { commonGitIdentity, directoryIdentity as identity, pathKey } from './checkoutIdentity';

const exec = promisify(execFile);
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const remoteObservation = z.object({ externalId: z.string().min(1), name: z.string(), canonicalRemote: z.string(), defaultBranch: z.string().nullable(),
  defaultBranchSha: z.string().regex(SHA).nullable().optional(), defaultBranchCheckedTs: z.string().nullable().optional() });
type RemoteObservation = z.infer<typeof remoteObservation>;

/** Planning identities. Importing metadata never grants runner permission or changes Git. */
export class ProjectRegistry {
  readonly hostId = createHash('sha256').update(`${process.platform}:${hostname()}`).digest('hex');
  constructor(private db: Db, private observedRepos: () => Repo[], private cwdFor: (sourceId: string) => string | null) {}

  assertCheckout(id: string, sourceId?: string, cwd?: string) {
    const checkout = this.db.select().from(checkouts).where(eq(checkouts.id, id)).get();
    if (!checkout || checkout.hostId !== this.hostId) throw new Error('Checkout is not registered on this host');
    const allowed = this.cwdFor(checkout.sourceId);
    if (!allowed || (sourceId && sourceId !== checkout.sourceId)) throw new Error('Checkout scanner identity changed; import it again');
    const path = realpathSync(allowed);
    if (pathKey(path) !== checkout.canonicalPath || (cwd && pathKey(realpathSync(cwd)) !== pathKey(path)) || identity(path) !== checkout.pathIdentity || commonGitIdentity(path) !== checkout.gitIdentity) throw new Error('Checkout or Git directory identity changed; execution refused');
    return checkout;
  }

  observeGitHub(repos: GhRepo[], observedTs: string) {
    this.db.transaction(() => {
      for (const repo of repos) {
        if (!repo.externalId || !/^[\w.-]+$/.test(repo.owner) || !/^[\w.-]+$/.test(repo.name)) continue;
        const previous = this.remote(repo.externalId);
        const data: RemoteObservation = { externalId: repo.externalId, name: `${repo.owner}/${repo.name}`, canonicalRemote: `https://github.com/${repo.owner}/${repo.name}`, defaultBranch: repo.defaultBranch || null };
        // A verified head only survives while the default branch name is unchanged.
        if (previous?.defaultBranchSha && previous.defaultBranch === data.defaultBranch) Object.assign(data, { defaultBranchSha: previous.defaultBranchSha, defaultBranchCheckedTs: previous.defaultBranchCheckedTs ?? null });
        const row = { id: `github:${repo.externalId}`, kind: 'github', dataJson: JSON.stringify(data), observedTs };
        this.db.insert(sources).values(row).onConflictDoUpdate({ target: sources.id, set: row }).run();
        this.db.update(repositories).set({ name: data.name, canonicalRemote: data.canonicalRemote, defaultBranch: data.defaultBranch, observedTs })
          .where(and(eq(repositories.host, 'github'), eq(repositories.externalId, repo.externalId))).run();
      }
    });
  }

  private remote(externalId: string): RemoteObservation | null {
    const row = this.db.select().from(sources).where(eq(sources.id, `github:${externalId}`)).get();
    if (!row) return null;
    const parsed = remoteObservation.safeParse(JSON.parse(row.dataJson));
    return parsed.success ? parsed.data : null;
  }

  /** Record the default branch head GitHub reported; ignored if the branch name no longer matches exactly. */
  observeGitHubHead(externalId: string, branch: string, sha: string | null, checkedTs: string) {
    const row = this.db.select().from(sources).where(eq(sources.id, `github:${externalId}`)).get();
    const data = this.remote(externalId);
    if (!row || !data || data.defaultBranch !== branch) return;
    const next = { ...data, defaultBranchSha: sha && SHA.test(sha) ? sha : null, defaultBranchCheckedTs: checkedTs };
    this.db.update(sources).set({ dataJson: JSON.stringify(next) }).where(eq(sources.id, row.id)).run();
  }

  /**
   * T02: new task work starts from the verified head of the exact default branch, unless
   * the owner explicitly chose another commit. Local-only repositories have no API to
   * verify against; their base is the checkout's reviewed commit.
   */
  assertDefaultBase(checkoutId: string, baseSha: string, nonDefaultBase: boolean) {
    const checkout = this.db.select().from(checkouts).where(eq(checkouts.id, checkoutId)).get();
    const repository = checkout && this.db.select().from(repositories).where(eq(repositories.id, checkout.repositoryId)).get();
    if (!repository || repository.host !== 'github' || nonDefaultBase) return;
    const remote = this.remote(repository.externalId);
    const branch = remote?.defaultBranch ?? repository.defaultBranch;
    if (remote?.defaultBranchSha && baseSha === remote.defaultBranchSha) return;
    if (!branch || !remote?.defaultBranchSha) throw new Error(`The default branch of ${repository.name} has not been verified with GitHub yet. Connect GitHub and wait for a sync, or confirm that this run should start from the checkout's commit.`);
    throw new Error(`Base ${baseSha.slice(0, 12)} is not the head of the default branch '${branch}' (${remote.defaultBranchSha.slice(0, 12)}). Update the working copy to '${branch}', or confirm that this run should start from a different commit.`);
  }

  snapshot() {
    const remote = this.db.select().from(sources).all().map((row) => {
      if (row.kind !== 'github') throw new Error('Invalid registry observation');
      const data = remoteObservation.parse(JSON.parse(row.dataJson));
      return { id: row.id, kind: 'github' as const, name: data.name, location: data.canonicalRemote, observedTs: row.observedTs };
    });
    const local = this.observedRepos().filter((r) => r.localPath).map((r) => ({ id: `local:${r.id}`, kind: 'local' as const, name: r.name, location: r.localPath!, observedTs: r.scannedTs ?? null }));
    const withHead = (r: typeof repositories.$inferSelect) => {
      const remote = r.host === 'github' ? this.remote(r.externalId) : null;
      const current = remote && remote.defaultBranch === r.defaultBranch;
      return { ...r, defaultBranchSha: current ? remote.defaultBranchSha ?? null : null, defaultBranchCheckedTs: current ? remote.defaultBranchCheckedTs ?? null : null };
    };
    return { projects: this.db.select().from(projects).all(), repositories: this.db.select().from(repositories).all().map(withHead), checkouts: this.db.select().from(checkouts).all(), sources: [...local, ...remote] };
  }

  create(input: unknown) {
    const data = PortfolioProjectInput.parse(input);
    const now = new Date().toISOString();
    const row = { ...data, id: randomUUID(), nextTaskId: null, version: 1, createdTs: now, updatedTs: now };
    this.db.insert(projects).values(row).run();
    return row;
  }

  update(id: string, input: unknown) {
    const { version, ...data } = PortfolioProjectInput.extend({ version: z.number().int().positive() }).strict().parse(input);
    const changed = this.db.update(projects).set({ ...data, version: sql`${projects.version} + 1`, updatedTs: new Date().toISOString() })
      .where(and(eq(projects.id, id), eq(projects.version, version))).run();
    if (changed.changes !== 1) throw new Error('Project changed or is missing; reload before saving');
    return this.db.select().from(projects).where(eq(projects.id, id)).get()!;
  }

  async importSource(input: unknown) {
    const request = PortfolioImport.parse(input);
    if (!this.db.select().from(projects).where(eq(projects.id, request.projectId)).get()) throw new Error('Unknown project');
    if (request.sourceId.startsWith('github:')) {
      if (request.repositoryId) throw new Error('Remote identity cannot be reassigned to another repository');
      const source = this.db.select().from(sources).where(eq(sources.id, request.sourceId)).get();
      if (!source || source.kind !== 'github') throw new Error('Refresh GitHub observations before importing');
      const data = remoteObservation.parse(JSON.parse(source.dataJson));
      return this.db.transaction(() => {
        const existing = this.db.select().from(repositories).where(and(eq(repositories.host, 'github'), eq(repositories.externalId, data.externalId))).get();
        if (existing && existing.projectId !== request.projectId) throw new Error('Repository already belongs to another project; no data was moved');
        if (existing) return { repositoryId: existing.id, checkoutId: null };
        const id = randomUUID();
        this.db.insert(repositories).values({ ...data, id, projectId: request.projectId, host: 'github', observedTs: source.observedTs }).run();
        return { repositoryId: id, checkoutId: null };
      });
    }
    if (!request.sourceId.startsWith('local:')) throw new Error('Unknown source');
    const sourceId = request.sourceId.slice(6);
    const candidate = this.observedRepos().find((r) => r.id === sourceId && r.localPath);
    const allowed = this.cwdFor(sourceId);
    if (!candidate || !allowed) throw new Error('Only an observed scanner checkout can be imported');
    const path = realpathSync(allowed), pathIdentity = identity(path);
    if (pathKey(realpathSync(candidate.localPath!)) !== pathKey(path) || !await isGitRepo(path)) throw new Error('Scanner checkout changed; rescan before importing');
    const git = async (args: string[]) => (await exec('git', args, { cwd: path, windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024 })).stdout.replace(/\r?\n$/, '');
    const commonPath = realpathSync(resolve(path, await git(['rev-parse', '--git-common-dir'])));
    const gitIdentity = identity(commonPath);
    const head = await git(['rev-parse', '--verify', 'HEAD']).catch(() => null);
    const headSha = head && /^[a-f0-9]{40,64}$/.test(head) ? head : null;
    const link = await readGitLink(path);
    const canonicalRemote = link.github ? `https://github.com/${link.github.owner}/${link.github.repo}` : null;
    const currentCommon = realpathSync(resolve(path, await git(['rev-parse', '--git-common-dir'])));
    if (identity(path) !== pathIdentity || identity(commonPath) !== gitIdentity || identity(currentCommon) !== gitIdentity || pathKey(realpathSync(allowed)) !== pathKey(path)) throw new Error('Checkout identity changed during import');
    return this.db.transaction(() => {
      const existingPath = this.db.select().from(checkouts).where(and(eq(checkouts.hostId, this.hostId), eq(checkouts.canonicalPath, pathKey(path)))).get();
      if (existingPath && existingPath.pathIdentity !== pathIdentity) throw new Error('Checkout path now identifies a different directory; explicit recovery is required');
      const existing = this.db.select().from(checkouts).where(and(eq(checkouts.hostId, this.hostId), eq(checkouts.pathIdentity, pathIdentity))).get();
      const sibling = this.db.select().from(checkouts).where(and(eq(checkouts.hostId, this.hostId), eq(checkouts.gitIdentity, gitIdentity))).get();
      if (existing && existing.gitIdentity !== gitIdentity) throw new Error('Git identity changed in this checkout; explicit recovery is required');
      const repositoryId = existing?.repositoryId ?? sibling?.repositoryId ?? request.repositoryId;
      if (request.repositoryId && repositoryId !== request.repositoryId) throw new Error('Checkout already belongs to another repository');
      const repository = repositoryId ? this.db.select().from(repositories).where(eq(repositories.id, repositoryId)).get() : undefined;
      if (repositoryId && (!repository || repository.projectId !== request.projectId)) throw new Error('Repository belongs to another project or is missing');
      if (repository && !existing && !sibling) {
        if (repository.host !== 'github' || !canonicalRemote || canonicalRemote.toLowerCase() !== repository.canonicalRemote?.toLowerCase()) throw new Error('Explicit attachment requires the observed GitHub remote to match');
      }
      const observedTs = new Date().toISOString();
      const id = repositoryId ?? randomUUID();
      if (!repository) this.db.insert(repositories).values({ id, projectId: request.projectId, host: 'local', externalId: `${this.hostId}:${gitIdentity}`, name: candidate.name, canonicalRemote, defaultBranch: null, observedTs }).run();
      else if (repository.host === 'local') this.db.update(repositories).set({ name: candidate.name, canonicalRemote, observedTs }).where(eq(repositories.id, id)).run();
      const checkout = { id: existing?.id ?? randomUUID(), repositoryId: id, hostId: this.hostId, canonicalPath: pathKey(path), pathIdentity, gitIdentity, sourceId, managed: false, headSha, observedTs };
      this.db.insert(checkouts).values(checkout).onConflictDoUpdate({ target: checkouts.id, set: checkout }).run();
      return { repositoryId: id, checkoutId: checkout.id };
    });
  }
}
