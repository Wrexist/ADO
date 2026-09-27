import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PortfolioProject, PortfolioSnapshot } from '@ado/shared';
import { PageShell } from '../chrome/PageShell';
import { Button, Card } from '../kit';
import { fetchPortfolio, importPortfolioSource, savePortfolioProject } from '../lib/portfolio';

const initial = { name: '', kind: 'app', goal: '', lifecycle: 'active' as PortfolioProject['lifecycle'], focus: false, manualPriority: 0 };
const field = 'w-full min-w-0 rounded-tile border bg-card px-3 py-2 text-body text-text1';

export function PortfolioPage() {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState<PortfolioProject | null>(null);
  const [selected, setSelected] = useState('');
  const [attach, setAttach] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) nameInput.current?.focus(); }, [editing]);
  const load = async () => { const next = await fetchPortfolio(); setSnapshot(next); };
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, []);
  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await load(); setMessage(message); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <PageShell title="Projects" subtitle="Your products and goals, with separately identified repositories and working copies.">
    <div className="mt-5 space-y-5">
      <Link className="block text-body text-primary" to="/tasks">Plan tasks and capture ideas →</Link>
      <Link className="text-body text-primary" to="/repositories">Manage scanned repositories and GitHub connections →</Link>
      <Button variant="outline" disabled={busy} onClick={() => void act(async () => { setEditing(null); setDraft(initial); }, 'Registry reloaded. Select Edit to use the current version.')}>Reload registry</Button>
      {error && <p role="alert" className="text-body text-danger">{error}</p>}
      {message && <p role="status" className="text-body text-text2">{message}</p>}
      <Card className="p-4">
        <h2 className="text-title font-semibold">{editing ? 'Edit project' : 'Create a project'}</h2>
        <p className="mt-1 text-body text-text3">A project can have several repositories, or none yet.</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void act(async () => {
          const saved = await savePortfolioProject(editing ? { ...draft, version: editing.version } : draft, editing?.id);
          setSelected(saved.id); setAttach(''); setEditing(null); setDraft(initial);
        }, 'Project saved.'); }}>
          <label className="text-body">Project name<input ref={nameInput} required maxLength={160} className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="text-body">Project kind<input required maxLength={80} className={field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} /></label>
          <label className="text-body sm:col-span-2">Project goal<textarea maxLength={8000} rows={3} className={field} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} /></label>
          <label className="text-body">Lifecycle<select className={field} value={draft.lifecycle} onChange={(e) => setDraft({ ...draft, lifecycle: e.target.value as PortfolioProject['lifecycle'] })}>{['active', 'paused', 'maintenance', 'archived'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-body">Manual priority (0–5)<input type="number" min={0} max={5} className={field} value={draft.manualPriority} onChange={(e) => setDraft({ ...draft, manualPriority: Number(e.target.value) })} /></label>
          <label className="text-body"><input type="checkbox" checked={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.checked })} /> Focus project</label>
          <div className="flex gap-2"><Button type="submit" disabled={busy}>{editing ? 'Save project' : 'Create project'}</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setDraft(initial); }}>Cancel edit</Button>}</div>
        </form>
      </Card>
      {!snapshot ? <p className="text-body text-text3">Loading project registry…</p> : <>
        {!snapshot.projects.length && <p className="text-body text-text3">No projects registered yet. Create one to start collecting its goal and repositories.</p>}
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {snapshot.projects.map((project) => <Card key={project.id} className="min-w-0 break-words p-4">
            <h2 className="text-title font-semibold">{project.name}</h2>
            <p className="text-body text-text2">{project.kind} · {project.lifecycle} · priority {project.manualPriority}{project.focus ? ' · Focus' : ''}</p>
            <p className="mt-2 whitespace-pre-wrap text-body">{project.goal || 'No goal recorded yet.'}</p>
            <p className="mt-2 text-label text-text3">Project ID: {project.id}</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(project); setDraft({ name: project.name, kind: project.kind, goal: project.goal, lifecycle: project.lifecycle, focus: project.focus, manualPriority: project.manualPriority }); }}>Edit {project.name}</Button>
            {snapshot.repositories.filter((repo) => repo.projectId === project.id).map((repo) => <div key={repo.id} className="mt-3 border-t pt-3 text-label">
              <p className="font-medium">{repo.name} · {repo.host}</p>
              <p>Repository ID: {repo.id}</p>
              {repo.canonicalRemote && <p>{repo.canonicalRemote}</p>}
              <p>Default branch: {repo.defaultBranch ?? 'not verified'}</p>
              <p>Repository metadata observed: {new Date(repo.observedTs).toLocaleString()}</p>
              {snapshot.checkouts.filter((checkout) => checkout.repositoryId === repo.id).map((checkout) => <div className="mt-2 rounded border p-2" key={checkout.id}>
                <p>Working copy: {checkout.canonicalPath}</p>
                <p>Checkout ID: {checkout.id}</p>
                <p>Observed revision: {checkout.headSha ?? 'No committed revision observed'}</p>
                <p>Observed: {new Date(checkout.observedTs).toLocaleString()}</p>
              </div>)}
            </div>)}
          </Card>)}
        </div>
        <Card className="min-w-0 p-4">
          <h2 className="text-title font-semibold">Import observed repository metadata</h2>
          <p className="mt-1 text-body text-text3">Choose the owning project. Importing does not start an agent or enable dispatch. Observations may be old; refresh the scanner or GitHub connection when needed.</p>
          <label className="mt-3 block text-body">Owning project<select className={field} value={selected} onChange={(e) => { setSelected(e.target.value); setAttach(''); }}><option value="">Select a project</option>{snapshot.projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(0, 8)}</option>)}</select></label>
          <label className="mt-3 block text-body">Local checkout association<select className={field} value={attach} onChange={(e) => setAttach(e.target.value)}><option value="">Keep its own local repository identity</option>{snapshot.repositories.filter((r) => r.projectId === selected && r.host === 'github').map((r) => <option value={r.id} key={r.id}>Attach to {r.name} · {r.id.slice(0, 8)}</option>)}</select></label>
          {!snapshot.sources.length && <p className="mt-3 text-body text-text3">No importable observations. Add a local repository or connect GitHub in the repository view.</p>}
          {snapshot.sources.map((source) => <div key={source.id} className="mt-3 min-w-0 break-words border-t pt-3 text-body">
            <p>{source.name} · {source.kind}</p><p className="text-label text-text3">{source.location}</p>
            <p className="text-label text-text3">Observed: {source.observedTs ? new Date(source.observedTs).toLocaleString() : 'not recorded'}</p>
            <Button size="sm" disabled={busy || !selected} onClick={() => void act(() => importPortfolioSource({ projectId: selected, sourceId: source.id, ...(source.kind === 'local' && attach ? { repositoryId: attach } : {}) }), 'Repository metadata imported.')} aria-label={`Import ${source.name}`}>Import or refresh</Button>
          </div>)}
        </Card>
      </>}
    </div>
  </PageShell>;
}
