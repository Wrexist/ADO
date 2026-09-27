import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { desktopLaunchOptions } from './launchOptions';

it('requires an explicit absolute profile and independent opt-outs for hidden and update behavior', () => {
  expect(desktopLaunchOptions([])).toEqual({ profileDir: undefined, hidden: false, checkUpdates: true });
  const profile = resolve('temporary profile');
  expect(desktopLaunchOptions([`--profile-dir=${profile}`, '--hidden', '--no-update-check'])).toEqual({ profileDir: profile, hidden: true, checkUpdates: false });
  for (const args of [['--profile-dir'], ['--profile-dir='], ['--profile-dir=relative'], [`--profile-dir=${profile}`, `--profile-dir=${profile}`]]) expect(() => desktopLaunchOptions(args)).toThrow();
});
