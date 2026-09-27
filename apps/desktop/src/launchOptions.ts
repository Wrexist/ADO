import { isAbsolute } from 'node:path';

/** Explicit local launch choices, parsed before the per-profile instance lock. */
export function desktopLaunchOptions(argv: string[]) {
  const profiles = argv.filter((arg) => arg.startsWith('--profile-dir='));
  if (profiles.length > 1) throw new Error('Specify one absolute --profile-dir path');
  const profileDir = profiles[0]?.slice('--profile-dir='.length);
  if (profileDir !== undefined && (!isAbsolute(profileDir) || profileDir.includes('\0'))) throw new Error('Specify one absolute --profile-dir path');
  if (argv.includes('--profile-dir')) throw new Error('Use --profile-dir=<absolute path>');
  return { profileDir, hidden: argv.includes('--hidden'), checkUpdates: !argv.includes('--no-update-check') };
}
