#!/usr/bin/env node
/**
 * scripts/screenshot.mjs — capture both views at the canonical 1536px viewport.
 *
 * Standing convention (CLAUDE.md): every turn that changes what the app renders ends
 * with fresh screenshots shared with Isac. Later (P3.5) this same capture path feeds
 * the Playwright visual baselines against the frozen --demo seed.
 *
 * Usage: node scripts/screenshot.mjs [baseUrl] [outDir]
 *   baseUrl  default http://localhost:5173
 *   outDir   default .
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const outDir = process.argv[3] ?? '.';
await mkdir(outDir, { recursive: true });

// CCR containers pre-install Chromium at this path; elsewhere Playwright resolves its own.
const ccrChromium = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(
  existsSync(ccrChromium) ? { executablePath: ccrChromium } : {},
);

const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
const shots = [
  ['view-a-command', '/command'],
  ['view-b-ops', '/ops'],
];

for (const [name, route] of shots) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const path = `${outDir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`captured ${path}`);
}

await browser.close();
