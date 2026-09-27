import { join } from 'node:path';

/** Built app, explicit DEMO profile; catch the desktop/mobile breakpoint gap. */
export async function smokeAppearance(page, base, pair, out) {
  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['command', 'ops', 'projects']) {
      await page.goto(`${base}/${route}`); await pair();
      await page.screenshot({ path: join(out, `${route}-${width}.png`), fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow: ${route} at ${width}px`);
      if (route === 'ops') {
        const name = await page.getByRole('heading', { name: 'Projects Overview', exact: true }).locator('..').getByText('SENTINEL', { exact: true }).boundingBox();
        if (!name || name.width < 80) throw new Error(`Project identity is squeezed out at ${width}px`);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250); // Surface-color transitions must settle before the visual assertion.
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('Keyboard appearance control failed');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile dark appearance overflows');
  await page.screenshot({ path: join(out, 'projects-mobile-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  console.log('Appearance smoke passed: 1024/1280px navigation and layouts; mobile keyboard theme control. DEMO data only.');
}
