import { SidebarA } from '../chrome/SidebarA';
import { TopBarA } from '../chrome/TopBarA';
import { StaleBanner } from '../chrome/StaleBanner';
import { MainColumn } from '../views/command/MainColumn';
import { RightRail } from '../views/command/RightRail';
import { MobileOverview } from '../views/MobileOverview';

/**
 * View A — Command Center (/command). Prompts 1.1–1.3: chrome + main column +
 * right rail, fully composed from the kit on per-view mock data.
 * Canonical viewport 1536; min 1280 then horizontal scroll (no mobile in v1).
 */
export function CommandPage() {
  return (
    <><MobileOverview /><div className="hidden min-h-screen bg-app text-text1 lg:block">
      <TopBarA />
      <StaleBanner />
      <div className="flex items-stretch">
        <SidebarA />
        <MainColumn />
        <RightRail />
      </div>
    </div></>
  );
}
