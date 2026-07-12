import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROMPTS } from '@ado/shared';
import { Icon, cx, type IconName } from '../kit';
import { useBus } from '../store/bus';
import { usePalette } from '../lib/palette';

interface Item {
  id: string;
  label: string;
  sub: string;
  icon: IconName;
  to: string;
}

/**
 * Global command palette — ⌘K or the top-bar search opens it. Searches the live bus
 * (repos, agents), the prompt library, and the app's own pages, and navigates on select.
 * Replaces the previously-inert search inputs. Mounted once at the app root.
 */
export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const navigate = useNavigate();
  const state = useBus((s) => s.state);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K toggles, Esc closes — one global listener (mounted once).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const pages: Item[] = [
      { id: 'p:command', label: 'Command dashboard', sub: 'Page', icon: 'overview', to: '/command' },
      { id: 'p:ops', label: 'Ops dashboard', sub: 'Page', icon: 'grid', to: '/ops' },
      { id: 'p:repos', label: 'Repositories', sub: 'Page', icon: 'repos', to: '/repositories' },
      { id: 'p:agents', label: 'Agents', sub: 'Page', icon: 'agents', to: '/agents' },
      { id: 'p:deploys', label: 'Deployments', sub: 'Page', icon: 'rocket', to: '/deployments' },
      { id: 'p:activity', label: 'Activity', sub: 'Page', icon: 'list', to: '/activity' },
      { id: 'p:prompts', label: 'Prompt Library', sub: 'Page', icon: 'chat', to: '/prompts' },
      { id: 'p:workflows', label: 'Workflows', sub: 'Page', icon: 'workflow', to: '/workflows' },
      { id: 'p:setup', label: 'Setup · Install requirements', sub: 'Page', icon: 'rocket', to: '/setup' },
      { id: 'p:settings', label: 'Settings · Connections', sub: 'Page', icon: 'settings', to: '/settings' },
    ];
    const repos: Item[] = Object.values(state.repos).map((r) => ({
      id: `repo:${r.id}`,
      label: r.name,
      sub: `Repository · ${r.category}`,
      icon: 'repos',
      to: `/repositories?cat=${r.category}`,
    }));
    const agents: Item[] = Object.values(state.agents).map((a) => ({
      id: `agent:${a.id}`,
      label: a.name,
      sub: `Agent · ${a.status}`,
      icon: 'agents',
      to: '/agents',
    }));
    const prompts: Item[] = PROMPTS.map((p) => ({
      id: `prompt:${p.id}`,
      label: p.title,
      sub: `Prompt · ${p.category}`,
      icon: 'chat',
      to: '/prompts',
    }));
    return [...pages, ...repos, ...agents, ...prompts];
  }, [state.repos, state.agents]);

  const query = q.trim().toLowerCase();
  const results = useMemo(
    () =>
      (query
        ? items.filter((it) => it.label.toLowerCase().includes(query) || it.sub.toLowerCase().includes(query))
        : items
      ).slice(0, 40),
    [items, query],
  );

  if (!open) return null;

  const go = (it?: Item) => {
    if (!it) return;
    setOpen(false);
    navigate(it.to);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-card border bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4">
          <Icon name="search" size={16} className="text-text3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[active]);
              }
            }}
            placeholder="Search repositories, agents, prompts, pages…"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-body text-text1 placeholder:text-text3 focus:outline-none"
          />
          <kbd className="rounded border bg-elevated px-1.5 py-0.5 text-label text-text3">esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-body text-text3">No matches</p>
          ) : (
            results.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it)}
                className={cx(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-soft',
                  i === active ? 'bg-elevated' : 'hover:bg-elevated/50',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2">
                  <Icon name={it.icon} size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-text1">{it.label}</span>
                  <span className="block truncate text-label text-text3">{it.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
