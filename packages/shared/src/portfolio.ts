import { z } from 'zod';

export const PortfolioProjectInput = z.object({
  name: z.string().trim().min(1).max(160), kind: z.string().trim().min(1).max(80), goal: z.string().max(8000),
  lifecycle: z.enum(['active', 'paused', 'maintenance', 'archived']), focus: z.boolean(), manualPriority: z.number().int().min(0).max(5),
}).strict();
export const PortfolioProject = PortfolioProjectInput.extend({ id: z.string().uuid(), nextTaskId: z.string().nullable(), version: z.number().int(), createdTs: z.string(), updatedTs: z.string() });
export type PortfolioProject = z.infer<typeof PortfolioProject>;
export const PortfolioRepository = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), host: z.enum(['local', 'github']), externalId: z.string(), name: z.string(), canonicalRemote: z.string().nullable(), defaultBranch: z.string().nullable(), observedTs: z.string() });
export const PortfolioCheckout = z.object({ id: z.string().uuid(), repositoryId: z.string().uuid(), hostId: z.string(), canonicalPath: z.string(), pathIdentity: z.string(), gitIdentity: z.string(), sourceId: z.string(), managed: z.boolean(), headSha: z.string().nullable(), observedTs: z.string() });
export const PortfolioSource = z.object({ id: z.string(), kind: z.enum(['local', 'github']), name: z.string(), location: z.string(), observedTs: z.string().nullable() });
export const PortfolioSnapshot = z.object({ projects: z.array(PortfolioProject), repositories: z.array(PortfolioRepository), checkouts: z.array(PortfolioCheckout), sources: z.array(PortfolioSource) });
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshot>;
export const PortfolioImport = z.object({ projectId: z.string().uuid(), sourceId: z.string().min(1).max(1000), repositoryId: z.string().uuid().optional() }).strict();
