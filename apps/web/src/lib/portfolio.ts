import { PortfolioSnapshot, PortfolioProject } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${SERVER_URL}/api/portfolio${path}`, { method, headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Project registry request failed');
  return data;
}
export const fetchPortfolio = async () => PortfolioSnapshot.parse(await request(''));
export const savePortfolioProject = async (input: unknown, id?: string) => PortfolioProject.parse((await request(id ? `/projects/${encodeURIComponent(id)}` : '/projects', id ? 'PUT' : 'POST', input)).project);
export const importPortfolioSource = async (input: { projectId: string; sourceId: string; repositoryId?: string }) => request('/import', 'POST', input);
