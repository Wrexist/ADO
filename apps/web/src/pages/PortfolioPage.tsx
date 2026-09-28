import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PortfolioProject, PortfolioSnapshot } from '@ado/shared';
import { PageShell } from '../chrome/PageShell';
import { Button, Card, Icon, cx } from '../kit';
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lifecycle, setLifecycle] = useState('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const nameInput = useRef<HTMLInputElement>(null);
  const newProjectButton = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (editorOpen) nameInput.current?.focus(); }, [editing, editorOpen]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const load = async () => { const next = await fetchPortfolio(); setSnapshot(next); };
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, []);
  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await load(); setMessage(message); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const projects = snapshot?.projects ?? [];
  const filtered = projects.filter((project) => (lifecycle === 'all' || project.lifecycle === lifecycle)
    && `${project.name} ${project.kind} ${project.goal}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <PageShell title="Projects" subtitle="A clear view of what you are building and why." actions={
    <button ref={newProjectButton} type="button" aria-expanded={editorOpen} aria-controls="project-editor" disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-tile bg-text1 px-4 text-body font-medium text-card disabled:opacity-50"
      onClick={() => setEditorOpen(!editorOpen)}><Icon name="plus" size={16} />{editorOpen ? 'Hide editor' : 'New project'}</button>
  }>
    <div className="mt-6 min-w-0 space-y-6 [&_button]:min-h-11 [&_input:not([type=checkbox])]:min-h-11 [&_select]:min-h-11 [&_summary]:min-h-11">
      <nav aria-label="Project tools" className="flex flex-wrap gap-x-5 gap-y-1 border-b pb-3 text-body text-text2">
        <Link className="inline-flex min-h-11 items-center gap-2 hover:text-text1" to="/tasks"><Icon name="list" size={16} />Tasks & Inbox</Link>
        <Link className="inline-flex min-h-11 items-center gap-2 hover:text-text1" to="/universe"><Icon name="workflow" size={16} />Universe</Link>
        <Link className="inline-flex min-h-11 items-center gap-2 hover:text-text1" to="/repositories"><Icon name="repos" size={16} />Repository connections</Link>
      </nav>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="scroll-mt-32 rounded-tile border border-danger/30 bg-danger/5 p-3 text-body text-danger">{error}</p>}
      {message && <p role="status" className="text-body text-text2">{message}</p>}
      <Card id="project-editor" hidden={!editorOpen} className="p-5">
        <h2 className="text-section font-semibold">{editing ? 'Edit project' : 'Create a project'}</h2>
        <p className="mt-1 text-body text-text3">A project can have several repositories, or none yet.</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void act(async () => {
          const saved = await savePortfolioProject(editing ? { ...draft, version: editing.version } : draft, editing?.id);
          setSelected(saved.id); setAttach(''); setEditing(null); setDraft(initial); setEditorOpen(false);
          setQuery(''); setLifecycle('all'); newProjectButton.current?.focus();
        }, 'Project saved.'); }}>
          <label className="text-body">Project name<input ref={nameInput} required maxLength={160} className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="text-body">Project kind<input required maxLength={80} className={field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} /></label>
          <label className="text-body sm:col-span-2">Project goal<textarea maxLength={8000} rows={3} className={field} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} /></label>
          <label className="text-body">Lifecycle<select className={field} value={draft.lifecycle} onChange={(e) => setDraft({ ...draft, lifecycle: e.target.value as PortfolioProject['lifecycle'] })}>{['active', 'paused', 'maintenance', 'archived'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-body">Manual priority (0–5)<input type="number" min={0} max={5} className={field} value={draft.manualPriority} onChange={(e) => setDraft({ ...draft, manualPriority: Number(e.target.value) })} /></label>
          <label className="text-body"><input type="checkbox" checked={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.checked })} /> Focus project</label>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{editing ? 'Save project' : 'Create project'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setDraft(initial); setEditorOpen(false); newProjectButton.current?.focus(); }}>{editing ? 'Cancel edit' : 'Cancel'}</Button></div>
        </form>
      </Card>
      {!snapshot ? <p className="text-body text-text3">Loading project registry…</p> : <>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 basis-60 flex-1 text-label text-text2">Search projects
            <span className="relative mt-1 block"><Icon name="search" size={16} className="pointer-events-none absolute left-3 top-3.5 text-text3" /><input type="search" className={cx(field, 'pl-10')} placeholder="Name, kind or goal…" value={query} onChange={(e) => setQuery(e.target.value)} /></span>
          </label>
          <div className="text-label text-text2"><label htmlFor="project-status-filter">Project status</label><select id="project-status-filter" className={cx(field, 'mt-1')} value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>{['all', 'active', 'paused', 'maintenance', 'archived'].map((value) => <option value={value} key={value}>{value === 'all' ? 'All statuses' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></div>
          <div role="group" aria-label="Project layout" className="flex rounded-tile border bg-panel p-1">
            {(['grid', 'list'] as const).map((value) => <button key={value} type="button" aria-label={`${value === 'grid' ? 'Grid' : 'List'} view`} aria-pressed={layout === value} className={cx('flex w-11 items-center justify-center rounded-tile', layout === value ? 'bg-elevated text-text1' : 'text-text3 hover:text-text1')} onClick={() => setLayout(value)}><Icon name={value} size={18} /></button>)}
          </div>
          <Button variant="outline" disabled={busy} onClick={() => void act(async () => {}, 'Registry reloaded. Unsaved editor changes are preserved.')}>Reload registry</Button>
        </div>
        <p role="status" aria-live="polite" className="text-label text-text3">{filtered.length} of {projects.length} projects{projects.filter((p) => p.focus).length ? ` · ${projects.filter((p) => p.focus).length} in focus` : ''}</p>
        {!projects.length ? <Card className="p-8 text-center"><Icon name="repos" size={28} className="mx-auto mb-3 text-text3" /><h2 className="text-section font-semibold">Your next project starts here</h2><p className="mx-auto mt-2 max-w-md text-body text-text2">Create a project to collect its goal, tasks and repositories. You can connect a repository later.</p><Button className="mt-5" onClick={() => setEditorOpen(true)}>Create your first project</Button></Card>
          : !filtered.length ? <Card className="p-8 text-center"><h2 className="text-section font-semibold">No matching projects</h2><p className="mt-2 text-body text-text2">Try another name or show all statuses.</p><Button className="mt-4" variant="outline" onClick={() => { setQuery(''); setLifecycle('all'); }}>Clear filters</Button></Card> : null}
        <section aria-label="Project list" className={cx('grid min-w-0 gap-4', layout === 'grid' && 'xl:grid-cols-2')}>
          {filtered.map((project) => <Card key={project.id} className="min-w-0 break-words p-5 hover:border-hover">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2"><Icon name="repos" size={21} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-section font-semibold">{project.name}</h2><p className="mt-1 text-label text-text3">{project.kind}</p></div>
              <span className={cx('rounded-full px-2.5 py-1 text-label', project.lifecycle === 'active' ? 'bg-success/10 text-success' : 'bg-elevated text-text2')}>{project.lifecycle}</span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-body text-text2">{project.goal || 'No goal recorded yet.'}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-label text-text3"><span>{snapshot.repositories.filter((repo) => repo.projectId === project.id).length} repositories</span><span>Priority {project.manualPriority}</span>{project.focus && <span className="inline-flex items-center gap-1 text-primary"><Icon name="star" size={14} />Focus</span>}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-label text-text3">Version {project.version}</span><Button size="sm" variant="ghost" disabled={busy} aria-label={`Edit ${project.name}`} onClick={() => { setEditorOpen(true); setEditing(project); setDraft({ name: project.name, kind: project.kind, goal: project.goal, lifecycle: project.lifecycle, focus: project.focus, manualPriority: project.manualPriority }); }}>Edit project</Button></div>
            <details className="mt-2 border-t text-body"><summary className="flex cursor-pointer items-center gap-2 text-text2"><Icon name="chevronDown" size={14} />Repositories & identity</summary>
            <p className="text-label text-text3">Project ID: {project.id}</p>
            {!snapshot.repositories.some((repo) => repo.projectId === project.id) && <p className="mt-2 text-body text-text3">No repositories linked yet. Import an observation below when ready.</p>}
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
            </div>)}</details>
          </Card>)}
        </section>
        <details className="min-w-0 rounded-card border bg-card p-5">
          <summary className="flex cursor-pointer items-center gap-3 text-section font-semibold"><Icon name="repos" size={18} />Import observed repository metadata<Icon name="chevronDown" size={16} className="ml-auto shrink-0" /></summary>
          <p className="mt-1 text-body text-text3">Choose the owning project. Importing does not start an agent or enable dispatch. Observations may be old; refresh the scanner or GitHub connection when needed.</p>
          <label className="mt-3 block text-body">Owning project<select className={field} value={selected} onChange={(e) => { setSelected(e.target.value); setAttach(''); }}><option value="">Select a project</option>{snapshot.projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(0, 8)}</option>)}</select></label>
          <label className="mt-3 block text-body">Local checkout association<select className={field} value={attach} onChange={(e) => setAttach(e.target.value)}><option value="">Keep its own local repository identity</option>{snapshot.repositories.filter((r) => r.projectId === selected && r.host === 'github').map((r) => <option value={r.id} key={r.id}>Attach to {r.name} · {r.id.slice(0, 8)}</option>)}</select></label>
          {!snapshot.sources.length && <p className="mt-3 text-body text-text3">No importable observations. Add a local repository or connect GitHub in the repository view.</p>}
          {snapshot.sources.map((source) => <div key={source.id} className="mt-3 min-w-0 break-words border-t pt-3 text-body">
            <p>{source.name} · {source.kind}</p><p className="text-label text-text3">{source.location}</p>
            <p className="text-label text-text3">Observed: {source.observedTs ? new Date(source.observedTs).toLocaleString() : 'not recorded'}</p>
            <Button size="sm" disabled={busy || !selected} onClick={() => void act(() => importPortfolioSource({ projectId: selected, sourceId: source.id, ...(source.kind === 'local' && attach ? { repositoryId: attach } : {}) }), 'Repository metadata imported.')} aria-label={`Import ${source.name}`}>Import or refresh</Button>
          </div>)}
        </details>
      </>}
    </div>
  </PageShell>;
}
