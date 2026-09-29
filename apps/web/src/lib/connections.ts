/** Client for the connections API. Always sends the token; never receives secrets. */
import { ConnectionStatus } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });
const url = (id: string, suffix = '') => `${SERVER_URL}/api/connections/${encodeURIComponent(id)}${suffix}`;

/** Turn a failed response into a sentence a person can act on; server text is kept when it explains. */
export async function describeFailure(res: Response, action: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: unknown } | null;
  const error = typeof body?.error === 'string' ? body.error : null;
  if (res.status === 401) return 'This browser is no longer connected to ControlOS. Reload the page and enter the access key again.';
  if (error === 'value is empty') return 'Paste a key first.';
  if (res.status === 404) return 'This service is not known to the server. Reload the page.';
  return error ?? `Could not ${action} (server answered ${res.status}).`;
}

async function call(input: string, init: RequestInit, action: string): Promise<Response> {
  let res: Response;
  try { res = await fetch(input, { ...init, headers: headers() }); }
  catch { throw new Error('Could not reach the ControlOS server. Check that it is running.'); }
  if (!res.ok) throw new Error(await describeFailure(res, action));
  return res;
}

const statusOf = async (res: Response) => ConnectionStatus.parse(((await res.json()) as { status: unknown }).status);

export async function verifyConnection(id: string): Promise<ConnectionStatus> {
  return statusOf(await call(url(id, '/verify'), { method: 'POST', body: '{}' }, 'check the key'));
}

export async function fetchConnections(): Promise<ConnectionStatus[]> {
  const res = await call(`${SERVER_URL}/api/connections`, {}, 'load connections');
  return ConnectionStatus.array().parse(((await res.json()) as { connections: unknown }).connections);
}

export async function saveConnection(id: string, value: string): Promise<ConnectionStatus> {
  return statusOf(await call(url(id), { method: 'POST', body: JSON.stringify({ value: value.trim() }) }, 'save the key'));
}

export async function removeConnection(id: string): Promise<ConnectionStatus> {
  return statusOf(await call(url(id), { method: 'DELETE' }, 'disconnect'));
}

const SHAPES: Record<string, { test: RegExp; expected: string }> = {
  github: { test: /^(ghp_|github_pat_|gho_|ghu_|ghs_)[A-Za-z0-9_]+$/, expected: 'GitHub tokens start with ghp_ or github_pat_' },
  anthropic: { test: /^sk-ant-[A-Za-z0-9_-]+$/, expected: 'Anthropic keys start with sk-ant-' },
  slack: { test: /^https:\/\/hooks\.slack\.com\/services\/\S+$/, expected: 'Slack webhooks start with https://hooks.slack.com/services/' },
  discord: { test: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\S+$/, expected: 'Discord webhooks start with https://discord.com/api/webhooks/' },
};

/** Non-blocking hint for a value that does not look like this service's key. */
export function shapeWarning(id: string, value: string): string | null {
  const shape = SHAPES[id], v = value.trim();
  if (!shape || !v || shape.test.test(v)) return null;
  return `This doesn’t look like the expected format (${shape.expected}). You can still save it.`;
}
