import { useEffect, useRef, useState } from 'react';
import { ContextPackageRecord, type ContextExecutionBinding, type ContextPackageSummary, type ContextSourcePreview, type PlanningTask } from '@ado/shared';
import { Button, Card } from '../kit';
import { contextRequest, contextStatus, listContext, previewContext, readContext } from '../lib/context';

const field = 'mt-1 w-full min-w-0 rounded-tile border bg-card px-3 py-2 text-body text-text1';
type Selection = { id: string; version: number; checkoutId: string; baseSha: string; files: { path: string }[] };
export function ContextPackagePanel({ task, checkoutId, baseSha, selected, disabled, onSelect, onReady }: {
  task: PlanningTask; checkoutId: string; baseSha: string; selected?: ContextExecutionBinding; disabled: boolean;
  onSelect: (binding?: ContextExecutionBinding) => void; onReady: (ready: boolean) => void;
}) {
  const [paths, setPaths] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<ContextSourcePreview | null>(null), [pkg, setPackage] = useState<ContextPackageRecord | null>(null);
  const [items, setItems] = useState<ContextPackageSummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Awaited<ReturnType<typeof contextStatus>> | null>(null);
  const [submission, setSubmission] = useState<Selection | null>(null);
  const [decision, setDecision] = useState<{ id: string; version: number; digest: string; decision: 'approved_for_context' | 'revoked'; reason: string } | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [loaded, setLoaded] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady;
  const matches = pkg?.payload.source.taskVersion === task.version && pkg.payload.source.checkoutId === checkoutId && pkg.payload.source.baseSha === baseSha;
  const usable = Boolean(pkg && matches && pkg.review?.decision === 'approved_for_context' && !busy && !stale);
  useEffect(() => { onReadyRef.current(!busy && (!selected || Boolean(usable && pkg?.id === selected.id && pkg.digest === selected.digest && pkg.reviewVersion === selected.reviewVersion))); }, [selected, usable, pkg, busy]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (!error && (pkg || preview || fallback)) heading.current?.focus(); }, [pkg?.id, preview, fallback?.packageId, error]);
  const refreshList = async (next?: string) => {
    const result = await listContext(task.id, next);
    setItems(old => next ? [...old, ...result.packages.filter(p => !old.some(o => o.packageId === p.packageId))] : result.packages); setCursor(result.nextCursor); setLoaded(true);
  };
  useEffect(() => { let cancelled = false; void listContext(task.id).then(result => { if (!cancelled) { setItems(result.packages); setCursor(result.nextCursor); setLoaded(true); } }).catch((e: Error) => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [task.id]);
  const work = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setStale(true); setError((e as Error).message); } finally { setBusy(false); }
  };
  const loadPackage = async (id: string) => {
    setConfirmed(false); setDecision(null); setFallback(null);
    try { const next = await readContext(id); setPackage(next); setStale(false); setPreview(null); }
    catch (error) { setPackage(null); setFallback(await contextStatus(id)); throw error; }
  };
  const review = async (kind: 'approved_for_context' | 'revoked') => {
    const current = pkg ? { ...pkg, packageId: pkg.id } : fallback;
    if (!current) return;
    const input = decision ?? { id: crypto.randomUUID(), version: current.reviewVersion, digest: current.digest, decision: kind, reason };
    setDecision(input);
    await contextRequest(`/context/packages/${current.packageId}/review`, 'POST', input);
    setDecision(null); setConfirmed(false); setReason('');
    if (pkg) await loadPackage(pkg.id); else setFallback(await contextStatus(current.packageId));
    await refreshList(); setMessage(kind === 'revoked' ? 'Context review revoked.' : 'Package approved as reference context. Choose it separately for this run.');
  };
  const source = preview ?? pkg?.payload.source;
  return <Card className="my-4 min-w-0 space-y-3 break-words p-4 [&_button]:min-h-11 [&_input]:min-h-11 [&_summary]:min-h-11">
    <h3 className="text-section font-semibold">Reference context</h3>
    <p className="text-body text-text2">Choose committed text files to review. Approval covers these exact bytes as reference material; it grants no extra project access.</p>
    <p className="break-all text-label">{selected ? `Selected package: ${selected.id}, review ${selected.reviewVersion}` : 'No reference package selected.'}</p>
    {selected && <Button variant="outline" disabled={disabled || busy} onClick={() => onSelect()}>Use no reference package</Button>}
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="scroll-mt-48 text-danger">{error}</p>}
    {message && <p role="status">{message}</p>}
    {stale && <p className="text-body">Context information may be stale. Reload the package before selecting or approving it.</p>}
    <details><summary className="cursor-pointer font-medium">Create a context package</summary>
      <label className="mt-2 block">Source paths (one per line)<textarea rows={3} maxLength={4000} className={field} disabled={disabled || busy || Boolean(submission)} value={paths} onChange={e => { setPaths(e.target.value); setPreview(null); }} /></label>
      <p className="mt-1 text-label text-text3">Up to 16 files, 16 KiB each and 64 KiB in total. Leading spaces in filenames are preserved.</p>
      <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || busy || Boolean(submission) || !paths} onClick={() => void work(async () => { setPreview(await previewContext(task.id, { version: task.version, checkoutId, baseSha, files: paths.split(/\r?\n/).filter(Boolean).map(path => ({ path })) })); setPackage(null); setFallback(null); setDecision(null); setConfirmed(false); setStale(false); })}>Preview source files</Button>
      <Button disabled={disabled || busy || (!preview && !submission)} onClick={() => void work(async () => { const input = submission ?? { id: crypto.randomUUID(), version: task.version, checkoutId, baseSha, files: paths.split(/\r?\n/).filter(Boolean).map(path => ({ path })) }; setSubmission(input); const saved = ContextPackageRecord.parse(await contextRequest(`/planning/tasks/${task.id}/context/packages`, 'POST', input)); setPackage(saved); setDecision(null); setFallback(null); setPreview(null); setStale(false); setSubmission(null); setConfirmed(false); await refreshList(); setMessage('Package saved. Review the exact source contents before approval.'); })}>{submission ? 'Retry same package save' : 'Save source package'}</Button>
      {submission && <Button variant="outline" disabled={disabled || busy} onClick={() => { setSubmission(null); setPreview(null); }}>Edit source selection</Button>}</div>
    </details>
    <div><h4 className="font-medium">Saved packages</h4><Button className="mt-2" variant="outline" disabled={disabled || busy} onClick={() => void work(async () => { await refreshList(); if (pkg) await loadPackage(pkg.id); else if (fallback) await loadPackage(fallback.packageId); })}>Reload context packages</Button>
      {!loaded && !error && <p>Loading packages…</p>}{loaded && !items.length && <p>No saved context packages for this task.</p>}
      <ul className="mt-2 space-y-2">{items.map(item => <li key={item.packageId} className="border-t pt-2"><p className="text-label">Task version {item.taskVersion} · {item.decision ?? 'unreviewed'} · base {item.baseSha.slice(0, 12)}</p>{item.recheck && item.recheck !== 'current' && <p className="text-label text-warning">Re-check required: {item.recheck === 'base_moved' ? 'the working copy has moved past this base' : item.recheck === 'task_changed' ? 'the task has changed since this package' : 'the working copy commit is unknown'}. The earlier decision is history, not a current check; create a new package.</p>}<Button className="mt-1 max-w-full whitespace-normal" variant="outline" disabled={disabled || busy} onClick={() => void work(() => loadPackage(item.packageId))}>Open package {item.packageId}</Button></li>)}</ul>
      {cursor && <Button variant="outline" disabled={disabled || busy} onClick={() => void work(() => refreshList(cursor))}>Load older packages</Button>}
    </div>
    {(source || fallback) && <section aria-label="Context package contents" className="min-w-0 space-y-3 border-t pt-3"><h4 ref={heading} tabIndex={-1} className="scroll-mt-48 font-semibold">{pkg ? 'Saved context package' : fallback ? 'Context content unavailable' : 'Source preview'}</h4>
      {pkg && <><p className="break-all text-label">Package: {pkg.id}<br />Digest: {pkg.digest}</p><p>Review: {pkg.review?.decision ?? 'unreviewed'} · version {pkg.reviewVersion}</p><p className="text-label text-text2">Historical decision. Current filesystem freshness has not been checked by this read; approval and start check it again.</p>{!matches && <p role="status">This package belongs to a different task revision, checkout or base. Create a current package to use it.</p>}</>}
      {source && <><p className="text-label">Task version {source.taskVersion} · {source.totalBytes} bytes · {source.files.length} files</p><p className="break-all text-label">Base commit: {source.baseSha}</p>{source.files.map(file => <details key={file.path}><summary className="cursor-pointer break-all">{file.path} · {file.bytes} bytes</summary><p className="break-all text-label text-text3">SHA-256: {file.sha256} · {file.comparison}</p><pre tabIndex={0} aria-label={`Source file ${file.path}`} className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border bg-app p-3 text-body">{file.text}</pre></details>)}</>}
      {fallback && <p>Content could not be loaded. Review {fallback.reviewVersion}: {fallback.decision ?? 'unreviewed'}. You can still revoke this package.</p>}
      {(pkg || fallback) && <><label className="block">Context review reason<input className={field} maxLength={2000} disabled={disabled || busy || Boolean(decision)} value={reason} onChange={e => setReason(e.target.value)} /></label>
        {pkg && <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled || busy || Boolean(decision)} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed these exact files as reference data</label>}
        <div className="flex flex-wrap gap-2">{pkg && <Button disabled={disabled || busy || (stale && !decision) || !matches || !confirmed || !reason.trim() || Boolean(decision && decision.decision !== 'approved_for_context')} onClick={() => void work(() => review('approved_for_context'))}>{decision?.decision === 'approved_for_context' ? 'Retry same reference approval' : 'Approve reference package'}</Button>}
        <Button variant="outline" disabled={disabled || busy || !reason.trim() || Boolean(decision && decision.decision !== 'revoked')} onClick={() => void work(() => review('revoked'))}>Revoke context review</Button>
        {pkg && <Button disabled={disabled || !usable} onClick={() => onSelect({ id: pkg.id, digest: pkg.digest, reviewVersion: pkg.reviewVersion })}>Use this package for the run</Button>}</div>
        {pkg && <details><summary className="cursor-pointer">Review history ({pkg.history.length})</summary><ul>{pkg.history.map(r => <li className="mt-2" key={r.id}>Review {r.version}: {r.decision} · {r.recordedTs}<p className="whitespace-pre-wrap">{r.reason}</p></li>)}</ul></details>}
      </>}
    </section>}
  </Card>;
}
