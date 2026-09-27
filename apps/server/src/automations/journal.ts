import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { automationDispatches } from '../db/schema';

/** Durable receipts, not instructions to repeat dispatch. */
export class AutomationJournal {
  constructor(private db: Db) {}
  pending(automationId?: string) {
    return this.db.select().from(automationDispatches).where(automationId === undefined
      ? isNull(automationDispatches.recordedTs)
      : and(eq(automationDispatches.automationId, automationId), isNull(automationDispatches.recordedTs))).all();
  }
  complete(runId: string, at: string) {
    this.db.update(automationDispatches).set({ recordedTs: at }).where(and(eq(automationDispatches.runId, runId), isNull(automationDispatches.recordedTs))).run();
  }
}
