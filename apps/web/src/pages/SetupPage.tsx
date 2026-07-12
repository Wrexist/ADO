import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REQUIREMENTS,
  REQ_CATEGORIES,
  type ProbeResult,
  type ReqCategory,
  type ReqStatus,
  type Requirement,
} from '@ado/shared';
import { Button, Card, Chip, Icon, StatusDot, cx, type IconName, type Tone } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { fetchSetup, probeSetup, startInstall, pollInstall } from '../lib/setup';

const STATUS: Record<ReqStatus, { tone: Tone; label: string }> = {
  installed: { tone: 'success', label: 'Installed' },
  missing: { tone: 'warning', label: 'Missing' },
  manual: { tone: 'info', label: 'Action needed' },
  unknown: { tone: 'muted', label: 'Unknown' },
};

const CAT_ICON: Record<ReqCategory, IconName> = {
  runtime: 'health',
  cli: 'code',
  extension: 'wand',
  app: 'grid',
  account: 'user',
  config: 'settings',
};

const ID_ICON: Record<string, IconName> = {
  'claude-cli': 'sparkle',
  'claude-login': 'sparkle',
  'github-token': 'github',
  'gh-cli': 'github',
  vscode: 'code',
  'vscode-claude': 'code',
  node: 'health',
  git: 'branch',
  'project-dirs': 'repos',
  'acc-token': 'lock',
};

/** A copyable shell command row. */
function CommandRow({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the command is visible to copy manually */
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <span className="block text-label text-text3">{label}</span>
        <code className="block truncate font-mono text-label text-text2">{command}</code>
      </div>
      <Button size="sm" variant="outline" onClick={() => void copy()} aria-label={`Copy: ${label}`}>
        {copied ? 'Copied ✓' : 'Copy'}
      </Button>
    </div>
  );
}

function RequirementCard({ req, result, onDone }: { req: Requirement; result?: ProbeResult; onDone: () => void }) {
  const status = result?.status ?? 'unknown';
  const s = STATUS[status];
  const [run, setRun] = useState<Awaited<ReturnType<typeof startInstall>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const install = async () => {
    setErr(null);
    setBusy(true);
    try {
      setRun(await startInstall(req.id));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  // Poll a running install until it finishes, then let the parent re-probe.
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const next = await pollInstall(run.runId);
        if (!alive) return;
        setRun(next);
        if (next.status !== 'running') {
          setBusy(false);
          onDone();
        }
      } catch (e) {
        if (alive) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }
    }, 900);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [run, onDone]);

  const canAutoInstall = status === 'missing' && (result?.installable ?? false);
  const icon = ID_ICON[req.id] ?? CAT_ICON[req.category];

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2">
          <Icon name={icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-body font-semibold text-text1">{req.name}</p>
            <Chip size="sm" tone={req.required ? undefined : 'muted'}>{req.required ? 'Required' : 'Optional'}</Chip>
            {result?.version ? <span className="font-mono text-label text-text3">{result.version}</span> : null}
          </div>
          <p className="mt-0.5 text-label text-text2">{req.blurb}</p>
        </div>
        <StatusDot dotAfter tone={s.tone} label={s.label} />
      </div>

      <p className="text-label text-text3">{req.why}</p>
      {result?.detail ? <p className="text-label text-text3">Note: {result.detail}</p> : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {status === 'installed' ? (
          <span className="inline-flex items-center gap-1.5 text-label text-success">
            <Icon name="check" size={13} /> Ready
          </span>
        ) : canAutoInstall ? (
          <Button size="sm" onClick={() => void install()} disabled={busy}>
            {busy ? 'Installing…' : 'Install'}
          </Button>
        ) : req.deepLink ? (
          <a href={req.deepLink} className="inline-flex h-8 items-center rounded-tile bg-primary px-3 text-body font-medium text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85">
            Open installer ↗
          </a>
        ) : null}

        {req.actionTo ? (
          <Link to={req.actionTo} className="inline-flex h-8 items-center rounded-tile border bg-card px-3 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1">
            {req.actionLabel ?? 'Open'}
          </Link>
        ) : null}

        {req.docsUrl ? (
          <a
            href={req.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-label font-medium text-primary transition-colors duration-150 ease-soft hover:text-text1"
          >
            Docs ↗
          </a>
        ) : null}
      </div>

      {/* Guided commands (shown when it isn't one-click, or as the manual fallback) */}
      {status !== 'installed' && !canAutoInstall && req.commands?.length ? (
        <div className="flex flex-col gap-2 rounded-tile bg-elevated/50 p-3">
          {req.commands.map((c) => (
            <CommandRow key={c.label} label={c.label} command={c.command} />
          ))}
        </div>
      ) : null}

      {/* Live install log */}
      {run ? (
        <div className="rounded-tile border bg-app/60 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-label text-text3">{run.command}</span>
            <span
              className={cx(
                'text-label font-medium',
                run.status === 'done' ? 'text-success' : run.status === 'failed' ? 'text-danger' : 'text-text3',
              )}
            >
              {run.status === 'running' ? 'running…' : run.status === 'done' ? 'done ✓' : `failed (exit ${run.code})`}
            </span>
          </div>
          {run.output.length ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-label text-text2">
              {run.output.slice(-40).join('\n')}
            </pre>
          ) : null}
        </div>
      ) : null}

      {err ? <p className="text-label text-danger">{err}</p> : null}
    </Card>
  );
}

export function SetupPage() {
  const [results, setResults] = useState<ProbeResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setResults(await probeSetup());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // Show cached boot-probe results instantly, then kick a fresh probe.
    fetchSetup()
      .then((r) => setResults(r))
      .catch(() => {})
      .finally(() => void refresh());
  }, [refresh]);

  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  const requiredTotal = REQUIREMENTS.filter((r) => r.required).length;
  const requiredReady = REQUIREMENTS.filter((r) => r.required && byId.get(r.id)?.status === 'installed').length;

  return (
    <PageShell
      title="Setup"
      subtitle="Everything the dashboard needs to run for real — detected live on this machine. One-click install for the command-line tools and extensions; guided steps for desktop apps and account sign-ins (no dashboard can silently install those)."
      actions={
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={checking}>
          {checking ? 'Checking…' : 'Re-check'}
        </Button>
      }
    >
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-label text-success">
          <Icon name="lock" size={13} />
          Installs run on THIS machine via the local server — the command is chosen by the app, never typed in by a page.
        </span>
        <span className="text-label text-text3">
          {requiredReady} of {requiredTotal} required ready
        </span>
      </div>

      {error ? (
        <Card className="mt-6 border-danger/25 bg-danger/10 p-4 text-body text-danger">
          Couldn’t reach the server ({error}). Start the server and set{' '}
          <span className="font-mono">VITE_ACC_TOKEN</span> in <span className="font-mono">.env</span>.
        </Card>
      ) : null}

      {results === null && !error ? <p className="mt-6 text-body text-text3">Checking your machine…</p> : null}

      <div className="mt-8 flex flex-col gap-10">
        {REQ_CATEGORIES.map((cat) => {
          const items = REQUIREMENTS.filter((r) => r.category === cat.id);
          if (items.length === 0) return null;
          return (
            <section key={cat.id}>
              <div className="mb-3">
                <h2 className="text-section font-semibold text-text1">{cat.title}</h2>
                <p className="text-label text-text3">{cat.blurb}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {items.map((req) => (
                  <RequirementCard key={req.id} req={req} result={byId.get(req.id)} onDone={refresh} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
