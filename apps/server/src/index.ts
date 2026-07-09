/**
 * AI Control Center — server (Phase 0 skeleton).
 *
 * Phase 0 proves the toolchain: /health + a read-only SSE stub. The real event bus,
 * SQLite persistence, scanner, GitHub sync, sysmon and runner land in Phases 2–3
 * (see ROADMAP.md). Security guardrail: binds 127.0.0.1 only; mutating endpoints will
 * require X-ACC-Token from Phase 2 — there are none yet.
 */
import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = '127.0.0.1'; // localhost only — never 0.0.0.0 (GOALS guardrail 5)

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  status: 'ok',
  phase: 0,
  ts: new Date().toISOString(),
}));

// Read-only SSE stub. Phase 2 replaces the placeholder frame with real bus events.
app.get('/events', (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  reply.raw.write(
    `event: hello\ndata: ${JSON.stringify({
      phase: 0,
      note: 'SSE stub — live events arrive in Phase 2',
    })}\n\n`,
  );

  const ping = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
  request.raw.on('close', () => clearInterval(ping));
});

app
  .listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`AI Control Center server ready at http://${HOST}:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
