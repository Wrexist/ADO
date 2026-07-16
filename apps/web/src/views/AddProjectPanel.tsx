import { useEffect, useRef, useState } from 'react';
import { Button, Card, Icon, cx } from '../kit';
import { addProject, listProjects, removeProject } from '../lib/projects';
import { cloneFromGithub } from '../lib/projectSettings';

/** Last two path segments — enough to tell tracked folders apart in the picker. */
const shortDir = (d: string): string => {
  const parts = d.split('/').filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : d;
};

/**
 * Add a project folder to scan — no .env editing, no restart. The server persists the dir
 * and rescans live, so repos stream into the dashboard over SSE. Honest: it reports the real
 * repo count the scan found (0 if the folder holds no git repos), never a fabricated success.
 */
export function AddProjectPanel({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [ghRepo, setGhRepo] = useState('');
  const [ghDir, setGhDir] = useState(''); // '' = server default (first tracked folder)
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneMsg, setCloneMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [dirs, setDirs] = useState<string[]>([]);
  const [envDirs, setEnvDirs] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Store-managed dirs first (matches the server's default-destination order), env dirs after.
  const allDirs = [...dirs, ...envDirs.filter((d) => !dirs.includes(d))];

  const refresh = () => {
    void listProjects()
      .then((r) => {
        setDirs(r.dirs);
        setEnvDirs(r.envDirs);
      })
      .catch(() => {
        /* offline — the panel still works once the server is reachable */
      });
  };
  useEffect(() => {
    refresh();
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = async () => {
    const dir = path.trim();
    if (!dir || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { repos } = await addProject(dir);
      setPath('');
      setMsg({ tone: 'ok', text: `Added — tracking ${repos} ${repos === 1 ? 'repo' : 'repos'}. They'll appear below.` });
      refresh();
      onDone?.();
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const drop = async (dir: string) => {
    try {
      setDirs(await removeProject(dir));
    } catch {
      /* ignore — refresh will reconcile */
    }
  };

  const submitClone = async () => {
    const repo = ghRepo.trim();
    if (!repo || cloneBusy) return;
    setCloneBusy(true);
    setCloneMsg(null);
    try {
      const { dir } = await cloneFromGithub(repo, ghDir || undefined);
      setGhRepo('');
      setCloneMsg({ tone: 'ok', text: `Cloned to ${dir} — scanning now, it'll appear below.` });
      refresh();
      onDone?.();
    } catch (e) {
      setCloneMsg({ tone: 'err', text: (e as Error).message });
    } finally {
      setCloneBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Icon name="repos" size={15} className="text-primary" />
        <p className="text-body font-semibold text-text1">Add a project folder</p>
      </div>
      <p className="mt-1 text-label text-text3">
        Point at a git repo, or a folder that holds several repos. We scan it live — no restart.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          placeholder="~/code/my-app  or  ~/code"
          aria-label="Project folder path"
          className="h-9 flex-1 rounded-tile border bg-elevated px-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none"
        />
        <Button onClick={() => void submit()} disabled={busy || !path.trim()}>
          {busy ? 'Scanning…' : 'Add & scan'}
        </Button>
      </div>

      {msg ? (
        <p className={cx('mt-2 text-label', msg.tone === 'ok' ? 'text-success' : 'text-danger')}>{msg.text}</p>
      ) : null}

      {/* clone straight from GitHub into the tracked folder — same live-rescan flow */}
      <div className="mt-4 border-t pt-3">
        <div className="flex items-center gap-2">
          <Icon name="github" size={15} className="text-primary" />
          <p className="text-body font-semibold text-text1">…or get it from GitHub</p>
        </div>
        <p className="mt-1 text-label text-text3">
          Paste <span className="font-mono text-text2">owner/repo</span> or a github.com URL — we clone it into your projects folder and scan it. Private repos need GitHub connected in Settings.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={ghRepo}
            onChange={(e) => setGhRepo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitClone();
            }}
            placeholder="wrexist/my-game  or  https://github.com/wrexist/my-game"
            aria-label="GitHub repository"
            className="h-9 flex-1 rounded-tile border bg-elevated px-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none"
          />
          {allDirs.length > 1 ? (
            <select
              value={ghDir}
              onChange={(e) => setGhDir(e.target.value)}
              aria-label="Clone into folder"
              title="Which tracked folder to clone into"
              className="h-9 max-w-[220px] rounded-tile border bg-elevated px-2 font-mono text-label text-text2 focus:border-primary/50 focus:outline-none"
            >
              {allDirs.map((d) => (
                <option key={d} value={d === allDirs[0] ? '' : d}>
                  {shortDir(d)}
                </option>
              ))}
            </select>
          ) : null}
          <Button onClick={() => void submitClone()} disabled={cloneBusy || !ghRepo.trim()}>
            {cloneBusy ? 'Cloning…' : 'Clone & scan'}
          </Button>
        </div>
        {cloneMsg ? (
          <p className={cx('mt-2 text-label', cloneMsg.tone === 'ok' ? 'text-success' : 'text-danger')}>{cloneMsg.text}</p>
        ) : null}
      </div>

      {dirs.length > 0 ? (
        <div className="mt-3 border-t pt-3">
          <p className="text-label text-text3">Scanning these folders:</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {dirs.map((d) => (
              <li key={d} className="flex items-center gap-2 text-label">
                <Icon name="code" size={12} className="shrink-0 text-text3" />
                <span className="truncate font-mono text-text2">{d}</span>
                <button
                  type="button"
                  aria-label={`Stop scanning ${d}`}
                  title="Remove"
                  onClick={() => void drop(d)}
                  className="ml-auto shrink-0 rounded px-1 text-body leading-none text-text3 transition-colors duration-150 ease-soft hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {envDirs.length > 0 ? (
        <p className="mt-2 text-label text-text3">
          From <code className="rounded bg-elevated px-1 py-0.5 text-text2">.env</code> (managed there): {envDirs.join(', ')}
        </p>
      ) : null}
    </Card>
  );
}
