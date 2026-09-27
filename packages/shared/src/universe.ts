import { z } from 'zod';

export const UniverseKind = z.enum(['project', 'idea', 'milestone', 'resource']);
export const UniverseKey = z.string().regex(/^(project|idea|milestone|resource):[a-f0-9-]{36}$/);
export const UniverseResourceInput = z.object({ id: z.string().uuid(), projectId: z.string().uuid().nullable(), title: z.string().trim().min(1).max(200), reference: z.string().trim().min(1).max(2000), source: z.string().trim().min(1).max(2000) }).strict();
export const UniverseRelationInput = z.object({ id: z.string().uuid(), fromKey: UniverseKey, toKey: UniverseKey, kind: z.enum(['belongs_to', 'depends_on', 'shares_resource', 'related_to']), source: z.string().trim().min(1).max(2000) }).strict();
export const UniverseRelation = UniverseRelationInput.extend({ version: z.number().int().positive(), createdTs: z.string() });
export const UniverseNode = z.object({ key: UniverseKey, kind: UniverseKind, title: z.string(), detail: z.string(), projectId: z.string().uuid().nullable(), status: z.string(), version: z.number().int().positive(), source: z.string() });
export const UniverseSnapshot = z.object({ generatedTs: z.string(), nodes: z.array(UniverseNode), relations: z.array(UniverseRelation) });
export type UniverseSnapshot = z.infer<typeof UniverseSnapshot>;
export type UniverseNode = z.infer<typeof UniverseNode>;
export type UniverseRelation = z.infer<typeof UniverseRelation>;
