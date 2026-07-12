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
  analytics: { title: 'Analytics', blurb: 'Usage, performance, and delivery analytics.', icon: 'chart' },
  'cicd-pipelines': { title: 'CI/CD Pipelines', blurb: 'Pipeline status and controls.', icon: 'pipeline' },
  team: { title: 'Team', blurb: 'Members, roles, and access.', icon: 'team' },
  billing: { title: 'Billing', blurb: 'Plan, usage, and invoices.', icon: 'billing' },
  automation: { title: 'Automation', blurb: 'Rules and triggers across your workspace.', icon: 'workflow' },
  workflows: { title: 'Workflows', blurb: 'Multi-step agent workflows.', icon: 'pipeline' },
  models: { title: 'Models', blurb: 'Configure and route between AI models.', icon: 'sparkle' },
  alerts: { title: 'Alerts', blurb: 'Thresholds and notifications.', icon: 'bell' },
  performance: { title: 'Performance', blurb: 'Detailed system and app metrics.', icon: 'health' },
  'new-project': { title: 'New Project', blurb: 'Create a repository or project.', icon: 'plus' },
  'new-agent': { title: 'New AI Agent', blurb: 'Define and dispatch a new agent.', icon: 'agents' },
  calendar: { title: 'Calendar', blurb: 'Scheduled jobs, releases, and reminders.', icon: 'calendar' },
  messages: { title: 'Messages', blurb: 'Team and agent conversations.', icon: 'chat' },
};
