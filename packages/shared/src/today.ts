import { z } from 'zod';

export const TodayEstimate = z.object({
  taskId: z.string().uuid(), taskVersion: z.number().int().positive(),
  minMinutes: z.number().int().positive().max(10080), maxMinutes: z.number().int().positive().max(10080),
}).strict().refine((e) => e.minMinutes <= e.maxMinutes, 'Estimate minimum exceeds maximum');
export const TodayRequest = z.object({
  availableMinutes: z.number().int().positive().max(1440),
  projectId: z.string().uuid().nullable(), lockedTaskId: z.string().uuid().nullable(),
  estimates: z.array(TodayEstimate).max(500).refine((rows) => new Set(rows.map((r) => r.taskId)).size === rows.length, 'Duplicate task estimates'),
}).strict();
export const TodayProposal = z.object({
  generatedTs: z.string(), availableMinutes: z.number(), lockedTaskId: z.string().uuid().nullable(),
  alternatives: z.array(z.object({ taskId: z.string().uuid(), taskVersion: z.number(), title: z.string(), estimate: TodayEstimate, reason: z.string(), uncertainty: z.literal('User estimate; actual duration is unknown') })).max(3),
  excluded: z.array(z.object({ taskId: z.string().uuid(), reason: z.enum(['outside_focus', 'inactive_project', 'not_ready', 'dependencies', 'writer_lock', 'estimate_missing', 'outside_window', 'lower_priority']) })),
  scope: z.literal('Manual planning alternatives only; execution eligibility must be reviewed separately'),
});
export type TodayProposal = z.infer<typeof TodayProposal>;
export const TodayPreferencesWrite = TodayRequest.extend({ version: z.number().int().nonnegative() }).strict();
export const TodayPreferences = TodayPreferencesWrite.extend({ updatedTs: z.string().nullable() }).strict();
export type TodayPreferences = z.infer<typeof TodayPreferences>;
