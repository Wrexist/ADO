/**
 * Server factory (Prompt 2.1): security → bus → routes. Split from index.ts so
 * tests can build an app against :memory: without binding a port.
 */
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { openDb } from './db';
import type { Env } from './env';
import { Bus } from './bus';
import { registerSecurity, sseAuthorized } from './security';
import { seedDemo } from './demo';
import { Scanner } from './scanner';
import { GitHubSync } from './integrations/github/sync';
import { OctokitClient } from './integrations/github/client';
import type { GitHubClient } from './integrations/github/types';
import { Sysmon } from './system/sysmon';
import { HealthChecker } from './system/health';

export interface AccServer {
  app: FastifyInstance;
  bus: Bus;
  scanner: Scanner | null;
  github: GitHubSync | null;
  sysmon: Sysmon | null;
  health: HealthChecker | null;
  close: () => Promise<void>;
}

/** Injectable deps (tests + local demos supply a fake GitHub backend). */
export interface AccDeps {
  githubClient?: GitHubClient;
  /** Tests set false to skip the real sysmon/health background loops. */
  startSystem?: boolean;
}

export async function buildServer(env: Env, deps: AccDeps = {}): Promise<AccServer> {
  const { db, sqlite } = openDb(env.dbPath);
  const app = Fastify({ logger: env.dbPath !== ':memory:' });

  const bus = new Bus(db);
  bus.replayFromDb((msg) => app.log.warn(msg));

  await app.register(cors, {
    origin: env.webOrigin, // exactly one origin — no wildcards
    methods: ['GET', 'POST', 'OPTIONS'],
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

  // Real data source: scan configured project dirs (skipped in demo/no-dirs runs).
  let scanner: Scanner | null = null;
  if (!env.demo && env.projectDirs.length > 0) {
    scanner = new Scanner(bus, env.projectDirs, (msg) => app.log.info(msg));
    void scanner.start().catch((err) => app.log.error(err));
  }

  // GitHub enrichment: on when a token is configured (or a client is injected).
  let github: GitHubSync | null = null;
  if (!env.demo && (env.githubToken || deps.githubClient)) {
    const client = deps.githubClient ?? new OctokitClient(env.githubToken);
    github = new GitHubSync(bus, client, (msg) => app.log.info(msg));
    github.start();
  }

  // System layer: real CPU/mem/net sampling + health checks (real mode only; demo
  // seeds deterministic samples/health for the frozen baseline world).
  let sysmon: Sysmon | null = null;
  let health: HealthChecker | null = null;
  if (!env.demo && deps.startSystem !== false) {
    sysmon = new Sysmon(bus, (msg) => app.log.warn(msg));
    sysmon.start();
    health = new HealthChecker(bus, process.env.ANTHROPIC_API_KEY ?? '', (msg) => app.log.info(msg));
    health.start();
  }

  return {
    app,
    bus,
    scanner,
    github,
    sysmon,
    health,
    close: async () => {
      scanner?.stop();
      github?.stop();
      sysmon?.stop();
      health?.stop();
      await app.close();
      sqlite.close();
    },
  };
}
