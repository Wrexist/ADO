import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UniverseSnapshot, UniverseRelation } from '@ado/shared';
import { PageShell } from '../chrome/PageShell';
import { Button, Card } from '../kit';
import { fetchUniverse, universeRequest } from '../lib/universe';

const field = 'mt-1 w-full min-w-0 rounded-tile border bg-card px-3 py-2 text-body text-text1';
const relationLabel: Record<UniverseRelation['kind'], string> = { belongs_to: 'Belongs to', depends_on: 'Depends on', shares_resource: 'Shares resource', related_to: 'Related to' };
const freshResource = () => ({ id: crypto.randomUUID(), projectId: '', title: '', reference: '', source: '' });
const freshRelation = () => ({ id: crypto.randomUUID(), fromKey: '', toKey: '', kind: 'related_to' as UniverseRelation['kind'], source: '' });

export function UniversePage() {
  const [snapshot, setSnapshot] = useState<UniverseSnapshot | null>(null);
  const [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [stale, setStale] = useState(false);
  const [query, setQuery] = useState(''), [kind, setKind] = useState(''), [project, setProject] = useState(''), [selected, setSelected] = useState('');
  const [resource, setResource] = useState(freshResource), [relation, setRelation] = useState(freshRelation);
  const sequence = useRef(0), detailHeading = useRef<HTMLHeadingElement>(null);
  const load = async () => {
    const request = ++sequence.current;
    try { const next = await fetchUniverse(); if (request === sequence.current) { setSnapshot(next); setStale(false); } }
    catch (e) { if (request === sequence.current) { setStale(true); setError((e as Error).message); } }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selected) detailHeading.current?.focus(); }, [selected]);
  const act = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setNote('');
    try { await work(); setNote(success); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const nodes = snapshot?.nodes ?? [], relations = snapshot?.relations ?? [], projects = nodes.filter(n => n.kind === 'project');
  const byKey = new Map(nodes.map(n => [n.key, n]));
  const endpointLabel = (key: string) => `${byKey.get(key)?.title ?? 'Missing record'} · ${key.slice(-8)}`;
  const filtered = nodes.filter(n => (!kind || n.kind === kind) && (!project || n.projectId === project) && `${n.title} ${n.detail} ${n.key}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const current = byKey.get(selected);
  const open = (key: string) => { setSelected(key); if (key === selected) detailHeading.current?.focus(); };
  return <PageShell title="Universe" subtitle="Projects, ideas, milestones and explicit resource references. Explore connections from the list.">
    <div className="mt-5 space-y-5 [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11 [&_summary]:min-h-11">
      <p className="text-body text-text2">Relations are planning notes. They do not move records, change task dependencies or grant an agent access to another project.</p>
      <div className="flex flex-wrap items-center gap-3"><Link className="text-primary" to="/projects">Manage projects</Link><Link className="text-primary" to="/tasks">Tasks, ideas and milestones</Link><Button variant="outline" disabled={busy} onClick={() => { setError(''); void load(); }}>Refresh Universe</Button></div>
      {error && <p role="alert" className="break-words text-danger">{error}</p>}
      {note && <p role="status" className="text-text2">{note}</p>}
      <p className="text-label text-text3">{snapshot ? `Snapshot loaded ${new Date(snapshot.generatedTs).toLocaleString()}.` : stale ? 'Universe could not be loaded.' : 'Loading Universe…'}{stale ? ' Refresh failed; any displayed data is last known and may be stale.' : ''}</p>
      <Card className="p-4">
        <h2 className="text-title font-semibold">Find a record</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label>Search records<input className={field} value={query} onChange={e => setQuery(e.target.value)} /></label>
          <label>Record type<select aria-label="Record type" className={field} value={kind} onChange={e => setKind(e.target.value)}><option value="">All types</option>{['project', 'idea', 'milestone', 'resource'].map(k => <option key={k}>{k}</option>)}</select></label>
          <label>Project filter<select aria-label="Project filter" className={field} value={project} onChange={e => setProject(e.target.value)}><option value="">All projects</option>{projects.map(p => <option key={p.key} value={p.projectId!}>{p.title} · {p.projectId!.slice(0, 8)}</option>)}</select></label>
        </div>
        <p role="status" className="mt-3 text-label text-text3">{filtered.length} of {nodes.length} records shown</p>
      </Card>
      {snapshot && !nodes.length && <p>No records yet. Create a project or capture an idea to begin.</p>}
      {snapshot && nodes.length > 0 && !filtered.length && <p>No records match these filters. Clear search or choose All types / All projects.</p>}
      <ul aria-label="Universe records" className="grid min-w-0 gap-3 md:grid-cols-2">
        {filtered.map(n => <li key={n.key} className="min-w-0"><Card className="h-full min-w-0 break-words p-4"><p className="text-label text-text3">{n.kind} · {n.status}</p><h3 className="mt-1 text-section font-semibold">{n.title}</h3><p className="mt-1 text-label text-text3">{n.source} · version {n.version}</p><p className="text-label text-text3">ID: {n.key.slice(-8)}</p><Button className="mt-3 max-w-full whitespace-normal" variant="outline" onClick={() => open(n.key)} aria-label={`View ${n.kind}: ${n.title} (${n.key.slice(-8)})`}>View record and connections</Button></Card></li>)}
      </ul>
      {current && <Card className="min-w-0 break-words p-4"><h2 ref={detailHeading} tabIndex={-1} className="scroll-mt-32 text-title font-semibold">{current.title}</h2><p className="mt-1 text-label text-text3">{current.kind} · {current.status} · version {current.version}</p><p className="mt-2 whitespace-pre-wrap">{current.detail || 'No additional description recorded.'}</p><p className="mt-2 text-label">Source: {current.source}</p><p className="text-label text-text3">Record: {current.key}</p>{current.projectId && <p className="mt-2">Assigned project: <button className="text-primary underline" onClick={() => open(`project:${current.projectId}`)}>{byKey.get(`project:${current.projectId}`)?.title ?? current.projectId}</button></p>}
        <h3 className="mt-4 font-semibold">Connections</h3>
        {!relations.some(r => r.fromKey === current.key || r.toKey === current.key) && <p className="mt-2 text-text3">No explicit relations recorded.</p>}
        <ul className="mt-2 space-y-2">{relations.filter(r => r.fromKey === current.key || r.toKey === current.key).map(r => <li key={r.id}><span>{relationLabel[r.kind]}{r.toKey === current.key && ['belongs_to', 'depends_on'].includes(r.kind) ? ' (incoming)' : ''}: </span><button className="break-words text-primary underline" onClick={() => open(r.fromKey === current.key ? r.toKey : r.fromKey)}>{endpointLabel(r.fromKey === current.key ? r.toKey : r.fromKey)}</button><p className="text-label text-text3">Source: {r.source}</p></li>)}</ul>
        {current.kind === 'resource' && <Button className="mt-4" variant="outline" disabled={busy || stale} onClick={() => void act(async () => { await universeRequest(`/resources/${current.key.slice(9)}`, 'DELETE', { version: current.version }); setSelected(''); }, 'Resource reference removed.')}>Remove resource reference</Button>}
      </Card>}
      <Card className="min-w-0 p-4"><h2 className="text-title font-semibold">All explicit relations</h2><p className="mt-1 text-label text-text3">This list includes every relation, independently of the record filters. All relations shown here were added manually.</p>
        {!relations.length && <p className="mt-3">No relations recorded yet.</p>}
        <ul className="mt-3 space-y-4">{relations.map(r => <li key={r.id} className="min-w-0 break-words border-t pt-3"><p><button className="text-primary underline" onClick={() => open(r.fromKey)}>{endpointLabel(r.fromKey)}</button> · {relationLabel[r.kind]} · <button className="text-primary underline" onClick={() => open(r.toKey)}>{endpointLabel(r.toKey)}</button></p><p className="mt-1 text-label text-text3">Source: {r.source} · {new Date(r.createdTs).toLocaleString()}</p><Button className="mt-2" size="sm" variant="outline" disabled={busy || stale} aria-label={`Remove relation: ${endpointLabel(r.fromKey)} ${relationLabel[r.kind]} ${endpointLabel(r.toKey)}`} onClick={() => void act(() => universeRequest(`/relations/${r.id}`, 'DELETE', { version: r.version }), 'Relation removed.')}>Remove relation</Button></li>)}</ul>
      </Card>
      <Card className="p-4"><details><summary className="cursor-pointer text-section font-semibold">Add a relation</summary><form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void act(async () => { await universeRequest('/relations', 'POST', relation); setRelation(freshRelation()); }, 'Relation saved.'); }}>
        {(['fromKey', 'toKey'] as const).map((key, i) => <label key={key}>{i ? 'To record' : 'From record'}<select disabled={busy} aria-label={i ? 'To record' : 'From record'} required className={field} value={relation[key]} onChange={e => setRelation({ ...relation, [key]: e.target.value })}><option value="">Select a record</option>{nodes.map(n => <option key={n.key} value={n.key}>{n.kind}: {n.title} · {n.key.slice(-8)}</option>)}</select></label>)}
        <label>Relation type<select disabled={busy} aria-label="Relation type" className={field} value={relation.kind} onChange={e => setRelation({ ...relation, kind: e.target.value as UniverseRelation['kind'] })}>{Object.entries(relationLabel).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>Relation source<input disabled={busy} required maxLength={2000} className={field} value={relation.source} onChange={e => setRelation({ ...relation, source: e.target.value })} /></label><Button type="submit" disabled={busy || stale || !snapshot}>Save relation</Button>
      </form></details></Card>
      <Card className="p-4"><details><summary className="cursor-pointer text-section font-semibold">Add a resource reference</summary><p className="mt-2 text-label text-text3">A stored reference only. ControlOS does not open its address, read files or grant access.</p><form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void act(async () => { await universeRequest('/resources', 'POST', { ...resource, projectId: resource.projectId || null }); setResource(freshResource()); }, 'Resource reference saved.'); }}>
        <label>Resource title<input disabled={busy} required maxLength={200} className={field} value={resource.title} onChange={e => setResource({ ...resource, title: e.target.value })} /></label><label>Resource project<select disabled={busy} aria-label="Resource project" className={field} value={resource.projectId} onChange={e => setResource({ ...resource, projectId: e.target.value })}><option value="">No project assigned</option>{projects.map(p => <option key={p.key} value={p.projectId!}>{p.title} ({p.projectId!.slice(-8)})</option>)}</select></label><label>Reference<input disabled={busy} required maxLength={2000} className={field} value={resource.reference} onChange={e => setResource({ ...resource, reference: e.target.value })} /></label><label>Resource source<input disabled={busy} required maxLength={2000} className={field} value={resource.source} onChange={e => setResource({ ...resource, source: e.target.value })} /></label><Button type="submit" disabled={busy || stale || !snapshot}>Save resource reference</Button>
      </form></details></Card>
    </div>
  </PageShell>;
}
