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
import { seedDemo } from './demo';
import { Scanner } from './scanner';
import { GitHubSync } from './integrations/github/sync';
import { OctokitClient } from './integrations/github/client';
import type { GitHubClient } from './integrations/github/types';
import { Sysmon } from './system/sysmon';
import { HealthChecker } from './system/health';
import { Runner } from './runner';
import { ClaudeSpawner, type Spawner } from './runner/spawner';

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
  const app = Fastify({ logger: env.dbPath !== ':memory:' });

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
    phase: 2,
    seq: bus.snapshot().seq,
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
    req.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
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
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    supabase: 'SUPABASE_ACCESS_TOKEN',
    vercel: 'VERCEL_TOKEN',
    netlify: 'NETLIFY_TOKEN',
    figma: 'FIGMA_TOKEN',
  };
  const connectionsPath =
    env.dbPath === ':memory:'
      ? join(tmpdir(), `acc-conn-${process.pid}.json`)
      : join(dirname(env.dbPath), 'connections.json');
  const connections = new ConnectionsStore(connectionsPath, (id) => {
    const key = ENV_FALLBACK[id];
    return key ? process.env[key] : undefined;
  });

  // Real data source: scan configured project dirs (skipped in demo/no-dirs runs).
  let scanner: Scanner | null = null;
  if (!env.demo && env.projectDirs.length > 0) {
    scanner = new Scanner(bus, env.projectDirs, (msg) => app.log.info(msg));
    void scanner.start().catch((err) => app.log.error(err));
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

  // Runner: dispatch headless agents. cwd allow-list comes from the scanner (only
  // scanned repos are dispatchable); demo maps ids straight through for the sim agent.
  const runner = new Runner(
    bus,
    db,
    deps.spawner ?? new ClaudeSpawner(),
    {
      cwdFor: (id) => (scanner ? scanner.cwdFor(id) : bus.snapshot().state.repos[id] ? `/repos/${id}` : null),
    },
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

  // System layer: real CPU/mem/net sampling + health checks (real mode only; demo
  // seeds deterministic samples/health for the frozen baseline world).
  let sysmon: Sysmon | null = null;
  let health: HealthChecker | null = null;
  if (!env.demo && deps.startSystem !== false) {
    sysmon = new Sysmon(bus, (msg) => app.log.warn(msg));
    sysmon.start();
    health = new HealthChecker(bus, () => connections.resolve('anthropic') ?? '', (msg) => app.log.info(msg));
    health.start();
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
      runner.stop();
      await app.close();
      sqlite.close();
    },
  };
}
