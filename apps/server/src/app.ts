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

export interface AccServer {
  app: FastifyInstance;
  bus: Bus;
  close: () => Promise<void>;
}

export async function buildServer(env: Env): Promise<AccServer> {
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

    const send = (seq: number, event: string, data: unknown) =>
      reply.raw.write(`id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const lastIdHeader = req.headers['last-event-id'];
    const lastId = typeof lastIdHeader === 'string' ? Number.parseInt(lastIdHeader, 10) : NaN;
    const snap = bus.snapshot();

    if (Number.isFinite(lastId) && lastId <= snap.seq) {
      // resume path: replay only the gap
      for (const { seq, evt } of bus.eventsSince(lastId)) send(seq, 'evt', evt);
    } else {
      // fresh path: authoritative snapshot
      send(snap.seq, 'snapshot', snap);
    }

    const unsubscribe = bus.subscribe((seq, evt) => send(seq, 'evt', evt));
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

  return {
    app,
    bus,
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
