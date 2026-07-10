/**
 * View B presentation maps — data decides WHAT (entities from the bus);
 * these records decide only HOW it looks. No values are invented here.
 */
import type { DeployEnv, Language } from '@ado/shared';
import type { IconName, Tone } from '../../kit';
import type { ProjectStatusKind } from '../../lib/selectors';

/** Icon-token → kit IconName (aliases where names differ). */
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

export const ENV_LABEL: Record<DeployEnv, string> = {
  production: 'Production',
  testflight: 'TestFlight',
  staging: 'Staging',
};

export const LANG_LABEL: Record<Language, string> = {
  typescript: 'TypeScript',
  swift: 'Swift',
  liquid: 'Liquid',
  python: 'Python',
};

export const PROJECT_STATUS_TONE: Record<ProjectStatusKind, Tone> = {
  building: 'info',
  queued: 'warning',
  failed: 'danger',
  passing: 'success',
  testing: 'warning',
};
