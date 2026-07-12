import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AccServer } from '../app';
import { buildServer } from '../app';
import { ProjectDirsStore } from './store';

describe('ProjectDirsStore', () => {
  let file: string;
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'acc-pds-'));
    file = join(dir, 'project-dirs.json');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('adds, dedupes, lists, and persists', () => {
    const s = new ProjectDirsStore(file);
    s.add('/a');
    s.add('/a'); // dedupe
    s.add('/b');
    expect(s.list()).toEqual(['/a', '/b']);
    // a fresh store reads the persisted file
    expect(new ProjectDirsStore(file).list()).toEqual(['/a', '/b']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['/a', '/b']);
  });

  it('rejects an empty path and removes a dir', () => {
    const s = new ProjectDirsStore(file);
    expect(() => s.add('   ')).toThrow(/empty/);
    s.remove('/a');
    expect(s.list()).toEqual(['/b']);
  });
});

const ENV = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
const AUTH = { host: '127.0.0.1:8787', 'x-acc-token': 'test-token' };

describe('POST /api/projects (add a folder to scan, token-gated)', () => {
  let srv: AccServer;
  const temps: string[] = [];
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  });
  afterEach(() => {
    // keep the per-pid store from leaking added dirs across cases
    for (const t of temps) srv.app.inject({ method: 'DELETE', url: '/api/projects', headers: AUTH, payload: { dir: t } });
  });

  it('refuses without the token', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/projects', headers: { host: '127.0.0.1:8787' }, payload: { dir: '/x' } });
    expect(res.statusCode).toBe(401);
  });

  it('400s a missing or non-existent folder (no fabricated success)', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/projects', headers: AUTH, payload: {} })).statusCode).toBe(400);
    const res = await srv.app.inject({ method: 'POST', url: '/api/projects', headers: AUTH, payload: { dir: '/no/such/folder/xyz' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not found/);
  });

  it('adds a real folder, persists it, and lists it', async () => {
    const t = mkdtempSync(join(tmpdir(), 'acc-proj-'));
    temps.push(t);
    mkdirSync(join(t, 'sub'), { recursive: true }); // an empty subdir → 0 git repos, still valid
    const add = await srv.app.inject({ method: 'POST', url: '/api/projects', headers: AUTH, payload: { dir: t } });
    expect(add.statusCode).toBe(200);
    expect(add.json().dirs).toContain(t);
    const list = await srv.app.inject({ method: 'GET', url: '/api/projects', headers: AUTH });
    expect(list.json().dirs).toContain(t);
  });
});
