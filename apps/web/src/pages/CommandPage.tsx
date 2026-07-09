import { SidebarA } from '../chrome/SidebarA';
import { TopBarA } from '../chrome/TopBarA';
import { Card, EmptyState } from '../kit';

/**
 * View A — Command Center (/command). Prompt 1.1: chrome + 3-column layout shell.
 * Main column (1.2) and right rail (1.3) land next — their regions are honest
 * placeholders, not fake widgets. Canonical viewport 1536; min 1280 then scroll.
 */
export function CommandPage() {
  return (
    <div className="min-h-screen min-w-[1280px] bg-app text-text1">
      <TopBarA />
      <div className="flex items-stretch">
        <SidebarA />

        {/* main column — Prompt 1.2 */}
        <main className="min-w-[640px] flex-1 p-6">
          <Card className="border-dashed">
            <EmptyState
              icon="grid"
              title="Main column lands with Prompt 1.2"
              hint="Header row, 4 stat cards, repository grid, Running Agents strip — composed from the kit on mock data."
            />
          </Card>
        </main>

        {/* right rail — Prompt 1.3 */}
        <aside className="w-[360px] shrink-0 p-6 pl-0">
          <Card className="border-dashed">
            <EmptyState
              icon="sparkle"
              title="Right rail lands with Prompt 1.3"
              hint="AI Command Center, Recent Activity, System Status, help card."
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
