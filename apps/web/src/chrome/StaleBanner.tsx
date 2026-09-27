import { useBus } from '../store/bus';
import { useEffect, useState } from 'react';
import { ACC_TOKEN, SERVER_URL } from '../lib/config';
import type { RecoveryReferenceReport, RecoveryReferenceStatus, RecoveryContentReport } from '@ado/shared';
import { RecoveryQueueReview } from './RecoveryQueueReview';
import { RecoveryAutomationReview } from './RecoveryAutomationReview';

const referenceLabels: Record<RecoveryReferenceStatus, string> = {
  identity_matches: 'Identity matches; content not checked', missing: 'Missing directory or Git metadata',
  replaced: 'Directory or Git identity changed', other_host: 'Registered on another host; not inspected',
  unrecorded: 'Insufficient recorded identity', unavailable: 'Cannot inspect safely',
};

function RecoveryActivationPanel() {
  const [review, setReview] = useState<{ blockers: string[]; token: string | null; references: number; comparedResults: number } | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  async function request(action: 'prepare' | 'activate') {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN }, body: JSON.stringify(action === 'activate' ? { token: review?.token, confirmation } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Recovery review failed');
      if (action === 'prepare') { setReview(data); setConfirmation(''); }
      else setRestart(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Recovery review failed'); setReview(null); }
    finally { setBusy(false); }
  }
  return <details className="mt-3"><summary className="cursor-pointer">Resume manual operation</summary>
    <p className="mt-2">Review local references and saved results again. Unresolved jobs and locks block activation. Startup scanning and scheduled/event automation stay off; credentials and project folders must be configured explicitly.</p>
    {restart ? <p className="mt-2 font-semibold">Manual operation approved. Close and restart ControlOS with this same profile. This session remains paused until restart.</p> : <>
      <button type="button" disabled={busy} className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => void request('prepare')}>{busy ? 'Checking…' : 'Review activation'}</button>
      {review && <div className="mt-2"><p>{review.references} local references · {review.comparedResults} saved results compared</p>
        {review.blockers.length > 0 ? <ul className="list-inside list-disc">{review.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <>
          <label className="mt-2 block">Type ENABLE MANUAL OPERATION<input className="mt-1 block w-full max-w-md rounded border border-current bg-transparent p-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <button type="button" disabled={busy || confirmation !== 'ENABLE MANUAL OPERATION'} className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => void request('activate')}>Approve manual operation after restart</button>
        </>}
      </div>}
    </>}
    {error && <p role="alert" className="mt-2">{error}</p>}
  </details>;
}

function RecoveryReferences() {
  const [content, setContent] = useState<Record<string, RecoveryContentReport['status']>>({});
  const [comparing, setComparing] = useState(false);
  const [report, setReport] = useState<RecoveryReferenceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function inspect() {
    setBusy(true); setError(null); setReport(null); setContent({});
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/references`, { headers: { 'x-acc-token': ACC_TOKEN } });
      if (!response.ok) throw new Error('Reference review unavailable. The profile remains paused.');
      setReport(await response.json() as RecoveryReferenceReport);
    } catch { setError('Reference review unavailable. The profile remains paused.'); }
    finally { setBusy(false); }
  }
  async function compare(id: string) {
    setComparing(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/runs/${encodeURIComponent(id)}/content`, { headers: { 'x-acc-token': ACC_TOKEN } });
      if (!response.ok) throw new Error('Comparison unavailable');
      const result = await response.json() as RecoveryContentReport;
      setContent((current) => ({ ...current, [id]: result.status }));
    } catch { setContent((current) => ({ ...current, [id]: 'unavailable' })); }
    finally { setComparing(false); }
  }
  const contentLabels: Record<RecoveryContentReport['status'], string> = {
    matches_recorded: 'Matches the saved revision and fingerprint at inspection time. This is not a new verification or approval.',
    differs_from_recorded: 'Does not match the saved revision or fingerprint. Review content and Git attribute settings.',
    unavailable: 'Comparison unavailable. No content approval was inferred.',
    not_recorded: 'No complete saved fingerprint or workspace identity. Content remains unverified.',
  };
  return <div className="mt-2">
    <button type="button" disabled={busy} className="rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => void inspect()}>{busy ? 'Inspecting references…' : 'Inspect restored references'}</button>
    {error && <p role="alert" className="mt-2">{error}</p>}
    {report && <div className="mt-2">
      <p>{report.pendingRuns} queued/running records · {report.pendingVerifications} running verification records · {report.retainedLocks} retained locks. These are restored records, not proof of live processes.</p>
      <p>Observed {report.checkedAt}. File content, remote repositories and process termination are not verified. Execution remains paused.</p>
      <details className="mt-2"><summary className="cursor-pointer">Local references ({report.references.length})</summary>
        {report.references.length === 0 ? <p>No local references were recorded. This does not prove local work was backed up.</p> : <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
          {report.references.map((reference) => <li key={`${reference.kind}:${reference.id}`} className="break-all"><strong>{referenceLabels[reference.status]}</strong><br />{reference.kind} · {reference.id}<br />{reference.path ?? 'No path recorded'}
            {reference.kind === 'run_workspace' && <div className="mt-1"><button type="button" className="rounded border border-current px-2 py-1 disabled:opacity-50" disabled={comparing} onClick={() => void compare(reference.id)}>Compare saved result</button>{content[reference.id] && <p>{contentLabels[content[reference.id]]}</p>}</div>}
          </li>)}
        </ul>}
      </details>
    </div>}
  </div>;
}

function RecoveryBanner() {
  const connection = useBus((s) => s.connection);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState(true);
  useEffect(() => {
    if (!ACC_TOKEN) return;
    const controller = new AbortController();
    void fetch(`${SERVER_URL}/api/recovery`, { headers: { 'x-acc-token': ACC_TOKEN }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Recovery status unavailable');
        const state = await response.json() as { recovery?: { mode?: string; restartRequired?: boolean } | null; message?: string };
        if (!controller.signal.aborted) { setMessage(state.recovery ? state.message ?? 'Recovered profile' : null); setReview(state.recovery?.mode === 'review' && !state.recovery.restartRequired); }
      }).catch(() => { /* Keep an already known recovery warning during disconnection. */ });
    return () => controller.abort();
  }, [connection]);
  return message ? <div className="bg-warning/15 px-4 py-3 text-sm text-warning"><p role="status">{message}</p>{review && <><RecoveryReferences /><RecoveryQueueReview /><RecoveryAutomationReview /><RecoveryActivationPanel /></>}</div> : null;
}

/**
 * Honest offline/stale banner (gate p2: "killing the server puts the UI in an honest
 * offline/stale state"). When the stream isn't live, everything on screen is a frozen
 * last-known snapshot — say so rather than letting stale values masquerade as live.
 */
const MESSAGE = {
  reconnecting: 'Connection lost — reconnecting. Values below are the last known state, not live.',
  offline: 'Server offline — no token configured or the server isn’t running. Showing no live data.',
  connecting: 'Connecting to the live data stream…',
} as const;

export function StaleBanner() {
  const connection = useBus((s) => s.connection);
  if (connection === 'live') return <RecoveryBanner />;
  const tone = connection === 'offline' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning';
  return (
    <><RecoveryBanner /><div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-label font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {MESSAGE[connection]}
    </div></>
  );
}
