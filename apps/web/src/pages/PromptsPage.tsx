import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AGENTS,
  PROMPT_CATEGORIES,
  PROMPTS,
  renderAgentDispatch,
  renderPrompt,
  type CustomPromptInputT,
  type PromptCategory,
  type PromptTemplate,
  type SpecializedAgent,
  type TargetModel,
} from '@ado/shared';
import { Button, Card, Chip, Icon, cx, type IconName } from '../kit';
import { TopBarA } from '../chrome/TopBarA';
import { StaleBanner } from '../chrome/StaleBanner';
import { useBus } from '../store/bus';
import {
  deleteCustomPrompt,
  dispatchPrompt,
  fetchCustomPrompts,
  saveCustomPrompt,
} from '../lib/prompts';

const MODELS: Array<{ id: TargetModel; label: string }> = [
  { id: 'any', label: 'Any' },
  { id: 'claude', label: 'Claude' },
  { id: 'gpt', label: 'GPT' },
  { id: 'gemini', label: 'Gemini' },
];

const CAT_ICON: Record<PromptCategory, IconName> = {
  game: 'games',
  mobile: 'grid',
  steam: 'games',
  app: 'code',
  web: 'cloud',
  backend: 'database',
  testing: 'check',
  performance: 'health',
  security: 'lock',
  refactor: 'workflow',
  docs: 'list',
  devops: 'pipeline',
};

const MODEL_LABEL: Record<TargetModel, string> = { any: 'Any model', claude: 'Claude', gpt: 'GPT', gemini: 'Gemini' };

/** Compose the final text for a prompt given the selected model + optional active agent. */
function compose(p: PromptTemplate, model: TargetModel, agent: SpecializedAgent | null): string {
  if (agent && agent.promptIds.includes(p.id)) return renderAgentDispatch(agent, p, model);
  return renderPrompt(p, model);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Custom-prompt editor (add / edit) ────────────────────────────────────────
const BLANK: CustomPromptInputT = {
  title: '',
  category: 'app',
  summary: '',
  tags: [],
  recommendedModel: 'any',
  body: '',
  dispatchable: true,
};

function PromptEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomPromptInputT;
  onSave: (input: CustomPromptInputT) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CustomPromptInputT>(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof CustomPromptInputT>(k: K, v: CustomPromptInputT[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
      await onSave({ ...form, tags });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-9 w-full rounded-tile border-none bg-elevated px-3 text-body text-text1 placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50';

  return (
    <Card className="border-primary/25 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-section font-semibold text-text1">{initial.id ? 'Edit prompt' : 'New prompt'}</p>
        <span className="text-label text-text3">Saved to your library</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-label text-text3">Title</span>
          <input className={field} value={form.title} placeholder="e.g. Generate a level layout" onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-text3">Category</span>
          <select className={field} value={form.category} onChange={(e) => set('category', e.target.value as PromptCategory)}>
            {PROMPT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-text3">Best model</span>
          <select className={field} value={form.recommendedModel} onChange={(e) => set('recommendedModel', e.target.value as TargetModel)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{MODEL_LABEL[m.id]}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-label text-text3">One-line summary</span>
          <input className={field} value={form.summary} placeholder="When to reach for this prompt" onChange={(e) => set('summary', e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-label text-text3">Tags (comma-separated)</span>
          <input className={field} value={tagsText} placeholder="unity, level-design" onChange={(e) => setTagsText(e.target.value)} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-label text-text3">Prompt body — use {'{placeholders}'} for the bits you fill in per run</span>
          <textarea
            className="min-h-[160px] w-full resize-y rounded-tile border-none bg-elevated p-3 font-mono text-body text-text1 placeholder:font-sans placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50"
            value={form.body}
            placeholder={'Role: …\\nTask: {task}.\\nConstraints: …\\nDeliver: …'}
            onChange={(e) => set('body', e.target.value)}
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-body text-text2">
          <input type="checkbox" checked={form.dispatchable} onChange={(e) => set('dispatchable', e.target.checked)} className="h-4 w-4 accent-primary" />
          Can be dispatched to an agent as-is
        </label>
      </div>
      {err ? <p className="mt-3 text-label text-danger">{err}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !form.title.trim() || !form.body.trim()}>
          {initial.id ? 'Save changes' : 'Add to library'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </Card>
  );
}

// ── One prompt card ──────────────────────────────────────────────────────────
function PromptCard({
  p,
  model,
  agent,
  repos,
  onEdit,
  onDelete,
}: {
  p: PromptTemplate;
  model: TargetModel;
  agent: SpecializedAgent | null;
  repos: Array<{ id: string; name: string }>;
  onEdit: (p: PromptTemplate) => void;
  onDelete: (p: PromptTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [repo, setRepo] = useState(repos[0]?.id ?? '');
  const [runMsg, setRunMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cat = PROMPT_CATEGORIES.find((c) => c.id === p.category);
  const text = compose(p, model, agent);
  const usingAgent = Boolean(agent && agent.promptIds.includes(p.id));
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = async () => {
    setCopied(await copyText(text));
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const run = async () => {
    if (!repo) return;
    setBusy(true);
    setRunMsg(null);
    try {
      const { runId } = await dispatchPrompt(repo, text, model === 'any' ? undefined : model);
      setRunMsg({ ok: true, text: `Dispatched ${runId}` });
      setRunOpen(false);
    } catch (e) {
      setRunMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2">
          <Icon name={CAT_ICON[p.category]} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-body font-semibold text-text1">{p.title}</p>
            {p.custom ? <Chip size="sm" tone="violet">Custom</Chip> : null}
          </div>
          <p className="mt-0.5 text-label text-text2">{p.summary}</p>
        </div>
        <Chip size="sm" tone={p.recommendedModel === 'any' ? undefined : 'info'}>
          {MODEL_LABEL[p.recommendedModel]}
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip size="sm">{cat?.title ?? p.category}</Chip>
        {p.tags.slice(0, 4).map((t) => (
          <span key={t} className="text-label text-text3">#{t}</span>
        ))}
      </div>

      {open ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-tile bg-elevated p-3 font-mono text-label leading-relaxed text-text2">
          {text}
        </pre>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Icon name="check" size={13} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Preview'}
        </Button>
        {p.dispatchable ? (
          <Button size="sm" variant="ghost" onClick={() => setRunOpen((o) => !o)} disabled={repos.length === 0}>
            <Icon name="send" size={13} />
            Run in repo
          </Button>
        ) : null}
        {p.custom ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(p)}>Delete</Button>
          </>
        ) : null}
      </div>

      {usingAgent ? (
        <p className="text-label text-text3">
          <Icon name="agents" size={12} className="mr-1 inline" />
          Dispatches with the {agent?.name} agent’s training + loop.
        </p>
      ) : null}

      {runOpen ? (
        <div className="flex items-center gap-2 rounded-tile bg-elevated p-2">
          <select
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-tile border-none bg-card px-2 text-body text-text1 focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => void run()} disabled={busy || !repo}>Dispatch</Button>
        </div>
      ) : null}

      {runMsg ? (
        <p className={cx('text-label', runMsg.ok ? 'text-success' : 'text-danger')}>{runMsg.text}</p>
      ) : null}
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function PromptsPage() {
  const repos = useBus((s) => s.state.repos);
  const repoList = useMemo(() => Object.values(repos).map((r) => ({ id: r.id, name: r.name })), [repos]);

  const [custom, setCustom] = useState<PromptTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<TargetModel>('any');
  const [cat, setCat] = useState<PromptCategory | 'all'>('all');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CustomPromptInputT | null>(null);

  useEffect(() => {
    fetchCustomPrompts()
      .then(setCustom)
      .catch((e) => setError((e as Error).message));
  }, []);

  const all = useMemo(() => [...custom, ...PROMPTS], [custom]);
  const agent = agentId ? AGENTS.find((a) => a.id === agentId) ?? null : null;

  const counts = useMemo(() => {
    const m = new Map<PromptCategory, number>();
    for (const p of all) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [all, cat, query]);

  const pickAgent = (a: SpecializedAgent) => {
    if (agentId === a.id) {
      setAgentId(null);
      return;
    }
    setAgentId(a.id);
    setCat(a.domain);
    setModel(a.recommendedModel);
  };

  const saveEdit = async (input: CustomPromptInputT) => {
    const saved = await saveCustomPrompt(input);
    setCustom((prev) => {
      const rest = prev.filter((p) => p.id !== saved.id);
      return [saved, ...rest];
    });
    setEditing(null);
  };

  const remove = async (p: PromptTemplate) => {
    await deleteCustomPrompt(p.id);
    setCustom((prev) => prev.filter((x) => x.id !== p.id));
  };

  return (
    <div className="min-h-screen min-w-[1280px] bg-app text-text1">
      <TopBarA />
      <StaleBanner />
      <main className="mx-auto max-w-[1100px] px-8 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title font-semibold text-text1">Prompt Library</h1>
            <p className="mt-1 max-w-[72ch] text-body text-text2">
              Curated, model-optimized prompts for real project work — games, mobile, Steam, apps and more.
              Pick a model and each prompt comes out tuned for it. Copy it, or dispatch it straight to a repo.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => setEditing({ ...BLANK })}>
              <Icon name="plus" size={14} />
              New prompt
            </Button>
            <Link to="/command" className="rounded-tile border bg-card px-3 py-2 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1">
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Specialized agents — trained dispatch profiles */}
        <section className="mt-6">
          <p className="mb-2 text-label font-medium uppercase tracking-wider text-text3">Trained agents</p>
          <div className="grid grid-cols-4 gap-3">
            {AGENTS.map((a) => {
              const on = agentId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickAgent(a)}
                  className={cx(
                    'flex flex-col gap-1 rounded-card border p-3 text-left transition-colors duration-150 ease-soft',
                    on ? 'border-primary/50 bg-primary/10' : 'bg-card hover:border-hover hover:bg-elevated/40',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon name={CAT_ICON[a.domain]} size={15} className={on ? 'text-primary' : 'text-text3'} />
                    <span className="text-body font-semibold text-text1">{a.name}</span>
                  </div>
                  <span className="text-label text-text2">{a.blurb}</span>
                  <span className="mt-0.5 text-label text-text3">Loop of {a.loop.length} · {MODEL_LABEL[a.recommendedModel]}</span>
                </button>
              );
            })}
          </div>
          {agent ? (
            <p className="mt-2 text-label text-text3">
              <Icon name="check" size={12} className="mr-1 inline text-primary" />
              {agent.name} on — paired prompts dispatch with its training + loop; exit check: {agent.exitCheck}
            </p>
          ) : null}
        </section>

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-card p-1">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-body transition-colors duration-150 ease-soft',
                  model === m.id ? 'bg-elevated font-medium text-text1' : 'text-text2 hover:text-text1',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-label text-text3">Optimized for {MODEL_LABEL[model]}</span>
          <div className="relative ml-auto max-w-xs flex-1">
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts…"
              aria-label="Search prompts"
              className="h-9 w-full rounded-tile border bg-card pl-9 pr-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <CatChip label="All" count={all.length} active={cat === 'all'} onClick={() => setCat('all')} />
          {PROMPT_CATEGORIES.map((c) => (
            <CatChip
              key={c.id}
              label={c.title}
              count={counts.get(c.id) ?? 0}
              active={cat === c.id}
              onClick={() => setCat(c.id)}
            />
          ))}
        </div>

        {error ? (
          <Card className="mt-6 border-danger/25 bg-danger/10 p-4 text-body text-danger">
            Couldn’t load your custom prompts ({error}). Built-in prompts still work; start the server and set{' '}
            <span className="font-mono">VITE_ACC_TOKEN</span> to save your own.
          </Card>
        ) : null}

        {editing ? (
          <div className="mt-6">
            <PromptEditor initial={editing} onSave={saveEdit} onCancel={() => setEditing(null)} />
          </div>
        ) : null}

        {/* Grid */}
        <div className="mt-6 grid grid-cols-2 gap-4">
          {visible.map((p) => (
            <PromptCard
              key={p.id}
              p={p}
              model={model}
              agent={agent}
              repos={repoList}
              onEdit={(pr) =>
                setEditing({
                  id: pr.id,
                  title: pr.title,
                  category: pr.category,
                  summary: pr.summary,
                  tags: pr.tags,
                  recommendedModel: pr.recommendedModel,
                  body: pr.body,
                  dispatchable: pr.dispatchable,
                })
              }
              onDelete={(pr) => void remove(pr)}
            />
          ))}
        </div>

        {visible.length === 0 ? (
          <Card className="mt-6 p-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3">
                <Icon name="search" size={16} />
              </span>
              <p className="text-body text-text2">No prompts match.</p>
              <p className="text-label text-text3">Try another category or clear the search.</p>
            </div>
          </Card>
        ) : null}

        <p className="mt-8 text-label text-text3">
          {all.length} prompts · {custom.length} custom · built-ins ship with the app
        </p>
      </main>
    </div>
  );
}

function CatChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full px-3 py-1.5 text-body transition-colors duration-150 ease-soft',
        active ? 'bg-primary/15 font-medium text-text1' : 'bg-card text-text2 hover:text-text1',
      )}
    >
      {label}
      <span className="tabular-nums text-text3"> ({count})</span>
    </button>
  );
}
