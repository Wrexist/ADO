import type { IconName } from '../kit';

/**
 * Planned-but-not-built areas. The reference designs include these nav items; rather than
 * leave dead buttons OR fake features (both banned), each routes to an honest placeholder.
 * When one is actually built it graduates to a real route.
 */
export interface PlannedFeature {
  title: string;
  blurb: string;
  icon: IconName;
}

export const PLANNED: Record<string, PlannedFeature> = {
  templates: { title: 'Templates', blurb: 'Reusable project and workflow templates.', icon: 'templates' },
  'code-assistant': { title: 'Code Assistant', blurb: 'AI pair-programming across your repos.', icon: 'code' },
  'game-builder': { title: 'Game Builder', blurb: 'Scaffold and iterate on game projects.', icon: 'games' },
  'ui-generator': { title: 'UI Generator', blurb: 'Generate UI from prompts and design tokens.', icon: 'wand' },
  database: { title: 'Database', blurb: 'Browse and manage connected databases.', icon: 'database' },
  'cicd-pipelines': { title: 'CI/CD Pipelines', blurb: 'Pipeline status and controls.', icon: 'pipeline' },
  models: { title: 'Models', blurb: 'Configure and route between AI models.', icon: 'sparkle' },
  alerts: { title: 'Alerts', blurb: 'Thresholds and notifications.', icon: 'bell' },
  'new-agent': { title: 'New AI Agent', blurb: 'Define and dispatch a new agent.', icon: 'agents' },
};
