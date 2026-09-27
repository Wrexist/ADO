import { useState } from 'react';
import type { RecoveryQueuedJob } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from '../lib/config';

export function RecoveryQueueReview() {
  const [jobs, setJobs] = useState<RecoveryQueuedJob[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function load() {
    setBusy(true); setError(null); setSelected(null); setConfirmation('');
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/queue`, { headers: { 'x-acc-token': ACC_TOKEN } });
      if (!response.ok) throw new Error('Queued-job review unavailable');
      setJobs((await response.json() as { jobs: RecoveryQueuedJob[] }).jobs);
    } catch { setError('Queued-job review unavailable. Existing jobs and locks are preserved.'); setJobs(null); }
    finally { setBusy(false); }
  }
  async function cancel(job: RecoveryQueuedJob) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/runs/${encodeURIComponent(job.id)}/cancel-queued`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN }, body: JSON.stringify({ digest: job.digest, confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Cancellation was refused; review the job again');
      setNotice(`Queued job ${job.id} cancelled. History retained; no writer locks released.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Cancellation failed'); setJobs(null); setSelected(null); }
    finally { setBusy(false); }
  }
  return <details className="mt-3"><summary className="cursor-pointer">Review restored queued jobs</summary>
    <p className="mt-2">Only recorded unstarted jobs can be cancelled here. The attempt stays in history and a linked task becomes blocked for review. This does not stop processes or release writer locks.</p>
    <button type="button" disabled={busy} className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => void load()}>Load queued jobs</button>
    {error && <p role="alert" className="mt-2">{error}</p>}
    {notice && <p role="status" className="mt-2">{notice}</p>}
    {jobs?.length === 0 && <p className="mt-2">No queued jobs remain. Other recovery blockers may still apply.</p>}
    {jobs && <ul className="mt-2 max-h-96 space-y-4 overflow-y-auto">{jobs.map((job) => <li key={job.id} className="break-words">
      <p className="font-semibold">{job.repoId} · {job.id}</p><p className="whitespace-pre-wrap">{job.task}</p><p>{job.reason}</p>
      {job.eligible && (selected === job.id ? <div>
        <label className="mt-2 block">Type CANCEL QUEUED JOB<input className="mt-1 block w-full max-w-md rounded border border-current bg-transparent p-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <button type="button" className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" disabled={busy || confirmation !== 'CANCEL QUEUED JOB'} onClick={() => void cancel(job)}>Confirm queued-job cancellation</button>
      </div> : <button type="button" disabled={busy} className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => { setSelected(job.id); setConfirmation(''); }}>Review cancellation</button>)}
    </li>)}</ul>}
  </details>;
}
