import { useEffect, useRef, useState } from 'react';
import { OperationApproval, TaskReviewRequest, type PlanningTask, type RunDetail } from '@ado/shared';
import type { z } from 'zod';
import { Button, Card } from '../kit';
import { fetchRunDetail, verifyRun } from '../lib/runs';
import { planningRequest } from '../lib/planning';

export function TaskCriterionReview({ task, runId, onChanged, onClose }: { task: PlanningTask; runId: string; onChanged: () => Promise<void>; onClose: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [decisions, setDecisions] = useState(task.acceptance.map((c) => ({ criterionId: c.id, verdict: 'not_checked' as 'pass' | 'fail' | 'not_checked', evidence: '' })));
  const [review, setReview] = useState<{ approval: z.infer<typeof OperationApproval>; request: z.infer<typeof TaskReviewRequest> } | null>(null);
  const evidence = run?.verificationEvidence?.find((e) => e.verdict === 'pass' && e.headSha === run.headSha && e.diffDigest === run.diffDigest);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); void fetchRunDetail(runId).then(setRun).catch((e: Error) => setError(e.message)); }, [runId]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); }
    catch (e) {
      const message = (e as Error).message; setError(message); setReview(null);
      await onChanged().catch(() => setError(`${message}. Planning refresh failed; reload before continuing.`));
      setRun(await fetchRunDetail(runId).catch(() => null));
    }
    finally { setBusy(false); }
  };
  return <Card role="region" aria-label="Task criterion review" className="min-w-0 break-words p-4">
    <h2 ref={title} tabIndex={-1} className="text-title font-semibold">Review task criteria</h2>
    <p className="mt-2 text-body">{task.title} · task version {task.version}</p>
    <p className="mt-2 text-body text-text2">Judge each criterion against the actual result. Test success alone does not prove every criterion. Record what you checked and where its evidence can be found.</p>
    {error && <p role="alert" className="mt-2 text-body text-danger">{error}</p>}
    {!run && !error && <p role="status" className="mt-2 text-body">Loading result…</p>}
    {run && <>
      <p className="mt-2 text-body">Independent verification: {run.verifyVerdict ?? 'not verified'}</p>
      <p className="mt-1 break-all text-label text-text2">Result commit: {run.headSha ?? 'Unavailable'}<br />Content hash: {run.diffDigest ?? 'Unavailable'}</p>
      {evidence && <details className="mt-3 text-body"><summary>Inspect verification evidence</summary><p className="mt-2 break-all">{evidence.command} · exit {evidence.exitCode} · {new Date(evidence.recordedTs).toLocaleString()} · {evidence.id}</p><pre className="mt-2 whitespace-pre-wrap break-all text-label">{evidence.output}</pre></details>}
      <Button className="mt-3" variant="outline" disabled={busy || Boolean(review)} onClick={() => void act(async () => { await verifyRun(runId); setRun(await fetchRunDetail(runId)); await onChanged(); })}>Run independent verification</Button>
      <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void act(async () => {
        const request = TaskReviewRequest.parse({ operation: 'task.accept', runId, version: task.version, headSha: run.headSha, diffDigest: run.diffDigest, policyVersion: run.approvalPolicyVersion, verificationId: evidence?.id, criteria: decisions });
        const response = await planningRequest(`/tasks/${task.id}/approval`, 'POST', request);
        setReview({ request, approval: OperationApproval.parse(response.approval) });
      }); }}>
        {task.acceptance.map((criterion, index) => <fieldset key={criterion.id} disabled={busy || Boolean(review)} className="min-w-0 space-y-2 border-t pt-3">
          <legend className="text-body font-semibold">{criterion.text} ({criterion.required ? 'required' : 'optional'})</legend>
          <label className="block text-body">Decision<select aria-label={`Decision: ${criterion.text}`} className="mt-1 w-full rounded-tile border bg-card px-3 py-2 text-text1" value={decisions[index].verdict} onChange={(e) => setDecisions(decisions.map((d, i) => i === index ? { ...d, verdict: e.target.value as typeof d.verdict } : d))}><option value="not_checked">Not checked</option><option value="pass">Pass</option><option value="fail">Fail</option></select></label>
          <label className="block text-body">Evidence and reasoning<textarea aria-label={`Evidence: ${criterion.text}`} required maxLength={4000} rows={3} className="mt-1 w-full rounded-tile border bg-card px-3 py-2 text-text1" value={decisions[index].evidence} onChange={(e) => setDecisions(decisions.map((d, i) => i === index ? { ...d, evidence: e.target.value } : d))} /></label>
        </fieldset>)}
        {!review && <Button type="submit" disabled={busy || run.verifyVerdict !== 'pass' || !evidence || task.acceptance.some((c, i) => c.required && decisions[i].verdict !== 'pass')}>Prepare task acceptance</Button>}
      </form>
      {review && <div role="region" aria-label="Confirm task acceptance" className="mt-4 space-y-3 border-t pt-3">
        <p className="text-body">Confirm the criterion decisions above for this exact task and result. This records local acceptance. No merge or publication is performed.</p>
        <p className="text-label text-text2">Review expires {new Date(review.approval.expiresTs).toLocaleString()}.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void act(async () => { await planningRequest(`/tasks/${task.id}/accept`, 'POST', { ...review.request, approvalId: review.approval.id }); await onChanged(); onClose(); })}>Confirm task acceptance</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Revise criterion decisions</Button></div>
      </div>}
    </>}
    <Button className="mt-3" variant="outline" disabled={busy} onClick={onClose}>Close criterion review</Button>
  </Card>;
}
