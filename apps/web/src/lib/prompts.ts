/** Client for the prompt library. Custom prompts are token-gated; dispatch reuses the runner. */
import type { CustomPromptInputT, PromptTemplate } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export async function fetchCustomPrompts(): Promise<PromptTemplate[]> {
  const res = await fetch(`${SERVER_URL}/api/prompts`, { headers: headers() });
  if (!res.ok) throw new Error(`prompts: ${res.status}`);
  return ((await res.json()) as { prompts: PromptTemplate[] }).prompts;
}

export async function saveCustomPrompt(input: CustomPromptInputT): Promise<PromptTemplate> {
  const res = await fetch(`${SERVER_URL}/api/prompts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `save failed (${res.status})`);
  return ((await res.json()) as { prompt: PromptTemplate }).prompt;
}

export async function deleteCustomPrompt(id: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/prompts/${id}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

/** Dispatch a rendered prompt to a scanned repo as a headless agent run. */
export async function dispatchPrompt(
  repoId: string,
  task: string,
  model?: string,
): Promise<{ runId: string }> {
  const res = await fetch(`${SERVER_URL}/api/dispatch`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ repoId, task, model }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `dispatch failed (${res.status})`);
  return (await res.json()) as { runId: string };
}
