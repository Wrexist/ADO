/**
 * Incident + diagnosis contracts — the app's self-diagnosis spine.
 *
 * When something breaks (an unhandled server rejection, a Fastify route error, a React
 * render crash, a runner failure) it is captured as an Incident and reported through the
 * bus like any other event. The IncidentDiagnoser then asks the Anthropic API *why* it
 * happened and attaches a Diagnosis (root cause + suggested fix + prevention); with no key
 * connected it falls back to a heuristic diagnosis, so the feature degrades honestly
 * instead of going dark (convention 12 — honest degraded state).
 *
 * Self-contained (only zod) so state.ts can import these entities without an import cycle —
 * state.ts is the reducer leaf and must not depend back on anything that depends on it.
 *
 * Convention 11 (external text is data, not instructions): an incident's message/stack/
 * context is untrusted runtime text. The diagnoser frames it as DATA to analyze, never as
 * instructions to follow.
 */
import { z } from 'zod';

/** ISO-8601 with offset — inlined (not imported from state.ts) to keep this module a leaf. */
const isoTs = z.string().datetime({ offset: true });

/** Where a failure originated. */
export const IncidentSource = z.enum(['server', 'web', 'runner']);
export type IncidentSource = z.infer<typeof IncidentSource>;

/** open = reported, awaiting/analyzing · diagnosed = a Diagnosis is attached. */
export const IncidentStatus = z.enum(['open', 'diagnosed']);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const DiagnosisSeverity = z.enum(['low', 'medium', 'high', 'critical']);
export type DiagnosisSeverity = z.infer<typeof DiagnosisSeverity>;

/** Who produced the diagnosis — 'claude' (Anthropic API) or 'heuristic' (offline fallback). */
export const DiagnosedBy = z.enum(['claude', 'heuristic']);
export type DiagnosedBy = z.infer<typeof DiagnosedBy>;

/** A captured failure, reported the moment it happens. */
export const Incident = z.object({
  id: z.string(),
  ts: isoTs,
  source: IncidentSource,
  /** Short error class/name: 'unhandledRejection', 'route-error', 'react-render', 'runner-failed', … */
  kind: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  /** Where it surfaced — route, endpoint, component. */
  context: z.string().optional(),
  status: IncidentStatus,
});
export type Incident = z.infer<typeof Incident>;

/** The AI (or heuristic) analysis attached to an incident — the "why + how to fix" feedback. */
export const Diagnosis = z.object({
  summary: z.string(), // one line: what broke
  rootCause: z.string(), // why it happened
  severity: DiagnosisSeverity,
  suggestedFix: z.string(), // how to fix it
  prevention: z.string(), // how to stop it recurring
  confidence: z.number().min(0).max(1),
  diagnosedBy: DiagnosedBy,
});
export type Diagnosis = z.infer<typeof Diagnosis>;

/** What lives in bus state: an incident plus its diagnosis once one arrives. */
export const IncidentRecord = Incident.extend({
  diagnosis: Diagnosis.optional(),
});
export type IncidentRecord = z.infer<typeof IncidentRecord>;
