import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONNECTOR_BY_ID, type ConnectionStatus, type ProbeResult } from '@ado/shared';
import { Button, Card, Icon, cx } from '../../kit';
import { AddProjectPanel } from '../AddProjectPanel';
import { listProjects } from '../../lib/projects';
import { fetchSetup, pollInstall, startInstall } from '../../lib/setup';
import { fetchConnections, saveConnection, shapeWarning, verifyConnection } from '../../lib/connections';

type StepState = 'done' | 'todo' | 'checking';

interface Snapshot {
  folders: number;
  claudeCli: ProbeResult | undefined;
  claudeLogin: ProbeResult | undefined;
  github: ConnectionStatus | undefined;
}

const ready = (r: ProbeResult | undefined) => r?.status === 'installed' || r?.status === 'verified';

/** Read the real state behind each step; nothing here is assumed done. */
async function load(): Promise<Snapshot> {
  const [projects, setup, connections] = await Promise.all([
    listProjects().catch(() => null),
    fetchSetup().catch(() => [] as ProbeResult[]),
    fetchConnections().catch(() => [] as ConnectionStatus[]),
  ]);
  return {
    folders: projects ? projects.dirs.length + projects.envDirs.length : 0,
    claudeCli: setup.find((r) => r.id === 'claude-cli'),
    claudeLogin: setup.find((r) => r.id === 'claude-login'),
    github: connections.find((c) => c.id === 'github'),
  };
}

export function useSetupSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const refresh = useCallback(() => { void load().then(setSnap); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  return { snap, refresh };
}

/** True when a required first-run step is still open (folders or Claude sign-in). */
export function needsSetup(snap: Snapshot | null): boolean {
  return Boolean(snap && (snap.folders === 0 || !ready(snap.claudeLogin)));
}

function Step({ n, title, state, optional, children }: { n: number; title: string; state: StepState; optional?: boolean; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-t py-4 first:border-t-0 first:pt-0">
      <span
        aria-hidden
        className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-label font-semibold',
          state === 'done' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary')}
      >
        {state === 'done' ? <Icon name="check" size={14} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-text1">
          {title}
          {optional ? <span className="ml-2 text-label font-normal text-text3">optional</span> : null}
          <span className="sr-only">{state === 'done' ? ' — done' : state === 'checking' ? ' — checking' : ' — to do'}</span>
        </p>
        {children}
      </div>
    </li>
  );
}

/** Runs the catalog install/sign-in for a requirement and waits for it to finish. */
function useInstaller(onFinished: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, label: string) => {
    setBusy(label);
    setError(null);
    try {
      let current = await startInstall(id);
      while (current.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        current = await pollInstall(current.runId);
      }
      if (current.status !== 'done') setError(`${label} did not finish. Open Setup for details, or try again.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      onFinished();
    }
  };
  return { busy, error, run };
}

function GithubStep({ status, onChanged }: { status: ConnectionStatus | undefined; onChanged: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connector = CONNECTOR_BY_ID.github;
  const connected = status?.authentication === 'verified';
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveConnection('github', value);
      setValue('');
      const checked = await verifyConnection('github');
      if (checked.authentication !== 'verified') setError(checked.verificationMessage ?? 'GitHub did not accept this token.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onChanged();
    }
  };
  if (connected) return <p className="mt-1 text-label text-text2">{status?.verificationMessage ?? 'Connected.'}</p>;
  const warning = shapeWarning('github', value);
  return (
    <>
      <p className="mt-1 text-label text-text2">Shows pull requests, CI and releases for your repositories. You can skip this and add it later in Settings.</p>
      <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) void connect(); }}>
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a GitHub token"
          aria-label="GitHub token"
          className="h-9 min-w-0 flex-1 rounded-tile border bg-elevated px-3 font-mono text-body text-text1 placeholder:font-sans placeholder:text-text3 focus:border-primary/50 focus:outline-none"
        />
        <Button type="submit" disabled={busy || !value.trim()}>{busy ? 'Checking…' : 'Connect'}</Button>
      </form>
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label">
        <a href={connector.getKeyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-text1">Create a token ↗</a>
        {connector.altKey ? <a href={connector.altKey.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:text-text1">{connector.altKey.label} ↗</a> : null}
      </p>
      {warning ? <p className="mt-1 text-label text-warning">{warning}</p> : null}
      {error ? <p role="alert" className="mt-1 text-label text-danger">{error}</p> : null}
    </>
  );
}

/**
 * First-run checklist on /command: three steps with live status, each with its action
 * inline, so a new user never has to hunt through Setup or Settings. Required: a project
 * folder and a Claude subscription sign-in. GitHub is optional.
 */
export function GettingStarted({ snap, refresh }: { snap: Snapshot | null; refresh: () => void }) {
  const installer = useInstaller(refresh);
  const [addOpen, setAddOpen] = useState(false);
  if (!snap) return <Card className="mt-4 p-5"><p className="text-body text-text3">Checking your setup…</p></Card>;

  const foldersDone = snap.folders > 0;
  const cliDone = ready(snap.claudeCli);
  const loginDone = ready(snap.claudeLogin);
  const required = [foldersDone, loginDone].filter(Boolean).length;

  return (
    <Card className="mt-4 p-5" role="region" aria-label="Get started">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-section font-semibold text-text1">Get started</h2>
          <p className="mt-0.5 text-body text-text2">Three steps and ControlOS is ready to work on your projects.</p>
        </div>
        <span className="text-label text-text3">{required} of 2 required steps done</span>
      </div>

      <ol className="mt-4">
        <Step n={1} title="Add the folder with your code" state={foldersDone ? 'done' : 'todo'}>
          {foldersDone ? (
            <p className="mt-1 text-label text-text2">
              {snap.folders === 1 ? '1 folder' : `${snap.folders} folders`} added. Repositories inside appear below as they are found.{' '}
              <button type="button" className="font-medium text-primary hover:text-text1" onClick={() => setAddOpen((open) => !open)}>{addOpen ? 'Close' : 'Add another'}</button>
            </p>
          ) : (
            <p className="mt-1 text-label text-text2">Pick a Git repository, or a folder that holds several. Nothing is changed in your files.</p>
          )}
          {!foldersDone || addOpen ? <div className="mt-2"><AddProjectPanel onDone={refresh} /></div> : null}
        </Step>

        <Step n={2} title="Sign in to Claude" state={installer.busy ? 'checking' : loginDone ? 'done' : 'todo'}>
          {loginDone ? (
            <p className="mt-1 text-label text-text2">Claude Code is installed and signed in. Agents use your Claude subscription.</p>
          ) : !cliDone ? (
            <>
              <p className="mt-1 text-label text-text2">Agents run through Claude Code on this computer. Install it first.</p>
              <Button className="mt-2" disabled={Boolean(installer.busy) || !snap.claudeCli?.installable} onClick={() => void installer.run('claude-cli', 'Installing Claude Code')}>
                {installer.busy ?? 'Install Claude Code'}
              </Button>
              {!snap.claudeCli?.installable ? <p className="mt-1 text-label text-text3">Automatic install needs Node.js and npm. <Link to="/setup" className="font-medium text-primary hover:text-text1">See install options</Link></p> : null}
            </>
          ) : (
            <>
              <p className="mt-1 text-label text-text2">{snap.claudeLogin?.detail ?? 'Sign in with your Claude account. Your browser opens to finish.'}</p>
              <Button className="mt-2" disabled={Boolean(installer.busy)} onClick={() => void installer.run('claude-login', 'Waiting for sign-in in your browser…')}>
                {installer.busy ?? 'Sign in'}
              </Button>
            </>
          )}
          {installer.error ? <p role="alert" className="mt-1 text-label text-danger">{installer.error}</p> : null}
        </Step>

        <Step n={3} title="Connect GitHub" optional state={snap.github?.authentication === 'verified' ? 'done' : 'todo'}>
          <GithubStep status={snap.github} onChanged={refresh} />
        </Step>
      </ol>
    </Card>
  );
}

/** Once repositories exist, a slim reminder only while a required step is still open. */
export function FinishSetupBanner({ snap }: { snap: Snapshot | null }) {
  if (!needsSetup(snap)) return null;
  const what = snap!.folders === 0 ? 'Add a project folder' : 'Sign in to Claude';
  return (
    <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-card border border-warning/30 bg-warning/10 px-4 py-3">
      <p className="text-body text-text1">Finish setup: {what} so agents can work on your projects.</p>
      <Link to="/setup" className="text-body font-medium text-primary hover:text-text1">Open Setup →</Link>
    </div>
  );
}
