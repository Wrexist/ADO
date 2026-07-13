/**
 * AI Control Center — server entry. Binds 127.0.0.1 ONLY (never 0.0.0.0).
 * `--demo` seeds deterministic fixture events (the P3.5 baseline world).
 */
import { loadEnv } from './env';
import { buildServer } from './app';

const env = loadEnv();
const server = await buildServer(env);
const { app, incidents } = server;

// Resilience: a stray rejection or a thrown async path must not take the dashboard down. Capture
// it as an incident (the AI/heuristic diagnoser explains WHY + how to fix), then keep running —
// the app degrades, it doesn't crash. Only wired here (the real entry); tests build the app
// directly and never install process-global hooks.
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  app.log.error({ err }, 'unhandledRejection');
  incidents.report({ source: 'server', kind: 'unhandledRejection', message: err.message, stack: err.stack });
});
process.on('uncaughtException', (err) => {
  // Deliberately do NOT exit: for a local-first personal dashboard, staying up (degraded) beats
  // dying. We log loudly, diagnose, and continue.
  app.log.error({ err }, 'uncaughtException');
  incidents.report({ source: 'server', kind: 'uncaughtException', message: err.message, stack: err.stack });
});

app
  .listen({ port: env.port, host: '127.0.0.1' })
  .then(() => app.log.info(`AI Control Center server ready at http://127.0.0.1:${env.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
