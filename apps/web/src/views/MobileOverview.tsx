import { Link } from 'react-router-dom';
import { useBus } from '../store/bus';
import { ciView } from '../lib/ci';
import { RunHistory } from './RunHistory';
import { StaleBanner } from '../chrome/StaleBanner';
import { GettingStarted, useSetupSnapshot } from './command/GettingStarted';

/** Mounted only while there are no repositories, so its status reads stop afterwards. */
function FirstRun() {
  const { snap, refresh } = useSetupSnapshot();
  return <GettingStarted snap={snap} refresh={refresh} />;
}

export function MobileOverview() {
  const state = useBus((s) => s.state);
  const repos = Object.values(state.repos);
  return <div className="min-h-screen bg-app text-text1 lg:hidden">
    <StaleBanner />
    <main className="space-y-6 p-4">
      <h1 className="text-title font-semibold">ControlOS</h1>
      <p className="text-body text-text2">{repos.length} projects · {Object.values(state.agents).filter((a) => a.status === 'running').length} agents running</p>
      <section aria-label="Projects" className="space-y-3">
        {repos.length === 0 && <FirstRun />}
        {repos.map((repo) => <Link key={repo.id} to={`/repositories/${encodeURIComponent(repo.id)}`} className="block rounded-tile border bg-card p-4">
          <h2 className="text-section font-semibold">{repo.name}</h2>
          <p className="mt-1 break-words text-body text-text2">{repo.description}</p>
          <p className="mt-2 text-label text-text3">{repo.status} · {repo.openTasks ?? '—'} open tasks · CI {repo.ci ? (ciView(repo.ci).note ?? repo.ci.state) : 'unknown'}</p>
        </Link>)}
      </section>
      <section><h2 className="mb-3 text-section font-semibold">Recent jobs</h2><RunHistory /></section>
    </main>
  </div>;
}
