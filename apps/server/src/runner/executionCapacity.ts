import { count } from 'drizzle-orm';
import type { Db } from '../db';
import { executionLocks } from '../db/schema';

/** Profile-wide ownership: agents, verification and unresolved old owners count. */
export function executionCapacityAvailable(db: Db): boolean {
  return db.select({ total: count() }).from(executionLocks).get()!.total < 2;
}

export const executionCapacityReason = 'Waiting for execution capacity: active or quarantined writers occupy the profile limit (2).';
