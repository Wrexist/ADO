import { useEffect, useMemo, useState } from 'react';
import type { AutoReview, AutoReviewSettings, ReviewFinding } from '@ado/shared';
import { Button, Card, Chip, EmptyState, SectionHeader, cx } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { timeAgo } from '../lib/time';
import {
  SEVERITY_TONE,
  VERDICT_TONE,
  dispatchReviewFix,
  fetchAutoReviewSettings,
  runReviewNow,
  setAutoReviewEnabled,
} from '../lib/autoreview';

/** One repo row in the setup strip: opt-in toggle + a manual "Review now". */
function RepoRow({ repoId, name, settings, hasKey, onChanged }: {
  repoId: string;
  name: string;
  settings?: AutoReviewSettings;
  hasKey: boolean;
  onChanged: (s: AutoReviewSettings) => void;
}) {
  const [busy, setBusy] = useState<'toggle' | 'run' | null>(null);
  const [note, setNote] = useState('');
  const enabled = settings?.enabled ?? false;

  const toggle = async () => {
    setBusy('toggle');
    setNote('');
    try {
      onChanged(await setAutoReviewEnabled(repoId, !enabled));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const run = async () => {
    setBusy('run');
    setNote('');
    try {
      await runReviewNow(repoId);
      setNote('Review started — the result appears below when it finishes.');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-1 py-2.5 first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-body font-medium text-text1">{name}</span>
      {enabled ? <Chip tone="success" size="sm" dot>auto on new commits</Chip> : <Chip size="sm">manual only</Chip>}
      <Button size="sm" variant="outline" onClick={toggle} disabled={busy !== null}>
        {busy === 'toggle' ? 'Saving…' : enabled ? 'Disable auto' : 'Enable auto'}
      </Button>
      <Button size="sm" onClick={run} disabled={busy !== null || !hasKey}>
        {busy === 'run' ? 'Starting…' : 'Review now'}
      </Button>
      {note ? <p className="w-full text-label text-text3">{note}</p> : null}
    </div>
  );
}

function FindingRow({ finding, onFix, fixState }: {
  finding: ReviewFinding;
  onFix: () => void;
  fixState: { busy: boolean; note: string };
}) {
  return (
    <div className="rounded-tile border bg-app p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={SEVERITY_TONE[finding.severity]} size="sm" dot>{finding.severity}</Chip>
        <Chip size="sm">{finding.category}</Chip>
        <span className="min-w-0 flex-1 truncate text-body font-medium text-text1">{finding.title}</span>
      </div>
      <p className="mt-1.5 font-mono text-label text-text3">
        {finding.file}
        {finding.line ? `:${finding.line}` : ''}
      </p>
      <p className="mt-2 text-body text-text2">{finding.detail}</p>
      <p className="mt-1.5 text-body text-text2">
        <span className="font-medium text-text1">Fix: </span>
        {finding.suggestion}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onFix} disabled={fixState.busy}>
          {fixState.busy ? 'Dispatching…' : 'Dispatch fix'}
        </Button>
        {fixState.note ? <span className={cx('text-label', fixState.note.startsWith('Dispatched') ? 'text-text2' : 'text-danger')}>{fixState.note}</span> : null}
      </div>
    </div>
  );
}

function ReviewCard({ review, repoName }: { review: AutoReview; repoName: string }) {
  const [fixStates, setFixStates] = useState<Record<number, { busy: boolean; note: string }>>({});
  const setFix = (idx: number, s: { busy: boolean; note: string }) => setFixStates((m) => ({ ...m, [idx]: s }));

  const fix = async (idx: number) => {
    setFix(idx, { busy: true, note: '' });
    try {
      const { runId } = await dispatchReviewFix(review.id, idx);
      setFix(idx, { busy: false, note: `Dispatched — run ${runId.slice(0, 8)} (see Agents).` });
    } catch (e) {
      setFix(idx, { busy: false, note: (e as Error).message });
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-semibold text-text1">{repoName}</span>
        <Chip size="sm">{review.trigger === 'commit' ? 'auto · new commit' : 'manual'}</Chip>
        {review.status === 'running' ? <Chip tone="info" size="sm" dot>reviewing…</Chip> : null}
        {review.status === 'failed' ? <Chip tone="danger" size="sm" dot>failed</Chip> : null}
        {review.status === 'done' && review.verdict ? (
          <Chip tone={VERDICT_TONE[review.verdict]} size="sm" dot>{review.verdict}</Chip>
        ) : null}
        <span className="ml-auto text-label tabular-nums text-text3">{timeAgo(review.ts)}</span>
      </div>

      <p className="mt-2 font-mono text-label text-text3">{review.refLabel}</p>
      {review.stats ? (
        <p className="mt-1 text-label text-text3">
          {review.stats.files} file{review.stats.files === 1 ? '' : 's'} · <span className="text-success">+{review.stats.additions}</span> · <span className="text-danger">−{review.stats.deletions}</span>
          {review.model ? <span> · reviewed by {review.model}</span> : null}
        </p>
      ) : null}

      {review.status === 'failed' && review.error ? (
        <p className="mt-3 break-words rounded-tile bg-elevated px-3 py-2 text-label text-text2">{review.error}</p>
      ) : null}
      {review.summary ? <p className="mt-3 text-body text-text2">{review.summary}</p> : null}

      {review.status === 'done' && review.findings.length === 0 ? (
        <p className="mt-3 text-label text-text3">No issues found in this change.</p>
      ) : null}
      {review.findings.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {review.findings.map((f, i) => (
            <FindingRow key={`${f.file}:${f.line ?? 'x'}:${i}`} finding={f} onFix={() => fix(i)} fixState={fixStates[i] ?? { busy: false, note: '' }} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Auto-Review — structured AI code review of each project's latest change. Read-only by
 * construction (a review never edits code); fixing a finding is a separate, confirmed agent
 * dispatch. Reviews only come from the real model — with no key connected the page says so
 * instead of inventing findings.
 */
export function ReviewsPage() {
  const reviews = useBus((s) => s.state.autoReviews);
  const reposMap = useBus((s) => s.state.repos);
  const repos = useMemo(
    () => Object.values(reposMap).map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [reposMap],
  );
  const [settings, setSettings] = useState<Record<string, AutoReviewSettings>>({});
  const [hasKey, setHasKey] = useState<boolean | null>(null); // null = not loaded yet (honest)
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAutoReviewSettings()
      .then((res) => {
        if (!alive) return;
        setHasKey(res.hasKey);
        setSettings(Object.fromEntries(res.settings.map((s) => [s.repoId, s])));
      })
      .catch((e) => alive && setLoadError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  const repoName = (id: string) => reposMap[id]?.name ?? id;

  return (
    <PageShell
      title="Auto-Review"
      subtitle="Every new commit on an enabled project gets a structured AI code review — verdict, findings, and a suggested fix for each. Reviews are read-only; applying a fix is always a confirmed agent dispatch."
    >
      {hasKey === false ? (
        <Card className="mt-6 border-warning/40 p-4">
          <p className="text-body text-text2">
            <span className="font-medium text-warning">No Anthropic key connected.</span> Auto-Review only ever shows real model
            reviews — connect a key in Settings to enable it. Nothing here is simulated.
          </p>
        </Card>
      ) : null}

      <Card className="mt-6 p-5">
        <SectionHeader title="Projects" />
        <div className="mt-3">
          {repos.length === 0 ? (
            <p className="py-2 text-label text-text3">No projects yet — add one on the Repositories page to review it.</p>
          ) : (
            repos.map((r) => (
              <RepoRow
                key={r.id}
                repoId={r.id}
                name={r.name}
                settings={settings[r.id]}
                hasKey={hasKey === true}
                onChanged={(s) => setSettings((m) => ({ ...m, [s.repoId]: s }))}
              />
            ))
          )}
          {loadError ? <p className="mt-2 text-label text-danger">{loadError}</p> : null}
        </div>
      </Card>

      <div className="mt-6 flex flex-col gap-4">
        {reviews.length === 0 ? (
          <Card className="p-5">
            <EmptyState
              icon="check"
              title="No reviews yet"
              hint="Enable auto-review on a project (new commits get reviewed) or press Review now."
            />
          </Card>
        ) : (
          reviews.map((rv) => <ReviewCard key={rv.id} review={rv} repoName={repoName(rv.repoId)} />)
        )}
      </div>
    </PageShell>
  );
}
