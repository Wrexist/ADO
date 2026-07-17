/** Client for the workflows catalog (read-only reference data, parsed from the real files). */
import { WorkflowMeta } from '@ado/shared';
import { SERVER_URL } from './config';

export async function fetchWorkflows(): Promise<WorkflowMeta[]> {
  const res = await fetch(`${SERVER_URL}/api/workflows`);
  if (!res.ok) throw new Error(`workflows: ${res.status}`);
  return WorkflowMeta.array().parse(((await res.json()) as { workflows: unknown }).workflows);
}
