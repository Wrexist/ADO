/**
 * View B presentation maps — data decides WHAT (fixture ids/kinds/langs);
 * these records decide only HOW it looks. No values are invented here.
 */
import type { DeployEnv, Language, ProjectRowFixture } from '@ado/shared/mock';
import type { IconName, Tone } from '../../kit';

/** Fixture icon-token → kit IconName (aliases where names differ). */
const ICON_ALIAS: Record<string, IconName> = {
  repo: 'repos',
  agent: 'agents',
  builds: 'pipeline',
};
export function asIcon(name: string): IconName {
  return (ICON_ALIAS[name] ?? name) as IconName;
}

export const ENV_TONE: Record<DeployEnv, Tone> = {
  production: 'success',
  testflight: 'info',
  staging: 'warning',
};

export const STATUS_TONE: Record<ProjectRowFixture['status']['kind'], Tone> = {
  building: 'info',
  deploying: 'violet',
  live: 'success',
  testing: 'warning',
};

export const LANG_LABEL: Record<Language, string> = {
  typescript: 'TypeScript',
  swift: 'Swift',
  liquid: 'Liquid',
  python: 'Python',
};

/** Row icon tiles (presentation only; fallback covers unknown ids). */
export const PROJECT_ICON: Record<string, { icon: IconName; tone: Tone }> = {
  sentinel: { icon: 'games', tone: 'violet' },
  bloom: { icon: 'sparkle', tone: 'success' },
  atlas: { icon: 'cloud', tone: 'info' },
  'dynasty-manager': { icon: 'games', tone: 'pink' },
  'wrexist-ops': { icon: 'code', tone: 'warning' },
};
export const PROJECT_ICON_FALLBACK = { icon: 'repos', tone: 'violet' } as const;

export const AGENT_ICON: Record<string, { icon: IconName; tone: Tone }> = {
  'code-review': { icon: 'code', tone: 'violet' },
  'bug-finder': { icon: 'search', tone: 'success' },
  performance: { icon: 'health', tone: 'warning' },
  security: { icon: 'lock', tone: 'info' },
};
