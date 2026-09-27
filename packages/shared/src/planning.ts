import { z } from 'zod';

export const Criterion = z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(2000), required: z.boolean() }).strict();
const criteria = z.array(Criterion).max(100).refine((values) => new Set(values.map((v) => v.id)).size === values.length, 'Criterion IDs must be unique');
export const TaskStatus = z.enum(['draft', 'ready', 'queued', 'active', 'awaiting_review', 'accepted', 'blocked', 'archived']);
export const PlanningStatus = z.enum(['draft', 'ready', 'blocked', 'archived']);
export const TaskInput = z.object({
  projectId: z.string().uuid(), repositoryId: z.string().uuid().nullable(), milestoneId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200), outcome: z.string().max(16000), scope: z.string().max(16000), outOfScope: z.string().max(16000),
  acceptance: criteria, dependsOn: z.array(z.string().uuid()).max(200).refine((ids) => new Set(ids).size === ids.length, 'Dependencies must be unique'),
  priority: z.number().int().min(0).max(5), status: PlanningStatus,
  sourceRefs: z.array(z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/issues\/[1-9][0-9]*$/, 'Use a GitHub issue URL')).max(50),
}).strict();
export const PlanningTask = TaskInput.extend({ status: TaskStatus, id: z.string().uuid(), version: z.number().int().positive(), createdTs: z.string(), updatedTs: z.string(), blockedBy: z.array(z.string().uuid()) });
export type PlanningTask = z.infer<typeof PlanningTask>;
export const MilestoneInput = z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(200), exitCriteria: criteria, status: z.enum(['planned', 'active', 'archived']) }).strict();
export const PlanningMilestone = MilestoneInput.extend({ id: z.string().uuid(), version: z.number().int().positive(), createdTs: z.string(), updatedTs: z.string() });
export type PlanningMilestone = z.infer<typeof PlanningMilestone>;
export const InboxInput = z.object({ idempotencyKey: z.string().uuid(), text: z.string().trim().min(1).max(16000), projectId: z.string().uuid().nullable() }).strict();
export const InboxItem = z.object({ id: z.string().uuid(), text: z.string(), projectId: z.string().uuid().nullable(), taskId: z.string().uuid().nullable(), status: z.enum(['captured', 'converted', 'archived']), version: z.number().int().positive(), createdTs: z.string(), updatedTs: z.string() });
export type InboxItem = z.infer<typeof InboxItem>;
export const PlanningSnapshot = z.object({ tasks: z.array(PlanningTask), milestones: z.array(PlanningMilestone), inbox: z.array(InboxItem) });
export type PlanningSnapshot = z.infer<typeof PlanningSnapshot>;
