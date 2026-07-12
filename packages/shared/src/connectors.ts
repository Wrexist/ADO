/**
 * Connector catalog — the single source of truth for every service the dashboard can
 * link to. Comprehensive by design: connect a key once here and the relevant integration
 * uses it (GitHub, Claude, Slack + Discord are wired today; the rest store the key and light up per phase).
 *
 * PRESENTATION metadata only — names, blurbs, and the direct "get a key" deep links.
 * Secrets never live here or anywhere in the repo; they're stored server-side in a
 * gitignored file and never returned to the client (only a masked hint + connected flag).
 */

export type ConnectorGroup =
  | 'source'
  | 'ai'
  | 'data'
  | 'deploy'
  | 'mobile'
  | 'gamedev'
  | 'comms'
  | 'design'
  | 'observability'
  | 'payments';
export type ConnectorKind = 'api-key' | 'token' | 'url' | 'webhook';

export interface Connector {
  id: string;
  name: string;
  group: ConnectorGroup;
  blurb: string;
  kind: ConnectorKind;
  keyLabel: string;
  placeholder: string;
  getKeyUrl: string;
  docsHint?: string;
  wired: boolean;
}

export interface ConnectorGroupMeta {
  id: ConnectorGroup;
  title: string;
  blurb: string;
}

export const CONNECTOR_GROUPS: ConnectorGroupMeta[] = [
  { id: 'source', title: 'Source Control', blurb: 'Where your code and CI live.' },
  { id: 'ai', title: 'AI Providers & Subscriptions', blurb: 'Models for the command center, agents, and analyzer. Vendor-independent — connect one or many.' },
  { id: 'data', title: 'Data & Backend', blurb: 'Databases, auth, storage, and cache.' },
  { id: 'deploy', title: 'Deploy & Cloud', blurb: 'Ship builds and run infrastructure.' },
  { id: 'mobile', title: 'Mobile & App Stores', blurb: 'iOS, Android, and Expo pipelines.' },
  { id: 'gamedev', title: 'Game Dev', blurb: 'Engines and storefronts for your games.' },
  { id: 'comms', title: 'Notifications & Project', blurb: 'Where the dashboard pings you and tracks work.' },
  { id: 'design', title: 'Design', blurb: 'Specs and assets.' },
  { id: 'observability', title: 'Monitoring & Analytics', blurb: 'Errors and product analytics.' },
  { id: 'payments', title: 'Payments', blurb: 'Revenue signals for the executive view.' },
];

const C = (c: Connector): Connector => c;

export const CONNECTORS: Connector[] = [
  // ── Source control ────────────────────────────────────────────────────────
  C({ id: 'github', name: 'GitHub', group: 'source', blurb: 'Repositories, pull requests, Actions CI, and releases.', kind: 'token', keyLabel: 'Personal Access Token', placeholder: 'ghp_…', getKeyUrl: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=AI%20Control%20Center', docsHint: 'Scopes: repo + actions:read. Connects live the moment you save.', wired: true }),
  C({ id: 'gitlab', name: 'GitLab', group: 'source', blurb: 'Repos, pipelines, and releases on GitLab.', kind: 'token', keyLabel: 'Personal Access Token', placeholder: 'glpat-…', getKeyUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens', wired: false }),
  C({ id: 'bitbucket', name: 'Bitbucket', group: 'source', blurb: 'Repos and Pipelines on Bitbucket.', kind: 'token', keyLabel: 'App Password', placeholder: 'user:app-password', getKeyUrl: 'https://bitbucket.org/account/settings/app-passwords/', wired: false }),

  // ── AI providers & subscriptions ──────────────────────────────────────────
  C({ id: 'anthropic', name: 'Claude (Anthropic)', group: 'ai', blurb: 'Claude models — powers the command center intents and the nightly analyzer.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'sk-ant-…', getKeyUrl: 'https://console.anthropic.com/settings/keys', docsHint: 'Used by the intent parser + analyzer. The agent runner uses Claude Code’s own auth.', wired: true }),
  C({ id: 'openai', name: 'GPT (OpenAI)', group: 'ai', blurb: 'GPT models via the universal AI runtime.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'sk-…', getKeyUrl: 'https://platform.openai.com/api-keys', wired: false }),
  C({ id: 'google', name: 'Gemini (Google)', group: 'ai', blurb: 'Gemini models via the universal AI runtime.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'AIza…', getKeyUrl: 'https://aistudio.google.com/app/apikey', wired: false }),
  C({ id: 'mistral', name: 'Mistral', group: 'ai', blurb: 'Open-weight and hosted Mistral models.', kind: 'api-key', keyLabel: 'API Key', placeholder: '…', getKeyUrl: 'https://console.mistral.ai/api-keys/', wired: false }),
  C({ id: 'xai', name: 'Grok (xAI)', group: 'ai', blurb: 'Grok models from xAI.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'xai-…', getKeyUrl: 'https://console.x.ai/', wired: false }),
  C({ id: 'groq', name: 'Groq', group: 'ai', blurb: 'Ultra-fast inference for open models.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'gsk_…', getKeyUrl: 'https://console.groq.com/keys', wired: false }),
  C({ id: 'openrouter', name: 'OpenRouter', group: 'ai', blurb: 'One key, hundreds of models across providers.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'sk-or-…', getKeyUrl: 'https://openrouter.ai/keys', wired: false }),
  C({ id: 'huggingface', name: 'Hugging Face', group: 'ai', blurb: 'Inference endpoints and model hub.', kind: 'token', keyLabel: 'Access Token', placeholder: 'hf_…', getKeyUrl: 'https://huggingface.co/settings/tokens', wired: false }),
  C({ id: 'ollama', name: 'Ollama (local)', group: 'ai', blurb: 'Local open models — no key, just point at your Ollama server.', kind: 'url', keyLabel: 'Server URL', placeholder: 'http://localhost:11434', getKeyUrl: 'https://ollama.com/download', docsHint: 'Runs models on your own machine — fully offline, no subscription.', wired: false }),

  // ── Data & backend ────────────────────────────────────────────────────────
  C({ id: 'supabase', name: 'Supabase', group: 'data', blurb: 'Postgres, auth, and storage.', kind: 'api-key', keyLabel: 'Access Token', placeholder: 'sbp_…', getKeyUrl: 'https://supabase.com/dashboard/account/tokens', wired: false }),
  C({ id: 'firebase', name: 'Firebase', group: 'data', blurb: 'Realtime DB, auth, and hosting (Google).', kind: 'api-key', keyLabel: 'Service Account JSON', placeholder: '{ service account }', getKeyUrl: 'https://console.firebase.google.com/', wired: false }),
  C({ id: 'neon', name: 'Neon', group: 'data', blurb: 'Serverless Postgres with branching.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'neon_…', getKeyUrl: 'https://console.neon.tech/app/settings/api-keys', wired: false }),
  C({ id: 'planetscale', name: 'PlanetScale', group: 'data', blurb: 'Serverless MySQL.', kind: 'token', keyLabel: 'Service Token', placeholder: 'pscale_tkn_…', getKeyUrl: 'https://planetscale.com/docs/concepts/service-tokens', wired: false }),
  C({ id: 'mongodb', name: 'MongoDB Atlas', group: 'data', blurb: 'Managed MongoDB.', kind: 'api-key', keyLabel: 'API Key (public:private)', placeholder: 'pub:priv', getKeyUrl: 'https://cloud.mongodb.com/', wired: false }),
  C({ id: 'upstash', name: 'Upstash Redis', group: 'data', blurb: 'Serverless Redis & queues.', kind: 'api-key', keyLabel: 'REST Token', placeholder: '…', getKeyUrl: 'https://console.upstash.com/', wired: false }),

  // ── Deploy & cloud ────────────────────────────────────────────────────────
  C({ id: 'vercel', name: 'Vercel', group: 'deploy', blurb: 'Deployments and preview URLs.', kind: 'token', keyLabel: 'Access Token', placeholder: 'vercel_…', getKeyUrl: 'https://vercel.com/account/tokens', wired: false }),
  C({ id: 'netlify', name: 'Netlify', group: 'deploy', blurb: 'Static site deploys.', kind: 'token', keyLabel: 'Personal Access Token', placeholder: 'nfp_…', getKeyUrl: 'https://app.netlify.com/user/applications#personal-access-tokens', wired: false }),
  C({ id: 'cloudflare', name: 'Cloudflare', group: 'deploy', blurb: 'Pages, Workers, DNS, R2.', kind: 'token', keyLabel: 'API Token', placeholder: '…', getKeyUrl: 'https://dash.cloudflare.com/profile/api-tokens', wired: false }),
  C({ id: 'aws', name: 'AWS', group: 'deploy', blurb: 'S3, Lambda, and the rest.', kind: 'api-key', keyLabel: 'Access Key (id:secret)', placeholder: 'AKIA…:secret', getKeyUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials', wired: false }),
  C({ id: 'fly', name: 'Fly.io', group: 'deploy', blurb: 'Run app containers close to users.', kind: 'token', keyLabel: 'Access Token', placeholder: 'fo1_…', getKeyUrl: 'https://fly.io/user/personal_access_tokens', wired: false }),
  C({ id: 'railway', name: 'Railway', group: 'deploy', blurb: 'Deploy apps and databases.', kind: 'token', keyLabel: 'API Token', placeholder: '…', getKeyUrl: 'https://railway.app/account/tokens', wired: false }),
  C({ id: 'render', name: 'Render', group: 'deploy', blurb: 'Web services and cron jobs.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'rnd_…', getKeyUrl: 'https://dashboard.render.com/u/settings#api-keys', wired: false }),

  // ── Mobile & app stores ───────────────────────────────────────────────────
  C({ id: 'appstore', name: 'App Store Connect', group: 'mobile', blurb: 'iOS TestFlight builds and releases.', kind: 'api-key', keyLabel: 'API Key (.p8)', placeholder: 'Key ID / issuer / .p8', getKeyUrl: 'https://appstoreconnect.apple.com/access/integrations/api', wired: false }),
  C({ id: 'googleplay', name: 'Google Play', group: 'mobile', blurb: 'Android releases and tracks.', kind: 'api-key', keyLabel: 'Service Account JSON', placeholder: '{ service account }', getKeyUrl: 'https://play.google.com/console/', wired: false }),
  C({ id: 'expo', name: 'Expo (EAS)', group: 'mobile', blurb: 'React Native builds & OTA updates.', kind: 'token', keyLabel: 'Access Token', placeholder: '…', getKeyUrl: 'https://expo.dev/settings/access-tokens', wired: false }),

  // ── Game dev ──────────────────────────────────────────────────────────────
  C({ id: 'steam', name: 'Steam', group: 'gamedev', blurb: 'Steamworks: builds, depots, releases.', kind: 'api-key', keyLabel: 'Web API Key', placeholder: '…', getKeyUrl: 'https://steamcommunity.com/dev/apikey', wired: false }),
  C({ id: 'unity', name: 'Unity Cloud', group: 'gamedev', blurb: 'Unity DevOps: cloud build & delivery.', kind: 'api-key', keyLabel: 'API Key', placeholder: '…', getKeyUrl: 'https://cloud.unity.com/', wired: false }),

  // ── Notifications & project ───────────────────────────────────────────────
  C({ id: 'slack', name: 'Slack', group: 'comms', blurb: 'Build-failure and deploy notifications to a channel.', kind: 'webhook', keyLabel: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/…', getKeyUrl: 'https://api.slack.com/messaging/webhooks', docsHint: 'Connects live the moment you save — pings on real CI failures + deploys.', wired: true }),
  C({ id: 'discord', name: 'Discord', group: 'comms', blurb: 'Build-failure and deploy notifications to a channel.', kind: 'webhook', keyLabel: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…', getKeyUrl: 'https://support.discord.com/hc/en-us/articles/228383668', docsHint: 'Connects live the moment you save — pings on real CI failures + deploys.', wired: true }),
  C({ id: 'telegram', name: 'Telegram', group: 'comms', blurb: 'Bot notifications to your phone.', kind: 'token', keyLabel: 'Bot Token', placeholder: '123456:ABC…', getKeyUrl: 'https://t.me/botfather', wired: false }),
  C({ id: 'linear', name: 'Linear', group: 'comms', blurb: 'Issues and project tracking.', kind: 'api-key', keyLabel: 'API Key', placeholder: 'lin_api_…', getKeyUrl: 'https://linear.app/settings/api', wired: false }),
  C({ id: 'notion', name: 'Notion', group: 'comms', blurb: 'Docs and knowledge base.', kind: 'token', keyLabel: 'Integration Token', placeholder: 'secret_…', getKeyUrl: 'https://www.notion.so/my-integrations', wired: false }),

  // ── Design ────────────────────────────────────────────────────────────────
  C({ id: 'figma', name: 'Figma', group: 'design', blurb: 'Design specs and asset export.', kind: 'token', keyLabel: 'Personal Access Token', placeholder: 'figd_…', getKeyUrl: 'https://www.figma.com/developers/api#access-tokens', wired: false }),

  // ── Monitoring & analytics ────────────────────────────────────────────────
  C({ id: 'sentry', name: 'Sentry', group: 'observability', blurb: 'Error tracking and release health.', kind: 'token', keyLabel: 'Auth Token', placeholder: 'sntrys_…', getKeyUrl: 'https://sentry.io/settings/account/api/auth-tokens/', wired: false }),
  C({ id: 'posthog', name: 'PostHog', group: 'observability', blurb: 'Product analytics and funnels.', kind: 'api-key', keyLabel: 'Personal API Key', placeholder: 'phx_…', getKeyUrl: 'https://posthog.com/docs/api#personal-api-keys', wired: false }),

  // ── Payments ──────────────────────────────────────────────────────────────
  C({ id: 'stripe', name: 'Stripe', group: 'payments', blurb: 'Revenue, subscriptions, payouts.', kind: 'api-key', keyLabel: 'Secret Key', placeholder: 'sk_live_… / sk_test_…', getKeyUrl: 'https://dashboard.stripe.com/apikeys', wired: false }),
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
