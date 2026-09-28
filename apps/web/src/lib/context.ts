import { ContextPackageList, ContextPackageRecord, ContextPackageStatus, ContextSourcePreview } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

export async function contextRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${SERVER_URL}/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Context request failed'); return data;
}
export const listContext = async (taskId: string, cursor?: string) => ContextPackageList.parse(await contextRequest(`/planning/tasks/${taskId}/context/packages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`));
export const readContext = async (id: string) => ContextPackageRecord.parse(await contextRequest(`/context/packages/${id}`));
export const contextStatus = async (id: string) => ContextPackageStatus.parse(await contextRequest(`/context/packages/${id}/status`));
export const previewContext = async (taskId: string, input: unknown) => ContextSourcePreview.parse(await contextRequest(`/planning/tasks/${taskId}/context/preview`, 'POST', input));
