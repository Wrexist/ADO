import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { create } from 'zustand';
import { tokens } from '@ado/shared';

/**
 * Phase 0 shell. This is a scaffold placeholder, not the real dashboard — the pixel-
 * accurate View A (/command) and View B (/ops) are built in Phase 1 from the shared
 * component kit against design/reference/*.png. Its only job today: prove the
 * toolchain (React + Router + Tailwind + Zustand + @ado/shared tokens) is wired green.
 */

// Minimal store to exercise the Zustand dependency; real domain slices arrive in Phase 2.
type UiState = { route: string; setRoute: (r: string) => void };
const useUi = create<UiState>((set) => ({ route: '/command', setRoute: (route) => set({ route }) }));

export function App() {
  const location = useLocation();
  const active = (path: string) =>
    location.pathname.startsWith(path)
      ? 'bg-primary/15 text-text1'
      : 'text-text2 hover:text-text1';

  return (
    <div className="min-h-screen bg-app text-text1 font-sans">
      <header className="flex h-16 items-center gap-4 border-b border-white/[0.07] px-6">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-gradient-from to-gradient-to" />
        <div className="leading-tight">
          <div className="text-section font-semibold">AI Control Center</div>
          <div className="text-label uppercase tracking-wide text-text3">
            Command everything. Build anything.
          </div>
        </div>
        <nav className="ml-8 flex gap-1">
          <Link className={`rounded-tile px-3 py-1.5 text-body ${active('/command')}`} to="/command">
            Command Center
          </Link>
          <Link className={`rounded-tile px-3 py-1.5 text-body ${active('/ops')}`} to="/ops">
            Ops Dashboard
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-[1536px] p-8">
        <Outlet />
      </main>
    </div>
  );
}

export function PhasePlaceholder({ view, route }: { view: string; route: string }) {
  const setRoute = useUi((s) => s.setRoute);
  useEffect(() => setRoute(route), [route, setRoute]);
  return (
    <section className="rounded-card border border-white/[0.07] bg-card p-8">
      <p className="text-label uppercase tracking-wide text-text3">Phase 0 · Foundation</p>
      <h1 className="mt-2 text-title font-semibold">{view}</h1>
      <p className="mt-3 max-w-xl text-body text-text2">
        Scaffold is green. This view is built pixel-accurate in <strong>Phase 1</strong> from the
        shared component kit against <code>design/reference</code>, then wired to live data in
        Phase 2. See <code>ROADMAP.md</code>.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-tile bg-elevated px-3 py-2 text-body text-text2">
        <span className="h-2 w-2 rounded-full bg-success" />
        tokens loaded — primary {tokens.color.primary} · canonical {tokens.layout.canonicalWidth}px
      </div>
    </section>
  );
}
