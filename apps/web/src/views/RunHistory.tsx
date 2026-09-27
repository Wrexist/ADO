import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgentRun, RunDetail, RunHumanAction, OperationApproval } from '@ado/shared';
import { Button, Card, Chip, Icon, cx, type Tone } from '../kit';
import { useBus } from '../store/bus';
import { durationLabel, timeAgo } from '../lib/time';
import { fetchRunDetail, fetchRuns, killRun, setRunOutcome, verifyRun, reconcileRun, prepareRunAcceptance, controlVerification } from '../lib/runs';
import { dispatchPrompt } from '../lib/prompts';

const STATUS_TONE: Record<AgentRun['status'], Tone> = {
  queued: 'warning',
  running: 'info',
  done: 'success',
  failed: 'danger',
};

const fmtTokens = (n: number | null): string => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

const OUTCOMES: Array<{ action: RunHumanAction; label: string }> = [
  { action: 'accepted', label: 'Accepted' },
  { action: 'corrected', label: 'Corrected' },
  { action: 'redone', label: 'Redone' },
];
const OUTCOME_TONE: Record<RunHumanAction, Tone> = { accepted: 'success', corrected: 'warning', redone: 'danger' };

/** Expanded run detail: live timeline (polls while running) + final report + controls. */
function RunDetailBody({ runId, onChanged }: { runId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [err, setErr] = useState('');
  const [confirmKill, setConfirmKill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [note, setNoteValue] = useState('');
  const [noteIsError, setNoteIsError] = useState(false);
  const setNote = (value: string) => { setNoteValue(value); setNoteIsError(false); };
  const setErrorNote = (value: string) => { setNoteValue(value); setNoteIsError(true); };
  const [review, setReview] = useState<OperationApproval | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);

  // Load, then poll every 2s while the run is live so the timeline grows in place.
  const wasLive = useRef(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const d = await fetchRunDetail(runId);
        if (!alive) return;
        setDetail(d);
        // Terminal transition: the parent row still says running/queued — refresh it too.
        if (wasLive.current && d.timelineState !== 'live') onChanged();
        wasLive.current = d.timelineState === 'live';
        // Verification has a separate lifecycle after the agent has exited.
        // Poll while expanded so another client can also stop/recheck it.
        timer = setTimeout(load, 2000);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId]); // onChanged is a stable parent callback — deliberately not a dependency

  if (err) return <p className="mt-2 text-label text-danger">{err}</p>;
  if (!detail) return <p className="mt-2 text-label text-text3">Loading…</p>;

  const inFlight = detail.status === 'running' || detail.status === 'queued';
  const verification = detail.verificationAttempts?.[0];
  const verificationControl = async (action: 'stop' | 'reconcile') => {
    setControlBusy(true);
    try {
      await controlVerification(detail.id, action);
      setDetail(await fetchRunDetail(detail.id));
      setNote(action === 'stop' ? 'Verification stop requested. Waiting for process confirmation.' : 'Verification processes stopped. The interrupted attempt was not retried.');
      onChanged();
    } catch (error) { setErrorNote((error as Error).message); }
    finally { setControlBusy(false); }
  };
  const refreshFailedReview = async (error: Error) => {
    setReview(null);
    setErrorNote(error.message);
    try { setDetail(await fetchRunDetail(detail.id)); onChanged(); }
    catch { setErr('Could not refresh the result after review failed. Reload before reviewing again.'); }
  };

  const kill = async () => {
    if (!confirmKill) {
      setConfirmKill(true);
      return;
    }
    setBusy(true);
    try {
      await killRun(detail.id);
      setNote('Kill requested — the run will finish as failed.');
      onChanged();
    } catch (e) {
      setErrorNote((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmKill(false);
    }
  };

  const again = async () => {
    setBusy(true);
    setNote('');
    try {
      const { runId: newId } = await dispatchPrompt(detail.repoId, detail.task, detail.model === 'default' ? undefined : detail.model, detail.provider);
      setNote(`Dispatched again — run ${newId.slice(0, 12)}.`);
      onChanged();
    } catch (e) {
      setErrorNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const judge = async (action: RunHumanAction, confirmed?: OperationApproval) => {
    setBusy(true);
    try {
      if (action === 'accepted' && detail.approvalPolicyVersion && !confirmed) {
        setReview(await prepareRunAcceptance(detail.id, { headSha: detail.headSha, diffDigest: detail.diffDigest, policyVersion: detail.approvalPolicyVersion }));
        setNote('Review the exact result below before confirming.');
        return;
      }
      await setRunOutcome(detail.id, action, confirmed ? { headSha: confirmed.headSha, diffDigest: confirmed.diffDigest, policyVersion: confirmed.policyVersion, operation: confirmed.operation, approvalId: confirmed.id } : { headSha: detail.headSha, diffDigest: detail.diffDigest });
      setReview(null);
      setDetail(await fetchRunDetail(detail.id));
      setNote('Human decision recorded.');
      onChanged(); // the row chip reflects the verdict
    } catch (e) {
      await refreshFailedReview(e as Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <p className="whitespace-pre-wrap break-words rounded-tile bg-elevated px-3 py-2 text-label text-text2">{detail.task}</p>
      {detail.status === 'queued' && detail.waitingReason && <p role="status" className="mt-2 text-label text-warning">{detail.waitingReason}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-text3">
        <span>{detail.provider ?? 'claude'} · model: {detail.model}</span>
        <span>tokens: {fmtTokens(detail.tokensIn)} in · {fmtTokens(detail.tokensOut)} out</span>
        <span>turns: {detail.turns ?? '—'}</span>
        <span>exit: {detail.exitCode ?? '—'}</span>
        {detail.note ? <span className="text-warning">{detail.note}</span> : null}
      </div>

      {/* timeline — live (growing), ended (complete for this boot), or honestly unavailable */}
      <div className="mt-3 break-words rounded-tile border p-3 text-label text-text2">
        {detail.status === 'done' && detail.workspacePath && <Button size="sm" disabled={busy || detail.verificationLocked} onClick={() => {
          setBusy(true); setReview(null); setNote('Running repository verification...');
          void verifyRun(detail.id).then(() => fetchRunDetail(detail.id)).then((updated) => { setDetail(updated); setNote('Verification recorded. Review the result before accepting.'); })
            .catch(refreshFailedReview).finally(() => setBusy(false));
        }}>Run npm verify</Button>}
        <p>Verification: {detail.verifyVerdict ?? 'not independently verified'}</p>
        {verification && <div className="mt-2 space-y-1">
          <p>Latest verification attempt: {verification.status.replaceAll('_', ' ')}.</p>
          <p>{verification.processTermination === 'confirmed' ? 'Verification processes: stopped.' : verification.processTermination === 'root_exited' ? 'Verification root process exited; whole process tree confirmation is unavailable on this host.' : verification.processTermination === 'not_started' ? 'Verification command did not start.' : 'Verification process stop is not yet confirmed.'}</p>
          {detail.verificationLocked && <p className="text-warning">Verification is holding this repository's writer lock.</p>}
          {detail.verificationLocked && <Button size="sm" variant="outline" disabled={controlBusy} onClick={() => void verificationControl(verification.status === 'running' ? 'stop' : 'reconcile')}>
            {verification.status === 'running' ? 'Stop verification' : 'Recheck verification stop'}
          </Button>}
          {verification.note && <p>{verification.note}</p>}
        </div>}
        {detail.status === 'failed' && detail.processTermination === 'unconfirmed' && <Button size="sm" disabled={busy} onClick={() => {
          setBusy(true);
          void reconcileRun(detail.id).then(() => fetchRunDetail(detail.id)).then((updated) => { setDetail(updated); setNote('Process stop confirmed. The previous attempt remains failed.'); onChanged(); })
            .catch((error: Error) => setErrorNote(error.message)).finally(() => setBusy(false));
        }}>Recheck process stop</Button>}
        {(detail.status === 'done' || detail.status === 'failed') && <p className={detail.processTermination === 'unconfirmed' ? 'text-warning' : undefined}>
          {detail.processTermination === 'confirmed' ? 'Agent processes: stopped.' : detail.processTermination === 'unconfirmed'
            ? 'Process stop is unconfirmed. This repository remains locked.' : 'Process stop confirmation: not recorded.'}
        </p>}
        {detail.workspacePath && <p>Working copy: {detail.workspacePath}</p>}
        {detail.workspacePath && <p>Workspace type: {detail.workspaceKind?.replaceAll('_', ' ') ?? 'not recorded'}</p>}
        {detail.branch && <p>Branch: {detail.branch}</p>}
        {detail.baseSha && <p>Base revision: {detail.baseSha}</p>}
        {detail.headSha && <p>Result revision: {detail.headSha}</p>}
      </div>
      <div className="mt-3">
        <p className="text-label font-medium uppercase tracking-wider text-text3">
          Timeline{detail.timelineState === 'live' ? ' · live' : ''}
        </p>
        {detail.timelineState === 'unavailable' ? (
          <p className="mt-1 text-label text-text3">
            This run predates the current server session — its live timeline wasn't captured. The summary above and the final
            report below are the persisted record.
          </p>
        ) : detail.timeline.length === 0 ? (
          <p className="mt-1 text-label text-text3">No timeline entries yet.</p>
        ) : (
          <div className="mt-1.5 max-h-56 overflow-y-auto rounded-tile border bg-app p-2.5">
            {detail.timeline.map((e, i) => (
              <div key={`${e.ts}-${i}`} className="flex items-baseline gap-2 py-0.5">
                <span className="w-14 shrink-0 font-mono text-label text-text3">{e.ts.slice(11, 19)}</span>
                {e.kind === 'tool' ? (
                  <Chip size="sm" tone="violet">{e.text}</Chip>
                ) : (
                  <span className={cx('min-w-0 flex-1 truncate text-label', e.kind === 'status' ? 'font-medium text-text2' : 'text-text3')}>
                    {e.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {detail.diagnostics && <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-label text-warning">{detail.diagnostics}</pre>}
      {detail.resultText ? (
        <div className="mt-3">
          <p className="text-label font-medium uppercase tracking-wider text-text3">Final report</p>
          <pre className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-tile border bg-app p-3 text-label text-text2">
            {detail.resultText}
          </pre>
        </div>
      ) : detail.status === 'done' || detail.status === 'failed' ? (
        <p className="mt-3 text-label text-text3">No final report captured for this run.</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {inFlight ? (
          <Button size="sm" variant="outline" onClick={() => void kill()} disabled={busy}
            className={confirmKill ? 'border-danger/60 text-danger' : ''}>
            {confirmKill ? 'Confirm kill' : detail.status === 'queued' ? 'Cancel run' : 'Kill run'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void again()} disabled={busy || detail.processTermination === 'unconfirmed'}>
            {busy ? 'Dispatching…' : 'Dispatch again'}
          </Button>
        )}
        {confirmKill ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirmKill(false)}>Keep running</Button>
        ) : null}
        {note ? <span role={noteIsError ? 'alert' : 'status'} className={cx('text-label', noteIsError ? 'text-danger' : 'text-text2')}>{note}</span> : null}
      </div>

      {/* Work outcomes are human decisions; versioned acceptance requires a prepared review. */}
      {!inFlight ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-label text-text3">Work outcome:</span>
          {OUTCOMES.map((o) => {
            const active = detail.humanAction === o.action;
            return (
              <button
                key={o.action}
                type="button"
                disabled={busy || active || Boolean(review)}
                onClick={() => void judge(o.action)}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-label transition-colors duration-150 ease-soft',
                  active ? 'border-primary/60 bg-primary/15 text-primary' : 'text-text3 hover:border-hover hover:text-text1',
                )}
              >
                {o.label}
              </button>
            );
          })}
          <span className="text-label text-text3">
            {detail.humanAction ? '' : 'not judged yet'}
          </span>
        </div>
      ) : null}
      {review && <section aria-label="Confirm result acceptance" className="mt-3 space-y-2 break-words rounded-tile border p-3 text-label">
        <h3 ref={reviewHeading} tabIndex={-1} className="font-medium">Accept this verified result?</h3>
        <p>This records your acceptance of this result. It does not merge or deploy.</p>
        <p>Repository: {review.repoId}</p>
        <p>Revision: {review.headSha}</p>
        <p>Content digest: {review.diffDigest}</p>
        <p>Operation: {review.operation}</p>
        <p>Policy version: {review.policyVersion}</p>
        <p>Review expires: {new Date(review.expiresTs).toLocaleString()}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void judge('accepted', review)}>Confirm acceptance</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReview(null); setNote(''); }}>Back</Button>
        </div>
      </section>}
      {Boolean(detail.approvalHistory?.length) && <details className="mt-3 break-words text-label">
        <summary>Recent result reviews</summary>
        {detail.approvalHistory!.map((entry) => <div key={entry.id} className="mt-2">
          <p>
          {entry.consumedTs ? 'Acceptance recorded' : entry.revokedTs ? 'Review revoked' : Date.parse(entry.expiresTs) <= Date.now() ? 'Review expired' : 'Review pending'}
          {' · '}{entry.operation}{' · '}{entry.actorId}{' · '}{entry.consumedTs ?? entry.revokedTs ?? entry.issuedTs}
          {entry.revokeReason && ` · ${entry.revokeReason}`}
          </p>
          <p>Revision: {entry.headSha}</p>
          <p>Content digest: {entry.diffDigest}</p>
          <p>Policy version: {entry.policyVersion}</p>
        </div>)}
      </details>}
    </div>
  );
}

/**
 * Run history — the REAL persisted run log (survives restarts), newest first. Click a run
 * for the tool-by-tool timeline (live while running), the agent's final report, kill/cancel
 * for in-flight runs, and one-click re-dispatch for finished ones.
 * `repoId` scopes the list to one project; `?run=<id>` auto-expands that run once (deep links).
 */
export function RunHistory({ repoId }: { repoId?: string }) {
  const repos = useBus((s) => s.state.repos);
  const [rows, setRows] = useState<AgentRun[] | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [params] = useSearchParams();
  const autoOpened = useRef<string | null>(null);

  const refresh = () => {
    fetchRuns(repoId, 30)
      .then((r) => {
        setRows(r);
        setErr('');
      })
      .catch((e) => {
        setRows([]);
        setErr((e as Error).message);
      });
  };
  useEffect(refresh, [repoId]);
  const pending = rows?.some((row) => row.status === 'queued' || row.status === 'running') ?? false;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [repoId, pending]);

  // Deep link (?run=<id>): expand that run and bring it into view — only if it's actually in
  // the list. Re-arms when the target id changes (e.g. picking another run from the palette).
  useEffect(() => {
    const want = params.get('run');
    if (want && autoOpened.current !== want && rows?.some((r) => r.id === want)) {
      autoOpened.current = want;
      setOpenId(want);
      setTimeout(() => {
        document.getElementById(`run-${want}`)?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      }, 60);
    }
  }, [rows, params]);

  return (
    <Card className="mt-3 p-2">
      {rows === null ? (
        <p className="p-4 text-label text-text3">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-center text-body text-text3">
          {err ? err : 'No runs recorded yet — dispatch an agent and its full history lands here.'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-white/[0.05]">
          {rows.map((r) => (
            <div key={r.id} id={`run-${r.id}`} className="scroll-mt-4 px-3 py-3">
              <button
                type="button"
                onClick={() => setOpenId((v) => (v === r.id ? null : r.id))}
                aria-expanded={openId === r.id}
                className="flex w-full items-center gap-3 text-left"
              >
                <Icon name="agents" size={15} className="shrink-0 text-text3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-text1">{r.task.split('\n')[0].slice(0, 100)}</p>
                  <p className="truncate text-label text-text3">
                    {repos[r.repoId]?.name ?? r.repoId} · {timeAgo(r.startedTs)}
                    {r.durationMs != null ? ` · ${durationLabel(Math.round(r.durationMs / 1000))}` : ''}
                  </p>
                </div>
                {r.humanAction ? <Chip tone={OUTCOME_TONE[r.humanAction]} size="sm">{r.humanAction}</Chip> : null}
                <Chip tone={STATUS_TONE[r.status]} size="sm" dot>{r.status}</Chip>
                <Icon name="chevronDown" size={14} className={cx('shrink-0 text-text3 transition-transform duration-150 ease-soft', openId === r.id ? 'rotate-180' : '')} />
              </button>
              {r.status === 'queued' && r.waitingReason && openId !== r.id && <p className="mt-1 break-words text-label text-warning">{r.waitingReason}</p>}
              {openId === r.id ? <RunDetailBody runId={r.id} onChanged={refresh} /> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
