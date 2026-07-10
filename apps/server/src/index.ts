/**
 * AI Control Center — server entry. Binds 127.0.0.1 ONLY (never 0.0.0.0).
 * `--demo` seeds deterministic fixture events (the P3.5 baseline world).
 */
import { loadEnv } from './env';
import { buildServer } from './app';

const env = loadEnv();
const { app } = await buildServer(env);

app
  .listen({ port: env.port, host: '127.0.0.1' })
  .then(() => app.log.info(`AI Control Center server ready at http://127.0.0.1:${env.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
