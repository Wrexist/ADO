import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PortfolioSnapshot } from '@ado/shared';
import { buildServer, type AccServer } from '../app';

it('authenticates registry reads/writes, supports browser PUT, and persists explicit import without changing dispatch policy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-registry-api-'));
  const repo = join(root, 'fixture'); mkdirSync(repo);
  let server: AccServer | undefined;
  const host = { host: '127.0.0.1:8787' };
  const auth = { ...host, 'x-acc-token': 'registry-fixture-key' };
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: auth['x-acc-token'], dbPath: join(root, 'profile.sqlite'), projectDirs: [repo], demo: false };
  try {
    execFileSync('git', ['init', '-q', repo], { stdio: 'ignore' });
    writeFileSync(join(repo, 'TASK.md'), 'Preserve original task');
    server = await buildServer(env, { startSystem: false });
    const app = server.app;
    expect((await app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { dir: repo } })).statusCode).toBe(200);
    const snapshot = async () => PortfolioSnapshot.parse((await app.inject({ url: '/api/portfolio', headers: auth })).json());
    const create = { name: 'API product', kind: 'app', goal: 'User-owned goal', lifecycle: 'active', focus: true, manualPriority: 2 };
    expect((await app.inject({ url: '/api/portfolio', headers: host })).statusCode).toBe(401);
    for (const [method, url] of [['POST', '/api/portfolio/projects'], ['PUT', '/api/portfolio/projects/unknown'], ['POST', '/api/portfolio/import']] as const) {
      expect((await app.inject({ method, url, headers: host, payload: {} })).statusCode).toBe(401);
    }
    const cors = await app.inject({ method: 'OPTIONS', url: '/api/portfolio/projects/unknown', headers: { ...host, origin: env.webOrigin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,x-acc-token' } });
    expect(cors.statusCode).toBe(204);
    expect(cors.headers['access-control-allow-methods']).toContain('PUT');
    expect((await snapshot()).projects).toHaveLength(0);
    expect((await app.inject({ method: 'POST', url: '/api/portfolio/projects', headers: auth, payload: { ...create, enableAgents: true } })).statusCode).toBe(400);
    const response = await app.inject({ method: 'POST', url: '/api/portfolio/projects', headers: auth, payload: create });
    expect(response.statusCode).toBe(200);
    const project = response.json().project;
    const current = await snapshot();
    const source = current.sources.find((s) => s.kind === 'local');
    expect(source).toBeDefined();
    const scannerId = source!.id.slice(6);
    expect((await app.inject({ method: 'POST', url: `/api/projects/${scannerId}/settings`, headers: auth, payload: { feature: 'agents', enabled: false } })).statusCode).toBe(200);
    const settings = async () => (await app.inject({ url: `/api/projects/${scannerId}/settings`, headers: auth })).json();
    const settingsBefore = await settings();
    const body = { projectId: project.id, sourceId: source!.id };
    const imported = await app.inject({ method: 'POST', url: '/api/portfolio/import', headers: auth, payload: body });
    expect(imported.statusCode, imported.body).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/portfolio/import', headers: auth, payload: body })).json()).toEqual(imported.json());
    const updated = await app.inject({ method: 'PUT', url: `/api/portfolio/projects/${project.id}`, headers: auth, payload: { ...create, name: 'Edited product', version: project.version } });
    expect(updated.statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/portfolio/projects/${project.id}`, headers: auth, payload: { ...create, version: project.version } })).statusCode).toBe(409);
    expect(await settings()).toEqual(settingsBefore);
    expect((await app.inject({ url: '/api/runs', headers: auth })).json().runs).toEqual([]);
    expect(readFileSync(join(repo, 'TASK.md'), 'utf8')).toBe('Preserve original task');
    const saved = await snapshot();
    expect(saved.projects[0]).toMatchObject({ id: project.id, name: 'Edited product', version: 2 });
    expect(saved.repositories).toHaveLength(1); expect(saved.checkouts).toHaveLength(1);
    await server.close(); server = undefined;
    server = await buildServer(env, { startSystem: false });
    const reopened = PortfolioSnapshot.parse((await server.app.inject({ url: '/api/portfolio', headers: auth })).json());
    expect(reopened.projects).toEqual(saved.projects);
    expect(reopened.repositories).toEqual(saved.repositories);
    expect(reopened.checkouts).toEqual(saved.checkouts);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 120000);
