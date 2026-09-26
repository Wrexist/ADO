import { buildServer } from '../apps/server/src/app.ts';
import { resolve } from 'node:path';
const port = Number(process.env.PORT);
const server = await buildServer({ port, accToken: process.env.ACC_TOKEN!, webOrigin: `http://127.0.0.1:${port}`, dbPath: ':memory:', demo: true, projectDirs: [], serveWebDir: resolve('apps/web/dist') }, { startSystem: false });
await server.app.listen({ port, host: '127.0.0.1' });
process.on('SIGTERM', () => { void server.close().then(() => process.exit(0)); });
