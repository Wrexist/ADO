/** Repo presentation maps shared by both views — data decides WHAT, these decide HOW. */
import type { CiState, RepoCategory, RepoStatus } from '@ado/shared';
import type { IconName, Tone } from '../kit';

export const CATEGORY_ICON: Record<RepoCategory, { icon: IconName; tone: Tone }> = {
  game: { icon: 'games', tone: 'violet' },
  app: { icon: 'sparkle', tone: 'success' },
  web: { icon: 'cloud', tone: 'info' },
  api: { icon: 'code', tone: 'violet' },
  library: { icon: 'templates', tone: 'warning' },
  service: { icon: 'database', tone: 'info' },
};

export const CATEGORY_TAG: Record<RepoCategory, string> = {
  game: 'Game',
  app: 'App',
  web: 'Web',
  api: 'API',
  library: 'Library',
  service: 'Service',
};

export const REPO_STATUS_LOOK: Record<RepoStatus, { tone: Tone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  testing: { tone: 'warning', label: 'Testing' },
  blocked: { tone: 'danger', label: 'Blocked' },
  archived: { tone: 'muted', label: 'Archived' },
};

export const CI_TONE: Record<CiState, 'gradient' | Tone> = {
  success: 'gradient',
  running: 'warning',
  queued: 'warning',
  failed: 'danger',
};
