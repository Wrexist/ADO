import { eq } from 'drizzle-orm';
import { PortfolioSnapshot, type PlanningSnapshot } from '@ado/shared';
import type { Db } from '../db';
import { executionLocks, runs, verificationAttempts } from '../db/schema';

export interface TodayLockScope { runIds: Set<string>; repositoryIds: Set<string>; unknown: boolean }

/** Resolve recorded ownership only. This does not perform filesystem preflight. */
export function todayLockScope(db: Db, plan: PlanningSnapshot, portfolioInput: unknown): TodayLockScope {
  const portfolio = PortfolioSnapshot.parse(portfolioInput);
  const scope: TodayLockScope = { runIds: new Set(), repositoryIds: new Set(), unknown: false };
  for (const lock of db.select().from(executionLocks).all()) {
    scope.runIds.add(lock.runId);
    const matches = new Set<string>();
    const run = db.select().from(runs).where(eq(runs.id, lock.runId)).get();
    const binding = plan.executions.find((e) => e.runId === lock.runId);
    for (const checkout of portfolio.checkouts) {
      if (checkout.id === binding?.checkoutId || checkout.sourceId === run?.repoId || checkout.gitIdentity === run?.sourceGitIdentity || checkout.canonicalPath === lock.resource) matches.add(checkout.repositoryId);
    }
    for (const repository of portfolio.repositories) {
      if (repository.canonicalRemote?.startsWith('https://github.com/')) {
        const resource = `github:${repository.canonicalRemote.slice('https://github.com/'.length).toLowerCase()}`;
        if (resource === lock.resource.toLowerCase()) matches.add(repository.id);
      }
    }
    if (lock.owner.startsWith('verify:')) {
      const attempt = db.select().from(verificationAttempts).where(eq(verificationAttempts.id, lock.owner.slice(7))).get();
      if (!attempt || attempt.runId !== lock.runId) scope.unknown = true;
      else if (attempt.repositoryId && portfolio.repositories.some((r) => r.id === attempt.repositoryId)) matches.add(attempt.repositoryId);
    }
    if (!run || matches.size === 0) scope.unknown = true;
    for (const id of matches) scope.repositoryIds.add(id);
  }
  return scope;
}
