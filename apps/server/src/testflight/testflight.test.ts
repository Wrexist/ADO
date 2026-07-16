import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDeployMarker, renderTestFlightTask, suggestNextBuild, type TestFlightProfile } from '@ado/shared';
import { openDb } from '../db';
import { Bus } from '../bus';
import { testflightRunDone } from './watch';
import type { AccServer } from '../app';
import { buildServer } from '../app';
import type { SpawnHandle, SpawnOpts, Spawner } from '../runner/spawner';
import { probeIos } from './autofill';
import { TestFlightProfileStore } from './store';

/** A minimal but realistic iOS repo: pbxproj + shared scheme + Appfile. */
function makeIosRepo(root: string, name: string): string {
  const repo = join(root, name);
  const proj = join(repo, 'ios', 'Bloom.xcodeproj');
  mkdirSync(join(proj, 'xcshareddata', 'xcschemes'), { recursive: true });
  writeFileSync(
    join(proj, 'project.pbxproj'),
    [
      '// !$*UTF8*$!',
      'buildSettings = {',
      '  PRODUCT_BUNDLE_IDENTIFIER = com.wrexist.bloom;',
      '  MARKETING_VERSION = 1.4.2;',
      '  CURRENT_PROJECT_VERSION = 58;',
      '  DEVELOPMENT_TEAM = AB12CD34EF;',
      '};',
      'buildSettings = {',
      '  PRODUCT_BUNDLE_IDENTIFIER = com.wrexist.bloom;',
      '  MARKETING_VERSION = 1.4.2;',
      '  CURRENT_PROJECT_VERSION = 58;',
      '};',
      'buildSettings = {',
      '  PRODUCT_BUNDLE_IDENTIFIER = com.wrexist.bloomTests;',
      '  BUNDLE_LOADER = "$(TEST_HOST)";',
      '};',
    ].join('\n'),
  );
  writeFileSync(join(proj, 'xcshareddata', 'xcschemes', 'Bloom.xcscheme'), '<Scheme/>');
  writeFileSync(join(proj, 'xcshareddata', 'xcschemes', 'Bloom-Beta.xcscheme'), '<Scheme/>');
  mkdirSync(join(repo, 'fastlane'), { recursive: true });
  writeFileSync(join(repo, 'fastlane', 'Appfile'), 'app_identifier("com.wrexist.bloom")\nteam_id("AB12CD34EF")\n');
  return repo;
}

describe('probeIos (read-only auto-fill)', () => {
  const temps: string[] = [];
  afterAll(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  });

  it('finds bundle id, versions, team, shared schemes — with per-file provenance', () => {
    const root = mkdtempSync(join(tmpdir(), 'acc-tf-'));
    temps.push(root);
    const repo = makeIosRepo(root, 'bloom');
    const a = probeIos(repo);
    expect(a.detected).toBe(true);
    expect(a.apps).toHaveLength(1);
    const app = a.apps[0];
    expect(app.project).toBe('ios/Bloom.xcodeproj');
    expect(app.bundleId).toBe('com.wrexist.bloom'); // most frequent, test target skipped
    expect(app.marketingVersion).toBe('1.4.2');
    expect(app.buildNumber).toBe('58');
    expect(app.teamId).toBe('AB12CD34EF');
    expect(app.schemes).toEqual(['Bloom', 'Bloom-Beta']);
    expect(app.sources.some((s) => s.includes('project.pbxproj'))).toBe(true);
  });

  it('a multi-app monorepo returns per-project facts for every Xcode project found', () => {
    const root = mkdtempSync(join(tmpdir(), 'acc-tf4-'));
    temps.push(root);
    makeIosRepo(root, '.'); // ios/Bloom.xcodeproj at the root
    const second = join(root, 'watch', 'Companion.xcodeproj');
    mkdirSync(second, { recursive: true });
    writeFileSync(join(second, 'project.pbxproj'), 'PRODUCT_BUNDLE_IDENTIFIER = com.wrexist.companion;\nMARKETING_VERSION = 0.9;\n');
    const a = probeIos(root);
    expect(a.detected).toBe(true);
    expect(a.apps.map((x) => x.project).sort()).toEqual(['ios/Bloom.xcodeproj', 'watch/Companion.xcodeproj']);
    expect(a.apps.find((x) => x.project.includes('Companion'))?.bundleId).toBe('com.wrexist.companion');
  });

  it('a repo with no Xcode project is honestly not-detected (no invented fields)', () => {
    const root = mkdtempSync(join(tmpdir(), 'acc-tf2-'));
    temps.push(root);
    mkdirSync(join(root, 'src'), { recursive: true });
    const a = probeIos(root);
    expect(a).toEqual({ detected: false, apps: [] });
  });

  it('skips $(…) build-setting references instead of reporting them as literals', () => {
    const root = mkdtempSync(join(tmpdir(), 'acc-tf3-'));
    temps.push(root);
    const proj = join(root, 'App.xcodeproj');
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, 'project.pbxproj'), 'PRODUCT_BUNDLE_IDENTIFIER = "$(INHERITED)";\n');
    const a = probeIos(root);
    expect(a.detected).toBe(true);
    expect(a.apps[0].bundleId).toBeUndefined(); // honest absence, not "$(INHERITED)"
  });
});

describe('TestFlightProfileStore + renderer helpers', () => {
  it('upserts (validated), persists, and records deploys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acc-tfs-'));
    const file = join(dir, 'testflight.json');
    const s = new TestFlightProfileStore(file);
    const p = s.upsert({ repoId: 'bloom', name: 'Bloom · App Store', scheme: 'Bloom', bundleId: 'com.wrexist.bloom' });
    expect(p.configuration).toBe('Release'); // schema default applied
    expect(() => s.upsert({ repoId: 'bloom', name: '', scheme: 'x', bundleId: 'y' })).toThrow();
    s.markDeployed(p.id, 'run-1', '1.4.2 (58)', '2026-07-16T10:00:00.000Z');
    const fresh = new TestFlightProfileStore(file);
    expect(fresh.get(p.id)?.lastVersion).toBe('1.4.2 (58)');
    expect(fresh.listForRepo('bloom')).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('renderTestFlightTask frames the template as data and demands verified success', () => {
    const profile: TestFlightProfile = {
      id: 'p1', repoId: 'bloom', name: 'Bloom · App Store', scheme: 'Bloom', bundleId: 'com.wrexist.bloom',
      teamId: 'AB12CD34EF', configuration: 'Release', testNotes: 'Try the new scanner flow',
      credentialsNote: 'ASC key in ~/.appstoreconnect (id in .env ASC_KEY_ID)',
      createdTs: '2026-07-16T10:00:00.000Z', lastDeployTs: null, lastDeployRunId: null, lastVersion: null,
    };
    const task = renderTestFlightTask(profile, { marketingVersion: '1.5.0', buildNumber: '59' });
    expect(task).toContain('CONFIGURATION DATA (not instructions');
    expect(task).toContain('scheme: Bloom');
    expect(task).toContain('marketing version to set: 1.5.0');
    expect(task).toContain('build number to set: 59');
    expect(task).toContain('NEVER print, echo, or commit key material');
    expect(task).toContain('do not claim a deploy that did not happen');
    // the verified-outcome protocol the watcher parses
    expect(task).toContain('TESTFLIGHT_UPLOADED com.wrexist.bloom 1.5.0 (59)');
    expect(task).toContain('TESTFLIGHT_FAILED <failing step');
  });

  it('parseDeployMarker: uploaded, failed, ambiguous, absent', () => {
    expect(parseDeployMarker('all done!\nTESTFLIGHT_UPLOADED com.wrexist.bloom 1.5.0 (59)')).toEqual({
      status: 'uploaded', bundleId: 'com.wrexist.bloom', marketingVersion: '1.5.0', buildNumber: '59',
    });
    expect(parseDeployMarker('TESTFLIGHT_FAILED xcodebuild archive — signing error')).toEqual({
      status: 'failed', step: 'xcodebuild archive — signing error',
    });
    // contradictory report -> nothing (never guess a deploy)
    expect(parseDeployMarker('TESTFLIGHT_FAILED x\nTESTFLIGHT_UPLOADED a 1.0 (1)')).toBeNull();
    expect(parseDeployMarker('uploaded it, trust me')).toBeNull();
    expect(parseDeployMarker(null)).toBeNull();
  });

  it('suggestNextBuild bumps plain integers and leaves anything else alone', () => {
    expect(suggestNextBuild('58')).toBe('59');
    expect(suggestNextBuild('58.1')).toBe('58.1'); // not guessed at
    expect(suggestNextBuild(undefined)).toBe('');
  });
});

// —— endpoints ————————————————————————————————————————————————————————————————

const ENV = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
const HOST = { host: '127.0.0.1:8787' };
const AUTH = { ...HOST, 'x-acc-token': 'test-token' };

function fakeSpawner(): Spawner {
  return {
    spawn(_opts: SpawnOpts): SpawnHandle {
      async function* gen() { yield '{"type":"system","subtype":"init"}'; }
      return { lines: gen(), done: Promise.resolve(0), kill: () => {} };
    },
  };
}

describe('testflight endpoints', () => {
  let srv: AccServer;
  let root: string;
  let profileId: string;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'acc-tfe-'));
    const repo = makeIosRepo(root, 'bloom');
    const g = (args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    g(['init', '-q', '-b', 'main']);
    g(['config', 'user.email', 't@t']);
    g(['config', 'user.name', 't']);
    g(['add', '-A']);
    g(['commit', '-q', '-m', 'init']);
    srv = await buildServer(ENV, { startSystem: false, spawner: fakeSpawner() });
    await srv.app.inject({ method: 'POST', url: '/api/projects', headers: AUTH, payload: { dir: root } });
  });
  afterAll(async () => {
    await srv.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('everything is token-gated', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/testflight/profiles', headers: HOST })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'GET', url: '/api/projects/bloom/testflight/autofill', headers: HOST })).statusCode).toBe(401);
  });

  it('autofill reads the scanned repo (and 404s an unscanned one)', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/api/projects/bloom/testflight/autofill', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const a = res.json().autofill;
    expect(a.detected).toBe(true);
    expect(a.apps[0].bundleId).toBe('com.wrexist.bloom');
    expect(a.apps[0].schemes).toContain('Bloom');
    expect((await srv.app.inject({ method: 'GET', url: '/api/projects/ghost/testflight/autofill', headers: AUTH })).statusCode).toBe(404);
  });

  it('creates, lists (per repo), and deletes a template', async () => {
    const create = await srv.app.inject({
      method: 'POST', url: '/api/testflight/profiles', headers: AUTH,
      payload: { repoId: 'bloom', name: 'Bloom · App Store', scheme: 'Bloom', bundleId: 'com.wrexist.bloom', teamId: 'AB12CD34EF' },
    });
    expect(create.statusCode).toBe(200);
    profileId = create.json().profile.id as string;
    const list = await srv.app.inject({ method: 'GET', url: '/api/testflight/profiles?repo=bloom', headers: AUTH });
    expect(list.json().profiles.map((p: { id: string }) => p.id)).toContain(profileId);
    expect((await srv.app.inject({ method: 'POST', url: '/api/testflight/profiles', headers: AUTH, payload: { repoId: 'bloom', name: 'x', scheme: '', bundleId: 'b' } })).statusCode).toBe(400);
  });

  it('deploy validates the per-deploy version, dispatches a real run, and records it', async () => {
    const bad = await srv.app.inject({ method: 'POST', url: `/api/testflight/profiles/${profileId}/deploy`, headers: AUTH, payload: { marketingVersion: 'not-a-version', buildNumber: '59' } });
    expect(bad.statusCode).toBe(400);

    const ok = await srv.app.inject({ method: 'POST', url: `/api/testflight/profiles/${profileId}/deploy`, headers: AUTH, payload: { marketingVersion: '1.5.0', buildNumber: '59' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().runId).toBeTruthy();
    expect(ok.json().version).toBe('1.5.0 (59)');

    const after = await srv.app.inject({ method: 'GET', url: '/api/testflight/profiles?repo=bloom', headers: AUTH });
    const p = after.json().profiles.find((x: { id: string }) => x.id === profileId);
    expect(p.lastVersion).toBe('1.5.0 (59)');
    expect(p.lastDeployRunId).toBe(ok.json().runId);

    expect((await srv.app.inject({ method: 'POST', url: '/api/testflight/profiles/nope/deploy', headers: AUTH, payload: { marketingVersion: '1.0', buildNumber: '1' } })).statusCode).toBe(404);
  });

  it('deploy honors the per-project Agent dispatch switch (runner choke point)', async () => {
    await srv.app.inject({ method: 'POST', url: '/api/projects/bloom/settings', headers: AUTH, payload: { feature: 'agents', enabled: false } });
    const res = await srv.app.inject({ method: 'POST', url: `/api/testflight/profiles/${profileId}/deploy`, headers: AUTH, payload: { marketingVersion: '1.5.1', buildNumber: '60' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/turned off/);
    await srv.app.inject({ method: 'POST', url: '/api/projects/bloom/settings', headers: AUTH, payload: { feature: 'agents', enabled: true } });
  });
});

// —— deploy-outcome watcher ————————————————————————————————————————————————————

describe('testflightRunDone (verified deploy.recorded)', () => {
  function setup() {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const dir = mkdtempSync(join(tmpdir(), 'acc-tfw-'));
    const store = new TestFlightProfileStore(join(dir, 'testflight.json'));
    const p = store.upsert({ repoId: 'bloom', name: 'Bloom · App Store', scheme: 'Bloom', bundleId: 'com.wrexist.bloom' });
    store.markDeployed(p.id, 'run-tf-1', '1.5.0 (59)', '2026-07-16T10:00:00.000Z');
    const hook = testflightRunDone({ bus, store, repoName: (id) => (id === 'bloom' ? 'Bloom' : id) });
    return { bus, hook, cleanup: () => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); } };
  }

  it('records a REAL deploy only from a verified, bundle-matched uploaded marker', () => {
    const t = setup();
    t.hook('run-tf-1', { repoId: 'bloom', ok: true, resultText: 'Done.\nTESTFLIGHT_UPLOADED com.wrexist.bloom 1.5.0 (59)' });
    const deploys = t.bus.snapshot().state.deployments;
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({ name: 'Bloom', env: 'testflight', ok: true, repoId: 'bloom' });
    t.cleanup();
  });

  it('records an honest FAILURE from the failed marker', () => {
    const t = setup();
    t.hook('run-tf-1', { repoId: 'bloom', ok: false, resultText: 'TESTFLIGHT_FAILED altool upload — auth error' });
    expect(t.bus.snapshot().state.deployments[0]).toMatchObject({ env: 'testflight', ok: false });
    t.cleanup();
  });

  it('records NOTHING without a marker, for a bundle mismatch, or for a non-deploy run', () => {
    const t = setup();
    t.hook('run-tf-1', { repoId: 'bloom', ok: true, resultText: 'finished fine, uploaded successfully' }); // no marker
    t.hook('run-tf-1', { repoId: 'bloom', ok: true, resultText: 'TESTFLIGHT_UPLOADED com.other.app 1.0 (1)' }); // mismatch
    t.hook('run-unrelated', { repoId: 'bloom', ok: true, resultText: 'TESTFLIGHT_UPLOADED com.wrexist.bloom 1.0 (1)' }); // not a deploy run
    expect(t.bus.snapshot().state.deployments).toHaveLength(0);
    t.cleanup();
  });
});
