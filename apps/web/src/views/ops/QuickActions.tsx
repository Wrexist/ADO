import { Link } from 'react-router-dom';
import { Card, Icon } from '../../kit';
import { asIcon } from './maps';

/**
 * Col 3 — Quick Actions 2×3. Each routes to the relevant page (real where one exists,
 * an honest placeholder where the flow isn't built yet) — no dead buttons.
 */
const ACTIONS = [
  { id: 'create-repo', label: 'Create Repository', icon: 'repo', to: '/planned/new-project' },
  { id: 'new-agent', label: 'New AI Agent', icon: 'agent', to: '/planned/new-agent' },
  { id: 'deploy', label: 'Deploy Application', icon: 'cloud', to: '/deployments' },
  { id: 'workflow', label: 'View Workflows', icon: 'workflow', to: '/workflows' },
  { id: 'analytics', label: 'View Analytics', icon: 'chart', to: '/planned/analytics' },
  { id: 'secrets', label: 'Manage Secrets', icon: 'lock', to: '/settings' },
];

export function QuickActions() {
  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">Quick Actions</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ACTIONS.map((qa) => (
          <Link
            key={qa.id}
            to={qa.to}
            className="flex items-center gap-2 rounded-tile bg-elevated p-2.5 text-left transition-colors duration-150 ease-soft hover:bg-elevated/70 hover:text-text1"
          >
            <Icon name={asIcon(qa.icon)} size={14} className="shrink-0 text-primary" />
            <span className="text-label font-medium leading-tight text-text2">{qa.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
