/**
 * Connector catalog — the single source of truth for every service the dashboard can
 * link to (GitHub, the AI providers/subscriptions, infra, deploy, comms, design).
 *
 * This is PRESENTATION metadata only — names, blurbs, and the direct "get a key" links.
 * Secrets never live here or anywhere in the repo; they're stored server-side in a
 * gitignored file and never returned to the client (only a masked hint + connected flag).
 *
 * `wired` is honest: true = the key is actually consumed today; false = we store it and
 * light up the integration in a later phase (no pretending a saved key does something).
 */

export type ConnectorGroup = 'source' | 'ai' | 'data' | 'deploy' | 'comms' | 'design';
export type ConnectorKind = 'api-key' | 'token' | 'url' | 'webhook';

export interface Connector {
  id: string;
  name: string;
  group: ConnectorGroup;
  blurb: string;
  kind: ConnectorKind;
  keyLabel: string; // what the user pastes
  placeholder: string;
  getKeyUrl: string; // deep link to where the key is created
  docsHint?: string; // one-line "how to" under the field
  wired: boolean; // consumed today vs saved-for-later (honest badge)
}

export interface ConnectorGroupMeta {
  id: ConnectorGroup;
  title: string;
  blurb: string;
}

export const CONNECTOR_GROUPS: ConnectorGroupMeta[] = [
  { id: 'source', title: 'Source Control', blurb: 'Where your code and CI live.' },
  { id: 'ai', title: 'AI Providers & Subscriptions', blurb: 'Models for the command center, agents, and analyzer. Vendor-independent — connect one or many.' },
  { id: 'data', title: 'Data & Infrastructure', blurb: 'Databases and backend services.' },
  { id: 'deploy', title: 'Deploy & Release', blurb: 'Ship builds and track releases.' },
  { id: 'comms', title: 'Notifications', blurb: 'Where the dashboard pings you.' },
  { id: 'design', title: 'Design', blurb: 'Specs and assets.' },
];

export const CONNECTORS: Connector[] = [
  {
    id: 'github',
    name: 'GitHub',
    group: 'source',
    blurb: 'Repositories, pull requests, Actions CI, and releases.',
    kind: 'token',
    keyLabel: 'Personal Access Token',
    placeholder: 'ghp_…',
    getKeyUrl: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=AI%20Control%20Center',
    docsHint: 'Scopes needed: repo + actions:read. Connects live the moment you save.',
    wired: true,
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    group: 'ai',
    blurb: 'Claude models — powers the command center intents and the nightly analyzer.',
    kind: 'api-key',
    keyLabel: 'API Key',
    placeholder: 'sk-ant-…',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    docsHint: 'Used only by the intent parser + analyzer. The agent runner uses Claude Code’s own auth.',
    wired: true,
  },
  {
    id: 'openai',
    name: 'GPT (OpenAI)',
    group: 'ai',
    blurb: 'GPT models via the universal AI runtime.',
    kind: 'api-key',
    keyLabel: 'API Key',
    placeholder: 'sk-…',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    wired: false,
  },
  {
    id: 'google',
    name: 'Gemini (Google)',
    group: 'ai',
    blurb: 'Gemini models via the universal AI runtime.',
    kind: 'api-key',
    keyLabel: 'API Key',
    placeholder: 'AIza…',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    wired: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    group: 'ai',
    blurb: 'Local open models — no key, just point at your Ollama server.',
    kind: 'url',
    keyLabel: 'Server URL',
    placeholder: 'http://localhost:11434',
    getKeyUrl: 'https://ollama.com/download',
    docsHint: 'Runs models on your own machine — fully offline, no subscription.',
    wired: false,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    group: 'data',
    blurb: 'Postgres, auth, and storage for your apps.',
    kind: 'api-key',
    keyLabel: 'Access Token',
    placeholder: 'sbp_…',
    getKeyUrl: 'https://supabase.com/dashboard/account/tokens',
    wired: false,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    group: 'deploy',
    blurb: 'Deployments and preview URLs.',
    kind: 'token',
    keyLabel: 'Access Token',
    placeholder: 'vercel_…',
    getKeyUrl: 'https://vercel.com/account/tokens',
    wired: false,
  },
  {
    id: 'netlify',
    name: 'Netlify',
    group: 'deploy',
    blurb: 'Static site deploys.',
    kind: 'token',
    keyLabel: 'Personal Access Token',
    placeholder: 'nfp_…',
    getKeyUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
    wired: false,
  },
  {
    id: 'appstore',
    name: 'App Store Connect',
    group: 'deploy',
    blurb: 'iOS TestFlight builds and releases.',
    kind: 'api-key',
    keyLabel: 'API Key (.p8)',
    placeholder: 'Key ID / issuer / .p8',
    getKeyUrl: 'https://appstoreconnect.apple.com/access/integrations/api',
    wired: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    group: 'comms',
    blurb: 'Build, deploy, and gate notifications.',
    kind: 'webhook',
    keyLabel: 'Incoming Webhook URL',
    placeholder: 'https://hooks.slack.com/services/…',
    getKeyUrl: 'https://api.slack.com/messaging/webhooks',
    wired: false,
  },
  {
    id: 'discord',
    name: 'Discord',
    group: 'comms',
    blurb: 'Notifications to a channel.',
    kind: 'webhook',
    keyLabel: 'Webhook URL',
    placeholder: 'https://discord.com/api/webhooks/…',
    getKeyUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
    wired: false,
  },
  {
    id: 'figma',
    name: 'Figma',
    group: 'design',
    blurb: 'Design specs and asset export.',
    kind: 'token',
    keyLabel: 'Personal Access Token',
    placeholder: 'figd_…',
    getKeyUrl: 'https://www.figma.com/developers/api#access-tokens',
    wired: false,
  },
];

export const CONNECTOR_BY_ID: Record<string, Connector> = Object.fromEntries(
  CONNECTORS.map((c) => [c.id, c]),
);

/** Status the server returns per connector — NEVER the secret itself. */
export interface ConnectionStatus {
  id: string;
  connected: boolean;
  hint: string | null; // e.g. "••••4f2a" — last 4 chars only
  updatedTs: string | null;
}
