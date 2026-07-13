import { useMemo, useState } from 'react';
import type { DiagnosedBy, IncidentRecord } from '@ado/shared';
import { Button, Card, Chip, EmptyState, cx } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { timeAgo } from '../lib/time';
import { SEVERITY_TONE, dispatchFix } from '../lib/incidents';

const DIAGNOSED_BY_LABEL: Record<DiagnosedBy, string> = {
  claude: 'AI root-cause (Claude)',
  heuristic: 'Offline heuristic',
};

type FixStatus = 'idle' | 'dispatching' | 'done' | 'error';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <p className="text-label font-medium text-text2">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-body text-text2">{value}</p>
    </div>
  );
}

function IncidentCard({ incident, repos }: { incident: IncidentRecord; repos: { id: string; name: string }[] }) {
  const [repoId, setRepoId] = useState(repos[0]?.id ?? '');
  const [status, setStatus] = useState<FixStatus>('idle');
  const [note, setNote] = useState('');
  const dx = incident.diagnosis;

  const onFix = async () => {
    if (!repoId) return;
    setStatus('dispatching');
    setNote('');
    try {
      const { runId } = await dispatchFix(incident.id, repoId);
      setStatus('done');
      setNote(`Dispatched — run ${runId.slice(0, 8)}. Track it on the Agents page.`);
    } catch (e) {
      setStatus('error');
      setNote((e as Error).message);
    }
  };

  return (
    <Card className="p-5">
      {/* header: source · kind · severity · when */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Chip size="sm">{incident.source}</Chip>
          <span className="truncate text-body font-medium text-text1">{incident.kind}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {dx ? (
            <Chip tone={SEVERITY_TONE[dx.severity]} size="sm" dot>
              {dx.severity}
            </Chip>
          ) : (
            <Chip size="sm">diagnosing…</Chip>
          )}
          <span className="text-label tabular-nums text-text3">{timeAgo(incident.ts)}</span>
        </div>
      </div>

      {/* the error itself (raw, honest) */}
      <p className="mt-3 break-words rounded-tile bg-elevated px-3 py-2 font-mono text-label text-text2">{incident.message}</p>
      {incident.context ? <p className="mt-1.5 text-label text-text3">at {incident.context}</p> : null}

      {/* diagnosis + dispatch-a-fix */}
      {dx ? (
        <div className="mt-4 rounded-tile border bg-app p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-label font-medium uppercase tracking-wider text-text3">Diagnosis</p>
            <span className="text-label text-text3">
              {DIAGNOSED_BY_LABEL[dx.diagnosedBy]} · {Math.round(dx.confidence * 100)}% confidence
            </span>
          </div>
          <p className="mt-2 text-body font-medium text-text1">{dx.summary}</p>
          <Field label="Why it happened" value={dx.rootCause} />
          <Field label="Suggested fix" value={dx.suggestedFix} />
          <Field label="Prevention" value={dx.prevention} />

          <div className="mt-4 border-t pt-4">
            <p className="text-label text-text2">Dispatch an agent to implement this fix (runs headless in the project, then verifies):</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                disabled={repos.length === 0 || status === 'dispatching'}
                className="h-9 rounded-tile border bg-card px-3 text-body text-text1 transition-colors duration-150 ease-soft hover:border-hover disabled:opacity-50"
              >
                {repos.length === 0 ? (
                  <option value="">No projects available</option>
                ) : (
                  repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                )}
              </select>
              <Button size="sm" onClick={onFix} disabled={!repoId || status === 'dispatching'}>
                {status === 'dispatching' ? 'Dispatching…' : 'Dispatch fix'}
              </Button>
            </div>
            {repos.length === 0 ? (
              <p className="mt-2 text-label text-text3">Add a project on the Setup page to enable fix dispatch.</p>
            ) : null}
            {note ? <p className={cx('mt-2 text-label', status === 'error' ? 'text-danger' : 'text-text2')}>{note}</p> : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-label text-text3">Diagnosing — the root-cause analysis will appear here shortly.</p>
      )}
    </Card>
  );
}

/**
 * Diagnostics — the self-healing surface. Every captured failure (a crashed screen, a server
 * fault, an unhandled rejection) lands here with an AI/heuristic root-cause diagnosis, and a
 * confirmed, repo-scoped "dispatch a fix" that runs a real agent. Reads only from bus state.
 */
export function DiagnosticsPage() {
  const incidents = useBus((s) => s.state.incidents);
  const reposMap = useBus((s) => s.state.repos);
  const repos = useMemo(() => Object.values(reposMap).map((r) => ({ id: r.id, name: r.name })), [reposMap]);
  const open = incidents.filter((i) => i.status === 'open').length;

  return (
    <PageShell
      title="Diagnostics"
      subtitle="When something breaks, the app captures it and asks the AI (or an offline heuristic) why — then you can dispatch a fix. Connect an Anthropic key in Settings for full AI root-cause analysis."
    >
      <div className="mt-6 flex flex-col gap-4">
        {incidents.length === 0 ? (
          <Card className="p-5">
            <EmptyState
              icon="check"
              title="No incidents captured"
              hint="Nothing has broken. Failures that do occur show up here with a root-cause diagnosis and a one-click fix."
            />
          </Card>
        ) : (
          <>
            <p className="text-label text-text3">
              {incidents.length} incident{incidents.length === 1 ? '' : 's'} · {open} awaiting diagnosis
            </p>
            {incidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} repos={repos} />
            ))}
          </>
        )}
      </div>
    </PageShell>
  );
}
