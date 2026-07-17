import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgentRun, RunDetail, RunHumanAction } from '@ado/shared';
import { Button, Card, Chip, Icon, cx, type Tone } from '../kit';
import { useBus } from '../store/bus';
import { durationLabel, timeAgo } from '../lib/time';
import { fetchRunDetail, fetchRuns, killRun, setRunOutcome } from '../lib/runs';
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
  const [note, setNote] = useState('');

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
        if (d.timelineState === 'live') timer = setTimeout(load, 2000);
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
      setNote((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmKill(false);
    }
  };

  const again = async () => {
    setBusy(true);
    setNote('');
    try {
      const { runId: newId } = await dispatchPrompt(detail.repoId, detail.task, detail.model === 'default' ? undefined : detail.model);
      setNote(`Dispatched again — run ${newId.slice(0, 12)}.`);
      onChanged();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const judge = async (action: RunHumanAction) => {
    setBusy(true);
    try {
      const updated = await setRunOutcome(detail.id, action);
      setDetail({ ...detail, humanAction: updated.humanAction });
      onChanged(); // the row chip reflects the verdict
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <p className="whitespace-pre-wrap break-words rounded-tile bg-elevated px-3 py-2 text-label text-text2">{detail.task}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-text3">
        <span>model: {detail.model}</span>
        <span>tokens: {fmtTokens(detail.tokensIn)} in · {fmtTokens(detail.tokensOut)} out</span>
        <span>turns: {detail.turns ?? '—'}</span>
        <span>exit: {detail.exitCode ?? '—'}</span>
        {detail.note ? <span className="text-warning">{detail.note}</span> : null}
      </div>

      {/* timeline — live (growing), ended (complete for this boot), or honestly unavailable */}
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
          <Button size="sm" variant="outline" onClick={() => void again()} disabled={busy}>
            {busy ? 'Dispatching…' : 'Dispatch again'}
          </Button>
        )}
        {confirmKill ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirmKill(false)}>Keep running</Button>
        ) : null}
        {note ? <span className={cx('text-label', note.startsWith('Dispatched') || note.startsWith('Kill requested') ? 'text-text2' : 'text-danger')}>{note}</span> : null}
      </div>

      {/* work outcome — one click, feeds the self-learning loop once it un-parks (≥100 runs) */}
      {!inFlight ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-label text-text3">Work outcome:</span>
          {OUTCOMES.map((o) => {
            const active = detail.humanAction === o.action;
            return (
              <button
                key={o.action}
                type="button"
                disabled={busy || active}
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
              {openId === r.id ? <RunDetailBody runId={r.id} onChanged={refresh} /> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
