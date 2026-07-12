/** Client for the workflows catalog (read-only reference data, parsed from the real files). */
import type { WorkflowMeta } from '@ado/shared';
import { SERVER_URL } from './config';

export async function fetchWorkflows(): Promise<WorkflowMeta[]> {
  const res = await fetch(`${SERVER_URL}/api/workflows`);
  if (!res.ok) throw new Error(`workflows: ${res.status}`);
  return ((await res.json()) as { workflows: WorkflowMeta[] }).workflows;
}
