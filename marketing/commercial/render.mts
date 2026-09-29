/**
 * Render commercial.html to an H.264 MP4 frame by frame (deterministic: each frame is
 * window.render(t)). Needs ffmpeg: set FFMPEG=path, or have `ffmpeg` on PATH.
 *
 * Usage:
 *   node --import tsx marketing/commercial/render.mts            → build/controlos-commercial.mp4
 *   node --import tsx marketing/commercial/render.mts --stills 2,12,24,35,40   → build/still-<t>.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const FPS = 30;
const out = resolve('marketing/commercial/build');
mkdirSync(out, { recursive: true });
const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve('marketing/commercial/commercial.html')).href + '?frames');
await page.evaluate(() => (window as unknown as { ready: Promise<unknown> }).ready);
const duration = await page.evaluate(() => (window as unknown as { DURATION: number }).DURATION);
const frame = async (t: number) => { await page.evaluate((time) => (window as unknown as { render: (t: number) => void }).render(time), t); };

if (stills) {
  for (const t of stills) { await frame(t); await page.screenshot({ path: join(out, `still-${t}.png`) }); console.log('still', t); }
  await browser.close();
} else {
  const file = join(out, 'controlos-commercial.mp4');
  const ffmpeg = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS), file], { stdio: ['pipe', 'ignore', 'inherit'] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await frame(i / FPS);
    const png = await page.screenshot({ type: 'png' });
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  ffmpeg.stdin.end();
  const code = await new Promise<number>((r) => ffmpeg.on('close', (c) => r(c ?? 1)));
  await browser.close();
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  console.log('video', file);
}
