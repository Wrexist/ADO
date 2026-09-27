import { IncidentRecord } from '@ado/shared';
import { redact } from '../lib/redact';

/** Explicit report projection. Never export the database, credentials or raw event payloads. */
export function incidentReport(input: unknown, secrets: Array<string | undefined>, now = new Date().toISOString()) {
  const incident = IncidentRecord.parse(input);
  const text = (value: string | undefined, limit = 8000) => value === undefined ? undefined : redact(value, secrets).slice(0, limit);
  const diagnosis = incident.diagnosis;
  return {
    format: 'controlos-incident-v1', generatedTs: now,
    scope: 'Selected incident only. Known credentials are redacted; review project text before sharing. No raw logs or profile files are included.',
    incident: {
      id: text(incident.id, 500), ts: incident.ts, source: incident.source,
      kind: text(incident.kind, 500), status: incident.status,
      message: text(incident.message), stack: text(incident.stack, 16000), context: text(incident.context, 2000),
      diagnosis: diagnosis ? {
        summary: text(diagnosis.summary), rootCause: text(diagnosis.rootCause), suggestedFix: text(diagnosis.suggestedFix),
        prevention: text(diagnosis.prevention), severity: diagnosis.severity, confidence: diagnosis.confidence, diagnosedBy: diagnosis.diagnosedBy,
      } : undefined,
    },
  };
}
