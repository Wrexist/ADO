import { and, eq, or, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { UniverseSnapshot, UniverseResourceInput, UniverseRelationInput } from '@ado/shared';
import type { Db } from '../db';
import { portfolioProjects, planningInbox, planningMilestones, universeResources, universeRelations } from '../db/schema';

const deletion = z.object({ version: z.number().int().positive() }).strict();

/** Explicit planning annotations only; no import into execution policy or task dependencies. */
export class UniverseStore {
  constructor(private db: Db) {}
  snapshot(): UniverseSnapshot {
    return this.db.transaction(() => UniverseSnapshot.parse({
      generatedTs: new Date().toISOString(),
      nodes: [
        ...this.db.select().from(portfolioProjects).all().map(p => ({ key: `project:${p.id}`, kind: 'project', title: p.name, detail: p.goal, projectId: p.id, status: p.lifecycle, version: p.version, source: 'Project registry' })),
        ...this.db.select().from(planningInbox).all().map(i => ({ key: `idea:${i.id}`, kind: 'idea', title: i.text.slice(0, 200), detail: i.text, projectId: i.projectId, status: i.status, version: i.version, source: 'Planning Inbox' })),
        ...this.db.select().from(planningMilestones).all().map(m => ({ key: `milestone:${m.id}`, kind: 'milestone', title: m.title, detail: '', projectId: m.projectId, status: m.status, version: m.version, source: 'Planning milestones' })),
        ...this.db.select().from(universeResources).where(isNull(universeResources.deletedTs)).all().map(r => ({ key: `resource:${r.id}`, kind: 'resource', title: r.title, detail: r.reference, projectId: r.projectId, status: 'reference only', version: r.version, source: r.source })),
      ],
      relations: this.db.select().from(universeRelations).where(isNull(universeRelations.deletedTs)).all().map(r => ({ id: r.id, fromKey: r.fromKey, toKey: r.toKey, kind: r.kind, source: r.source, version: r.version, createdTs: r.createdTs })),
    }));
  }
  createResource(input: unknown) {
    const data = UniverseResourceInput.parse(input);
    return this.db.transaction(() => {
      if (data.projectId && !this.db.select().from(portfolioProjects).where(eq(portfolioProjects.id, data.projectId)).get()) throw new Error('Unknown project');
      const existing = this.db.select().from(universeResources).where(eq(universeResources.id, data.id)).get();
      if (existing) {
        if (existing.deletedTs) throw new Error('Resource request was removed; use a new identity for a new resource');
        if (existing.projectId !== data.projectId || existing.title !== data.title || existing.reference !== data.reference || existing.source !== data.source) throw new Error('Resource request identity was already used with different content');
        return existing;
      }
      const row = { ...data, version: 1, createdTs: new Date().toISOString() };
      this.db.insert(universeResources).values(row).run(); return row;
    });
  }
  createRelation(input: unknown) {
    const data = UniverseRelationInput.parse(input);
    if (data.fromKey === data.toKey) throw new Error('Choose two different records');
    if (['shares_resource', 'related_to'].includes(data.kind) && data.fromKey > data.toKey) [data.fromKey, data.toKey] = [data.toKey, data.fromKey];
    return this.db.transaction(() => {
      const keys = new Set(this.snapshot().nodes.map(n => n.key));
      if (!keys.has(data.fromKey) || !keys.has(data.toKey)) throw new Error('A relation endpoint is missing; reload Universe');
      const existing = this.db.select().from(universeRelations).where(eq(universeRelations.id, data.id)).get();
      if (existing) {
        if (existing.deletedTs) throw new Error('Relation request was removed; use a new identity for a new relation');
        if (existing.fromKey !== data.fromKey || existing.toKey !== data.toKey || existing.kind !== data.kind || existing.source !== data.source) throw new Error('Relation request identity was already used with different content');
        return existing;
      }
      if (this.db.select().from(universeRelations).where(and(eq(universeRelations.fromKey, data.fromKey), eq(universeRelations.toKey, data.toKey), eq(universeRelations.kind, data.kind), isNull(universeRelations.deletedTs))).get()) throw new Error('This relation already exists');
      const row = { ...data, version: 1, createdTs: new Date().toISOString() };
      this.db.insert(universeRelations).values(row).run(); return row;
    });
  }
  removeRelation(id: string, input: unknown) {
    const { version } = deletion.parse(input);
    const result = this.db.update(universeRelations).set({ deletedTs: new Date().toISOString(), version: version + 1 }).where(and(eq(universeRelations.id, id), eq(universeRelations.version, version), isNull(universeRelations.deletedTs))).run();
    if (result.changes !== 1) throw new Error('Relation changed or is missing; reload Universe');
    return { removed: true };
  }
  removeResource(id: string, input: unknown) {
    const { version } = deletion.parse(input);
    return this.db.transaction(() => {
      const key = `resource:${id}`;
      if (this.db.select().from(universeRelations).where(and(or(eq(universeRelations.fromKey, key), eq(universeRelations.toKey, key)), isNull(universeRelations.deletedTs))).get()) throw new Error('Remove this resource’s relations first');
      const result = this.db.update(universeResources).set({ deletedTs: new Date().toISOString(), version: version + 1 }).where(and(eq(universeResources.id, id), eq(universeResources.version, version), isNull(universeResources.deletedTs))).run();
      if (result.changes !== 1) throw new Error('Resource changed or is missing; reload Universe');
      return { removed: true };
    });
  }
}
