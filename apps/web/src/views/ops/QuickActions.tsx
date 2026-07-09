import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Card, Icon } from '../../kit';
import { asIcon } from './maps';

/** Col 3 — Quick Actions 2×3 grid (wired to the same server actions as intents, Phase 4). */
export function QuickActions() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">Quick Actions</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {m.quickActions.map((qa) => (
          <button
            key={qa.id}
            type="button"
            className="flex items-center gap-2 rounded-tile bg-elevated p-2.5 text-left transition-colors duration-150 ease-soft hover:bg-elevated/70 hover:text-text1"
          >
            <Icon name={asIcon(qa.icon)} size={14} className="shrink-0 text-primary" />
            <span className="text-label font-medium leading-tight text-text2">{qa.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
