import { useState } from 'react';
import type { RecoveryAutomationReceipt } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from '../lib/config';

export function RecoveryAutomationReview() {
  const [receipts, setReceipts] = useState<RecoveryAutomationReceipt[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const phrase = (receipt: RecoveryAutomationReceipt) => receipt.definitionPresent ? 'RECORD AUTOMATION HISTORY' : 'ACKNOWLEDGE MISSING AUTOMATION';
  async function load() {
    setBusy(true); setError(null); setSelected(null); setConfirmation('');
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/automation-receipts`, { headers: { 'x-acc-token': ACC_TOKEN } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Receipt review unavailable');
      setReceipts(result.receipts as RecoveryAutomationReceipt[]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Receipt review unavailable'); setReceipts(null); }
    finally { setBusy(false); }
  }
  async function resolve(receipt: RecoveryAutomationReceipt) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${SERVER_URL}/api/recovery/runs/${encodeURIComponent(receipt.runId)}/review-automation`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN }, body: JSON.stringify({ digest: receipt.digest, confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'History review refused; load a fresh review');
      setNotice(`Receipt for ${receipt.runId} reviewed. Jobs, results and writer locks are unchanged.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'History review failed'); setReceipts(null); setSelected(null); }
    finally { setBusy(false); }
  }
  return <details className="mt-3"><summary className="cursor-pointer">Review restored automation history</summary>
    <p className="mt-2">These receipts prove that a job was accepted, not that it succeeded. Review records history only. It does not start, cancel or accept jobs, release locks, or enable execution.</p>
    <button type="button" disabled={busy} className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => void load()}>Load automation receipts</button>
    {error && <p role="alert" className="mt-2">{error}</p>}
    {notice && <p role="status" className="mt-2">{notice}</p>}
    {receipts?.length === 0 && <p className="mt-2">No unreviewed automation receipts. Other recovery blockers may still apply.</p>}
    {receipts && <ul className="mt-2 max-h-96 space-y-4 overflow-y-auto">{receipts.map((receipt) => <li key={receipt.runId} className="break-words">
      <p className="font-semibold">{receipt.automationName ?? 'Missing automation definition'} · {receipt.repoId}</p>
      <p>{receipt.runId} · restored status: {receipt.runStatus} · retained locks: {receipt.retainedLocks}</p>
      <p>Accepted: {receipt.acceptedAt}</p><p className="whitespace-pre-wrap">{receipt.task}</p>
      <p>{receipt.definitionPresent ? 'Record this accepted run in the existing automation history. Its current recipe is unchanged.' : 'Acknowledge the historical receipt without recreating the missing automation or inventing success evidence.'}</p>
      <p>{receipt.reason}</p>
      {receipt.eligible && (selected === receipt.runId ? <div>
        <label className="mt-2 block">Type {phrase(receipt)}<input className="mt-1 block w-full max-w-md rounded border border-current bg-transparent p-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <button type="button" className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" disabled={busy || confirmation !== phrase(receipt)} onClick={() => void resolve(receipt)}>Confirm history review</button>
      </div> : <button type="button" disabled={busy} className="mt-2 rounded border border-current px-3 py-1 disabled:opacity-50" onClick={() => { setSelected(receipt.runId); setConfirmation(''); }}>Review history receipt</button>)}
    </li>)}</ul>}
  </details>;
}
