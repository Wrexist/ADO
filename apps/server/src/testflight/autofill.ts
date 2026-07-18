/**
 * iOS auto-fill probe — READ-ONLY facts for the TestFlight template form, pulled from the
 * repo's real files: the Xcode pbxproj (bundle id, versions, team), shared schemes, the
 * fastlane Appfile, and Info.plist as a fallback. Every value carries provenance (which
 * file it came from); a repo with no Xcode project returns detected:false — the form then
 * starts blank instead of guessing (convention 1).
 *
 * Parsing is regex-over-text on purpose: pbxproj is an unstable Apple format, so this is a
 * versioned, self-contained adapter with an honest degraded state (convention 12) — fields
 * it can't find are simply absent, never invented.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { IosAppFacts, TestFlightAutofill } from '@ado/shared';

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'DerivedData', 'Pods', '.vite']);
const MAX_PBXPROJ_BYTES = 4 * 1024 * 1024;

function dirsIn(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !IGNORE.has(e.name) && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Find ALL *.xcodeproj dirs (repo root, ./ios, or one level down) — bounded, no deep walk.
 *  A multi-app monorepo yields several; the UI offers a picker. */
function findXcodeprojs(cwd: string): string[] {
  const roots = [cwd, join(cwd, 'ios'), ...dirsIn(cwd).map((d) => join(cwd, d))];
  const found = new Set<string>();
  for (const root of roots) {
    for (const name of dirsIn(root)) {
      if (name.endsWith('.xcodeproj') && existsSync(join(root, name, 'project.pbxproj'))) {
        found.add(join(root, name));
      }
    }
  }
  return [...found].sort();
}

function read(path: string, cap = MAX_PBXPROJ_BYTES): string | null {
  try {
    // Check size BEFORE loading — an oversized/garbage file is skipped, not slurped-then-trimmed.
    if (statSync(path).size > cap) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Most frequent captured value for a `KEY = value;` pbxproj setting (skips test targets' ids). */
function pbxValue(src: string, key: string, opts: { skipTests?: boolean } = {}): string | undefined {
  const re = new RegExp(`${key}\\s*=\\s*"?([^";\\n]+)"?\\s*;`, 'g');
  const counts = new Map<string, number>();
  for (const m of src.matchAll(re)) {
    const v = m[1].trim();
    if (!v || v.startsWith('$(')) continue; // a build-setting reference, not a literal
    if (opts.skipTests && /tests?$/i.test(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | undefined;
  let n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}

/** Shared scheme names under <proj>.xcodeproj/xcshareddata/xcschemes/*.xcscheme. */
function sharedSchemes(xcodeproj: string): string[] {
  try {
    return readdirSync(join(xcodeproj, 'xcshareddata', 'xcschemes'))
      .filter((f) => f.endsWith('.xcscheme'))
      .map((f) => f.slice(0, -'.xcscheme'.length))
      .sort();
  } catch {
    return [];
  }
}

/** fastlane/Appfile facts: app_identifier("…"), team_id("…"). */
function appfileFacts(cwd: string): { bundleId?: string; teamId?: string; source?: string } {
  for (const p of ['fastlane/Appfile', 'ios/fastlane/Appfile']) {
    const src = read(join(cwd, p), 64 * 1024);
    if (!src) continue;
    const bundleId = src.match(/app_identifier[\s(]+["']([^"']+)["']/)?.[1];
    const teamId = src.match(/team_id[\s(]+["']([^"']+)["']/)?.[1];
    if (bundleId || teamId) return { bundleId, teamId, source: p };
  }
  return {};
}

/** Info.plist literal versions (skipped when the plist uses $(…) build-setting refs). */
function plistVersions(xcodeproj: string, cwd: string): { marketing?: string; build?: string; source?: string } {
  const projDir = join(xcodeproj, '..');
  const candidates: string[] = [];
  for (const d of dirsIn(projDir)) candidates.push(join(projDir, d, 'Info.plist'));
  candidates.push(join(projDir, 'Info.plist'));
  for (const p of candidates) {
    const src = read(p, 256 * 1024);
    if (!src) continue;
    const get = (k: string) => src.match(new RegExp(`<key>${k}</key>\\s*<string>([^<$]+)</string>`))?.[1]?.trim();
    const marketing = get('CFBundleShortVersionString');
    const build = get('CFBundleVersion');
    if (marketing || build) return { marketing, build, source: relative(cwd, p) };
  }
  return {};
}

/** Facts for one Xcode project. Appfile facts (repo-level) fill gaps for every app. */
function appFacts(cwd: string, xcodeproj: string, appfile: ReturnType<typeof appfileFacts>): IosAppFacts {
  const sources: string[] = [];
  const facts: IosAppFacts = { project: relative(cwd, xcodeproj), schemes: [], sources };

  const pbxPath = join(xcodeproj, 'project.pbxproj');
  const pbx = read(pbxPath);
  if (pbx) {
    sources.push(relative(cwd, pbxPath));
    facts.bundleId = pbxValue(pbx, 'PRODUCT_BUNDLE_IDENTIFIER', { skipTests: true });
    facts.teamId = pbxValue(pbx, 'DEVELOPMENT_TEAM');
    facts.marketingVersion = pbxValue(pbx, 'MARKETING_VERSION');
    facts.buildNumber = pbxValue(pbx, 'CURRENT_PROJECT_VERSION');
  }

  facts.schemes = sharedSchemes(xcodeproj);
  if (facts.schemes.length > 0) sources.push(relative(cwd, join(xcodeproj, 'xcshareddata', 'xcschemes')));

  if (appfile.source && (!facts.bundleId || !facts.teamId)) {
    sources.push(appfile.source);
    facts.bundleId = facts.bundleId ?? appfile.bundleId;
    facts.teamId = facts.teamId ?? appfile.teamId;
  }

  if (!facts.marketingVersion || !facts.buildNumber) {
    const plist = plistVersions(xcodeproj, cwd);
    if (plist.source) {
      sources.push(plist.source);
      facts.marketingVersion = facts.marketingVersion ?? plist.marketing;
      facts.buildNumber = facts.buildNumber ?? plist.build;
    }
  }
  return facts;
}

/** The probe. Never throws; a non-iOS repo returns { detected: false, apps: [] }. */
export function probeIos(cwd: string): TestFlightAutofill {
  const projects = findXcodeprojs(cwd);
  if (projects.length === 0) return { detected: false, apps: [] };
  const appfile = appfileFacts(cwd);
  return { detected: true, apps: projects.map((p) => appFacts(cwd, p, appfile)) };
}
