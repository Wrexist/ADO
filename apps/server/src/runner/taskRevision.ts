import { and, eq } from 'drizzle-orm';
import { PlanningTask } from '@ado/shared';
import type { Db } from '../db';
import { planningRevisions } from '../db/schema';

export function taskRevision(db: Db, taskId: string, version: number) {
  const row = db.select().from(planningRevisions).where(and(eq(planningRevisions.entityId, taskId), eq(planningRevisions.kind, 'task'), eq(planningRevisions.version, version))).get();
  if (!row) throw new Error('Task revision not found');
  return PlanningTask.parse(JSON.parse(row.snapshotJson));
}
