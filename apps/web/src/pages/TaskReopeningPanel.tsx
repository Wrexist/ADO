import { useEffect, useRef, useState } from 'react';
import { PlanningTask } from '@ado/shared';
import { Button, Card } from '../kit';
import { planningRequest } from '../lib/planning';

export function TaskReopeningPanel({ task, runId, onComplete, onClose }: { task: PlanningTask; runId: string; onComplete: (task: PlanningTask) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<{ runId: string; version: number; reason: string; idempotencyKey: string } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  return <Card role="region" aria-label="Revise completed task" className="min-w-0 break-words p-4">
    <h2 ref={title} tabIndex={-1} className="text-title font-semibold">Revise completed task</h2>
    <p className="mt-2 text-body">{task.title} · version {task.version}</p>
    <p className="mt-2 text-body text-text2">Return this task to a draft for editing. Existing task acceptance and pending reviews are invalidated; previous runs, decisions and working copies are retained. This does not start a job. A later run needs a new reviewed checkout and base; prior working-copy changes are not carried over automatically.</p>
    {error && <p role="alert" className="mt-2 text-body text-danger">{error}</p>}
    <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); const body = request ?? { runId, version: task.version, reason, idempotencyKey: crypto.randomUUID() }; setRequest(body); setBusy(true); setError(''); void (async () => {
      try { const response = await planningRequest(`/tasks/${task.id}/reopen`, 'POST', body); await onComplete(PlanningTask.parse(response.task)); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    })(); }}>
      <label className="block text-body">Reason for revision<textarea aria-label="Reason for revision" required maxLength={4000} rows={3} disabled={busy || Boolean(request)} className="mt-1 w-full rounded-tile border bg-card px-3 py-2 text-text1" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {request && <p className="text-body text-text2">Retry sends the same revision request and key.</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{request ? 'Retry revision request' : 'Return task to draft'}</Button><Button variant="outline" disabled={busy} onClick={onClose}>Close revision request</Button></div>
    </form>
  </Card>;
}
