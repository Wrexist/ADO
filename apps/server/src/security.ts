/**
 * Security layer (gate p2 criteria, council S0/B3):
 * - Host-header allow-list on EVERY route incl. /events — the actual DNS-rebinding
 *   defense (a rebound page is same-origin, so CORS alone cannot help).
 * - X-ACC-Token required on all mutating methods.
 * - /events (SSE) carries the token via query param (EventSource cannot set headers).
 * - CORS locked to the single web origin (registered in app.ts).
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from './env';

export function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function registerSecurity(app: FastifyInstance, env: Env): void {
  const allowedHosts = new Set([
    `127.0.0.1:${env.port}`,
    `localhost:${env.port}`,
    '127.0.0.1',
    'localhost',
  ]);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // 1. Host allow-list — everything, including SSE.
    const host = (req.headers.host ?? '').toLowerCase();
    if (!allowedHosts.has(host)) {
      return reply.code(403).send({ error: 'forbidden host' });
    }

    // 2. Token on every mutating method.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const presented = req.headers['x-acc-token'];
      if (!tokenMatches(env.accToken, typeof presented === 'string' ? presented : undefined)) {
        return reply.code(401).send({ error: 'missing or invalid X-ACC-Token' });
      }
    }
  });
}

/** SSE token check — query param or header (used inside the /events route). */
export function sseAuthorized(env: Env, req: FastifyRequest): boolean {
  const q = (req.query as Record<string, unknown>).token;
  const h = req.headers['x-acc-token'];
  return (
    tokenMatches(env.accToken, typeof q === 'string' ? q : undefined) ||
    tokenMatches(env.accToken, typeof h === 'string' ? h : undefined)
  );
}
