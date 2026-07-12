/**
 * Server factory (Prompt 2.1): security → bus → routes. Split from index.ts so
 * tests can build an app against :memory: without binding a port.
 */
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { CONNECTOR_BY_ID } from '@ado/shared';
import { openDb } from './db';
import type { Env } from './env';
import { Bus } from './bus';
import { registerSecurity, sseAuthorized, tokenMatches } from './security';
import { ConnectionsStore } from './connections/store';
import { PromptStore } from './prompts/store';
import { seedDemo } from './demo';
import { Scanner } from './scanner';
import { GitHubSync } from './integrations/github/sync';
import { OctokitClient } from './integrations/github/client';
import type { GitHubClient } from './integrations/github/types';
import { Sysmon } from './system/sysmon';
import { HealthChecker } from './system/health';
import { Runner } from './runner';
import { ClaudeSpawner, type Spawner } from './runner/spawner';
import { HeuristicParser } from './command/parser';
import { respond, execute } from './command/execute';
import { TokenRollup } from './command/tokens';
import { Scheduler } from './scheduler';
import { backupDatabase } from './backup';
import { Intent } from '@ado/shared';

export interface AccServer {
  app: FastifyInstance;
  bus: Bus;
  scanner: Scanner | null;
  github: GitHubSync | null;
  sysmon: Sysmon | null;
  health: HealthChecker | null;
  runner: Runner;
  close: () => Promise<void>;
}

/** Injectable deps (tests + local demos supply fakes). */
export interface AccDeps {
  githubClient?: GitHubClient;
  /** Tests set false to skip the real sysmon/health background loops. */
  startSystem?: boolean;
  /** Inject a fake process spawner (tests + simulated dispatch demo). */
  spawner?: Spawner;
}

export async function buildServer(env: Env, deps: AccDeps = {}): Promise<AccServer> {
  const { db, sqlite } = openDb(env.dbPath);
  // The SSE token rides the URL (`/events?token=…`) because EventSource can't set headers,
  // and the default logger serializes req.url — writing the shared secret to the log file.
  // Redact it in a custom req serializer (headers are never serialized, so header tokens
  // stay safe on their own).
  const app = Fastify({
    logger: env.dbPath !== ':memory:'
      ? {
          serializers: {
            req: (req: FastifyRequest) => ({
              method: req.method,
              url: (req.url ?? '').replace(/([?&]token=)[^&]*/i, '$1[redacted]'),
              remoteAddress: req.ip,
            }),
          },
        }
      : false,
  });

  const bus = new Bus(db);
  bus.replayFromDb((msg) => app.log.warn(msg));

  await app.register(cors, {
    origin: env.webOrigin, // exactly one origin — no wildcards
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-acc-token', 'last-event-id'],
  });
  registerSecurity(app, env);

  app.get('/health', async () => ({
    status: 'ok',
    seq: bus.snapshot().seq, // the fold cursor — a real liveness signal, unlike a hardcoded phase
    ts: new Date().toISOString(),
  }));

  /**
   * SSE — read-only, token-gated (query param; EventSource can't set headers).
   * Fresh connect → full snapshot frame. Reconnect with Last-Event-ID → replay
   * the persisted gap instead, so a laptop sleep never renders stale as live.
   */
  app.get('/events', (req, reply) => {
    if (!sseAuthorized(env, req)) {
      return reply.code(401).send({ error: 'missing or invalid token' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': env.webOrigin,
    });
    reply.raw.write('retry: 3000\n\n');

    // id line omitted for transient sample frames so they don't move the replay cursor
    const send = (id: number | null, event: string, data: unknown) =>
      reply.raw.write(`${id != null ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const lastIdHeader = req.headers['last-event-id'];
    const lastId = typeof lastIdHeader === 'string' ? Number.parseInt(lastIdHeader, 10) : NaN;
    const snap = bus.snapshot();

    if (Number.isFinite(lastId) && lastId <= snap.seq) {
      // resume path: replay only the durable gap (snapshot already carries live samples)
      for (const { seq, evt } of bus.eventsSince(lastId)) send(seq, 'evt', evt);
    } else {
      // fresh path: authoritative snapshot
      send(snap.seq, 'snapshot', snap);
    }

    const unsubscribe = bus.subscribe((frame) => {
      if (frame.kind === 'evt') send(frame.seq, 'evt', frame.evt);
      else send(null, 'sample', frame.sample);
    });
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
    let closed = false;
    const cleanup = () => {
      if (closed) return; // 'close' and 'error' can both fire — release once
      closed = true;
      clearInterval(ping);
      unsubscribe();
    };
    req.raw.on('close', cleanup);
    reply.raw.on('error', cleanup); // abrupt client reset emits 'error' on the hijacked socket
  });

  /** App-open logging — feeds the p2.5 daily-driver gate. Token enforced by the hook. */
  app.post('/api/app-open', async (req) => {
    const body = (req.body ?? {}) as { sessionId?: string };
    const sessionId = body.sessionId ?? randomUUID();
    const ts = new Date().toISOString();
    bus.publish({
      id: `app-open:${sessionId}:${ts.slice(0, 10)}`,
      type: 'app.opened',
      ts,
      source: { kind: 'app', ref: sessionId },
      payload: { sessionId },
    });
    return { ok: true };
  });

  if (env.demo) {
    seedDemo(bus);
    app.log.info('demo seed applied (deterministic fixture events)');
  }

  // Secrets store: stored keys override .env; secrets never leave the server.
  const ENV_FALLBACK: Record<string, string> = {
    github: 'GITHUB_TOKEN',
    gitlab: 'GITLAB_TOKEN',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    xai: 'XAI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    huggingface: 'HUGGINGFACE_TOKEN',
    supabase: 'SUPABASE_ACCESS_TOKEN',
    vercel: 'VERCEL_TOKEN',
    netlify: 'NETLIFY_TOKEN',
    cloudflare: 'CLOUDFLARE_API_TOKEN',
    figma: 'FIGMA_TOKEN',
    sentry: 'SENTRY_AUTH_TOKEN',
    stripe: 'STRIPE_SECRET_KEY',
  };
  const connectionsPath =
    env.dbPath === ':memory:'
      ? join(tmpdir(), `acc-conn-${process.pid}.json`)
      : join(dirname(env.dbPath), 'connections.json');
  const connections = new ConnectionsStore(connectionsPath, (id) => {
    const key = ENV_FALLBACK[id];
    return key ? process.env[key] : undefined;
  });

  // Custom prompt library — the user's own entries (built-ins ship in @ado/shared).
  const promptsPath =
    env.dbPath === ':memory:'
      ? join(tmpdir(), `acc-prompts-${process.pid}.json`)
      : join(dirname(env.dbPath), 'prompts.json');
  const prompts = new PromptStore(promptsPath);

  // Daily headline-stat snapshot → powers the "↑2 this week" deltas. Unique id per emit so
  // the reducer keeps the latest value per day (a boot capture that lands before the first
  // scan finishes is corrected by the post-scan capture below). No history → no delta
  // (honest); --demo seeds a week of history directly.
  const snapshotStats = () => {
    const st = bus.snapshot().state;
    const running = Object.values(st.agents).filter((a) => a.kind === 'runner' && a.status === 'running').length;
    const values: Record<string, number> = {
      repos: Object.keys(st.repos).length,
      deployments: st.deployments.length,
      agentsActive: running,
    };
    if (st.tokens?.approxTokens != null) values.tokens = st.tokens.approxTokens;
    const now = new Date().toISOString();
    bus.publish({
      id: `stats:${now.slice(0, 10)}:${now}`,
      type: 'stats.snapshot',
      ts: now,
      source: { kind: 'app', ref: 'stats' },
      payload: { day: now.slice(0, 10), values },
    });
  };

  // Real data source: scan configured project dirs (skipped in demo/no-dirs runs).
  let scanner: Scanner | null = null;
  if (!env.demo && env.projectDirs.length > 0) {
    scanner = new Scanner(bus, env.projectDirs, (msg) => app.log.info(msg));
    // Capture an accurate stat snapshot once the initial scan has populated repos.
    void scanner.start().then(() => snapshotStats()).catch((err) => app.log.error(err));
  }

  // GitHub enrichment: token comes from the connections store (or an injected client).
  // Restartable so the Settings page connects GitHub live — no server restart needed.
  let github: GitHubSync | null = null;
  const startGithub = () => {
    github?.stop();
    github = null;
    if (env.demo) return;
    const token = connections.resolve('github');
    const client = deps.githubClient ?? (token ? new OctokitClient(token) : null);
    if (!client) return;
    github = new GitHubSync(bus, client, (msg) => app.log.info(msg));
    github.start();
  };
  startGithub();

  // cwd allow-list: only scanned repos are dispatchable (demo maps ids straight through
  // for the sim agent). Shared by the runner and the command center — defined once.
  const cwdFor = (id: string): string | null =>
    scanner ? scanner.cwdFor(id) : bus.snapshot().state.repos[id] ? `/repos/${id}` : null;

  // Runner: dispatch headless agents.
  const runner = new Runner(
    bus,
    db,
    deps.spawner ?? new ClaudeSpawner(),
    { cwdFor },
    (msg) => app.log.info(msg),
  );
  const orphans = runner.reconcileOrphans();
  if (orphans > 0) app.log.warn(`runner: reconciled ${orphans} orphaned run(s) on boot`);

  app.post('/api/dispatch', async (req, reply) => {
    const body = (req.body ?? {}) as { repoId?: string; task?: string; model?: string };
    if (!body.repoId || !body.task) return reply.code(400).send({ error: 'repoId and task are required' });
    try {
      return runner.dispatch({ repoId: body.repoId, task: body.task, model: body.model });
    } catch (err) {
      return reply.code(403).send({ error: (err as Error).message });
    }
  });

  // Command center (Phase 4): parse NL → intent → read now / preview-to-confirm for
  // mutations. Reuses the shared cwdFor allow-list resolver.
  const parser = new HeuristicParser();
  const cmdDeps = { bus, runner, cwdFor };

  app.post('/api/command', async (req, reply) => {
    const text = ((req.body ?? {}) as { text?: string }).text?.trim();
    if (!text) return reply.code(400).send({ error: 'text is required' });
    const intent = parser.parse(text, Object.keys(bus.snapshot().state.repos));
    return respond(intent, cmdDeps);
  });

  app.post('/api/command/execute', async (req, reply) => {
    const parsed = Intent.safeParse((req.body ?? {}) as unknown);
    if (!parsed.success) return reply.code(400).send({ error: 'a valid intent is required' });
    return execute(parsed.data, cmdDeps);
  });

  const tokens = new TokenRollup(bus, db, (msg) => app.log.info(msg));

  // System layer: real CPU/mem/net sampling + health checks (real mode only; demo
  // seeds deterministic samples/health for the frozen baseline world). Sub-minute
  // samplers stay on their own naked intervals — a missed 10s sample is meaningless.
  // Catch-up-worthy recurring work (rollup, nightly backup) goes through the scheduler.
  let sysmon: Sysmon | null = null;
  let health: HealthChecker | null = null;
  let scheduler: Scheduler | null = null;
  if (!env.demo && deps.startSystem !== false) {
    sysmon = new Sysmon(bus, (msg) => app.log.warn(msg));
    sysmon.start();
    health = new HealthChecker(bus, () => connections.resolve('anthropic') ?? '', (msg) => app.log.info(msg));
    health.start();

    scheduler = new Scheduler(db, (msg) => app.log.warn(msg));
    // Token rollup: cheap + idempotent, so refresh the card on every boot too.
    scheduler.register({ name: 'token-rollup', intervalMs: 60 * 60 * 1000, runOnBoot: true, run: () => tokens.rollup() });
    // Daily headline-stat snapshot for trend deltas (catch-up fires on boot; the post-scan
    // capture above corrects day-one once repos are populated).
    scheduler.register({ name: 'stats-snapshot', intervalMs: 24 * 60 * 60 * 1000, runOnBoot: true, run: snapshotStats });
    // Nightly WAL-safe backup — true catch-up: only fires if a day has actually elapsed.
    if (env.dbPath !== ':memory:') {
      const backupDir = join(dirname(env.dbPath), 'backups');
      scheduler.register({
        name: 'db-backup',
        intervalMs: 24 * 60 * 60 * 1000,
        run: () => {
          const r = backupDatabase(sqlite, backupDir);
          app.log.info(`backup: ${r.rows} events → ${r.file}${r.rotatedOut.length ? ` (rotated ${r.rotatedOut.length})` : ''}`);
        },
      });
    }
    scheduler.start();
  }

  // Connections (Settings page). Every route requires the token — GET included, since
  // connection status shouldn't be world-readable. Secrets are NEVER returned.
  const requireToken = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const t = req.headers['x-acc-token'];
    if (!tokenMatches(env.accToken, typeof t === 'string' ? t : undefined)) {
      reply.code(401).send({ error: 'unauthorized' });
      return false;
    }
    return true;
  };
  app.get('/api/connections', async (req, reply) => {
    if (!requireToken(req, reply)) return undefined;
    return { connections: connections.statusAll() };
  });
  app.post('/api/connections/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!CONNECTOR_BY_ID[id]) return reply.code(404).send({ error: 'unknown connector' });
    try {
      connections.set(id, ((req.body ?? {}) as { value?: string }).value ?? '');
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    if (id === 'github') startGithub(); // connect live
    return { status: connections.status(id) };
  });
  app.delete('/api/connections/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!CONNECTOR_BY_ID[id]) return reply.code(404).send({ error: 'unknown connector' });
    connections.remove(id);
    if (id === 'github') startGithub();
    return { status: connections.status(id) };
  });

  // Prompt library (custom entries). Token-gated like connections — a user's saved
  // prompts aren't world-readable. Built-ins are served from the client bundle.
  app.get('/api/prompts', async (req, reply) => {
    if (!requireToken(req, reply)) return undefined;
    return { prompts: prompts.list() };
  });
  app.post('/api/prompts', async (req, reply) => {
    if (!requireToken(req, reply)) return undefined;
    try {
      return { prompt: prompts.upsert(req.body ?? {}) };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  app.delete('/api/prompts/:id', async (req, reply) => {
    if (!requireToken(req, reply)) return undefined;
    const id = (req.params as { id: string }).id;
    if (!prompts.remove(id)) return reply.code(404).send({ error: 'unknown prompt' });
    return { ok: true };
  });

  return {
    app,
    bus,
    scanner,
    github,
    sysmon,
    health,
    runner,
    close: async () => {
      scanner?.stop();
      github?.stop();
      sysmon?.stop();
      health?.stop();
      tokens.stop();
      scheduler?.stop();
      runner.stop();
      await app.close();
      sqlite.close();
    },
  };
}
