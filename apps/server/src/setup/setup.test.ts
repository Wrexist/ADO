import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { REQUIREMENT_BY_ID, type Requirement } from '@ado/shared';
import { buildServer, type AccServer } from '../app';
import { probeOne, probeAll, type ProbeContext, type Capabilities } from './probe';
import { installCommandFor } from './install';

const TS = '2026-07-12T00:00:00.000Z';
const CTX = (over: Partial<ProbeContext> = {}): ProbeContext => ({
  connectionConnected: () => false,
  envHas: () => false,
  ...over,
});
const CAPS = (over: Partial<Capabilities> = {}): Capabilities => ({ code: false, brew: false, claude: false, ...over });

describe('setup probe — honest detection', () => {
  it('detects an installed command with a version (node is always present in the test runner)', async () => {
    const r = await probeOne(REQUIREMENT_BY_ID.node, CTX(), TS, CAPS());
    expect(r.status).toBe('installed');
    expect(r.version).toMatch(/\d+\.\d+\.\d+/);
  });

  it('reports a missing command as missing, never a hopeful installed', async () => {
    const fake: Requirement = {
      id: 'x', name: 'X', category: 'cli', required: false, blurb: '', why: '',
      detect: { via: 'command', command: 'definitely-not-a-real-binary-xyz', args: ['--version'] },
      install: { via: 'manual' },
    };
    const r = await probeOne(fake, CTX(), TS, CAPS());
    expect(r.status).toBe('missing');
    expect(r.version).toBeNull();
    expect(r.installable).toBe(false);
  });

  it('env detector reflects whether the running server has the var', async () => {
    expect((await probeOne(REQUIREMENT_BY_ID['project-dirs'], CTX({ envHas: () => true }), TS, CAPS())).status).toBe('installed');
    expect((await probeOne(REQUIREMENT_BY_ID['project-dirs'], CTX({ envHas: () => false }), TS, CAPS())).status).toBe('missing');
  });

  it('connection detector reflects the connections store', async () => {
    expect((await probeOne(REQUIREMENT_BY_ID['github-token'], CTX({ connectionConnected: () => true }), TS, CAPS())).status).toBe('installed');
    expect((await probeOne(REQUIREMENT_BY_ID['github-token'], CTX(), TS, CAPS())).status).toBe('missing');
  });

  it('a manual requirement is always "manual" (never faked as installed)', async () => {
    const manual: Requirement = {
      id: 'm', name: 'M', category: 'config', required: false, blurb: '', why: '',
      detect: { via: 'manual' }, install: { via: 'manual' },
    };
    const r = await probeOne(manual, CTX(), TS, CAPS());
    expect(r.status).toBe('manual');
    expect(r.installable).toBe(false);
  });

  it('a brew requirement is installable only when Homebrew is present', async () => {
    expect((await probeOne(REQUIREMENT_BY_ID.git, CTX(), TS, CAPS({ brew: true }))).installable).toBe(true);
    expect((await probeOne(REQUIREMENT_BY_ID.git, CTX(), TS, CAPS({ brew: false }))).installable).toBe(false);
  });

  it('probeAll returns exactly one result per catalog entry', async () => {
    const results = await probeAll(CTX());
    expect(results.length).toBe(Object.keys(REQUIREMENT_BY_ID).length);
    expect(results.find((r) => r.id === 'node')?.status).toBe('installed');
  });
});

describe('installCommandFor — allow-listed, id-derived, capability-gated (never client input)', () => {
  it('npm-global → npm install -g <package>', () => {
    expect(installCommandFor(REQUIREMENT_BY_ID['claude-cli'], CAPS())).toEqual({
      cmd: 'npm', args: ['install', '-g', '@anthropic-ai/claude-code'],
    });
  });

  it('brew formula → brew install <formula>, only with Homebrew', () => {
    expect(installCommandFor(REQUIREMENT_BY_ID.git, CAPS({ brew: true }))).toEqual({ cmd: 'brew', args: ['install', 'git'] });
    expect(installCommandFor(REQUIREMENT_BY_ID.git, CAPS({ brew: false }))).toBeNull();
  });

  it('brew cask → brew install --cask <cask>', () => {
    expect(installCommandFor(REQUIREMENT_BY_ID.vscode, CAPS({ brew: true }))).toEqual({
      cmd: 'brew', args: ['install', '--cask', 'visual-studio-code'],
    });
  });

  it('vscode-ext installs only when the code CLI is present; else null (guided)', () => {
    expect(installCommandFor(REQUIREMENT_BY_ID['vscode-claude'], CAPS({ code: true }))).toEqual({
      cmd: 'code', args: ['--install-extension', 'anthropic.claude-code'],
    });
    expect(installCommandFor(REQUIREMENT_BY_ID['vscode-claude'], CAPS({ code: false }))).toBeNull();
  });

  it('claude sign-in → claude auth login, only with the claude CLI present', () => {
    expect(installCommandFor(REQUIREMENT_BY_ID['claude-login'], CAPS({ claude: true }))).toEqual({
      cmd: 'claude', args: ['auth', 'login'],
    });
    expect(installCommandFor(REQUIREMENT_BY_ID['claude-login'], CAPS({ claude: false }))).toBeNull();
  });

  it('a manual requirement is never auto-installable', () => {
    expect(installCommandFor(REQUIREMENT_BY_ID.node, CAPS({ brew: true, code: true, claude: true }))).toBeNull();
  });
});

describe('setup endpoints', () => {
  const ENV = { port: 8788, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
  const HOST = { host: '127.0.0.1:8788' };
  const AUTH = { ...HOST, 'x-acc-token': 'test-token' };
  let srv: AccServer;
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('GET /api/setup is token-gated (status is not world-readable)', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/setup', headers: HOST })).statusCode).toBe(401);
    const ok = await srv.app.inject({ method: 'GET', url: '/api/setup', headers: AUTH });
    expect(ok.statusCode).toBe(200);
    expect(Array.isArray(ok.json().results)).toBe(true);
  });

  it('POST /api/setup/install rejects an unknown id (404) and a non-auto-installable one (400)', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/setup/install', headers: AUTH, payload: { id: 'nope' } })).statusCode).toBe(404);
    const manual = await srv.app.inject({ method: 'POST', url: '/api/setup/install', headers: AUTH, payload: { id: 'node' } });
    expect(manual.statusCode).toBe(400); // node is a manual install — not auto-installable
  });

  it('POST /api/setup/install requires the token', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/setup/install', headers: HOST, payload: { id: 'claude-cli' } })).statusCode).toBe(401);
  });
});
