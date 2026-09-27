import { PlanningSnapshot } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

export async function planningRequest(path = '', method = 'GET', body?: unknown) {
  const response = await fetch(`${SERVER_URL}/api/planning${path}`, { method, headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Planning request failed');
  return data;
}
export const fetchPlanning = async () => PlanningSnapshot.parse(await planningRequest());
