#!/usr/bin/env node
/**
 * Bundle the desktop main + preload with esbuild.
 * The server workspace is TypeScript run via tsx in dev; for the packaged app we bundle it
 * (and every JS dep) INTO main.cjs. Only two things stay external:
 *  - electron            (provided by the runtime)
 *  - better-sqlite3      (native module — packed as a real node_modules dep, asar-unpacked,
 *                         rebuilt for Electron's ABI by electron-builder)
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  logLevel: 'info',
  // import.meta.url appears in the bundled server's env.ts — rewrite for the CJS bundle.
  define: { 'import.meta.url': '__importMetaUrl' },
  inject: [join(root, 'import-meta-url-shim.mjs')],
};

await build({
  ...common,
  entryPoints: [join(root, '../src/main.ts')],
  outfile: join(root, '../dist/main.cjs'),
  external: ['electron', 'better-sqlite3', 'electron-updater'],
});

await build({
  ...common,
  entryPoints: [join(root, '../src/preload.ts')],
  outfile: join(root, '../dist/preload.cjs'),
  external: ['electron'],
  inject: [],
  define: {},
});
