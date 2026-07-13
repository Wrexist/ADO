import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CONNECTORS,
  CONNECTOR_GROUPS,
  type ConnectionStatus,
  type Connector,
  type ConnectorGroup,
} from '@ado/shared';
import { Button, Card, Chip, Icon, StatusDot, cx, type IconName } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { fetchConnections, removeConnection, saveConnection } from '../lib/connections';

const ICON: Record<string, IconName> = {
  // source
  github: 'github', gitlab: 'code', bitbucket: 'code',
  // ai
  anthropic: 'sparkle', openai: 'sparkle', google: 'sparkle', mistral: 'sparkle',
  xai: 'sparkle', groq: 'sparkle', openrouter: 'sparkle', huggingface: 'sparkle', ollama: 'database',
  // data
  supabase: 'database', firebase: 'database', neon: 'database', planetscale: 'database',
  mongodb: 'database', upstash: 'database',
  // deploy
  vercel: 'rocket', netlify: 'cloud', cloudflare: 'cloud', aws: 'cloud', fly: 'rocket',
  railway: 'pipeline', render: 'cloud',
  // mobile
  appstore: 'rocket', googleplay: 'rocket', expo: 'rocket',
  // gamedev
  steam: 'games', unity: 'games',
  // comms
  slack: 'chat', discord: 'chat', telegram: 'chat', linear: 'list', notion: 'templates',
  // design / observability / payments
  figma: 'wand', sentry: 'health', posthog: 'chart', stripe: 'billing',
};

function ConnectorCard({
  c,
  status,
  onChanged,
}: {
  c: Connector;
  status: ConnectionStatus | undefined;
  onChanged: (s: ConnectionStatus) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const connected = status?.connected ?? false;

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      onChanged(await saveConnection(c.id, value));
      setValue('');
      setMsg('Saved ✓');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      onChanged(await removeConnection(c.id));
      setMsg('Disconnected');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2">
          <Icon name={ICON[c.id] ?? 'integrations'} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-body font-semibold text-text1">{c.name}</p>
            {c.wired ? (
              <Chip tone="success" size="sm">Active</Chip>
            ) : (
              <Chip size="sm">Preview</Chip>
            )}
          </div>
          <p className="mt-0.5 text-label text-text2">{c.blurb}</p>
        </div>
        <StatusDot
          dotAfter
          tone={connected ? 'success' : 'muted'}
          label={connected ? 'Connected' : 'Not set'}
        />
      </div>

      {connected && status?.hint ? (
        <p className="text-label text-text3">
          Key on file: <span className="font-mono tabular-nums text-text2">{status.hint}</span>
          {status.updatedTs && status.updatedTs !== 'from .env' ? '' : status.updatedTs === 'from .env' ? ' · from .env' : ''}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder={connected ? 'Paste a new value to replace…' : c.placeholder}
          aria-label={`${c.name} ${c.keyLabel}`}
          className="h-9 min-w-0 flex-1 rounded-tile border-none bg-elevated px-3 font-mono text-body text-text1 placeholder:font-sans placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <Button size="sm" onClick={() => void save()} disabled={busy || !value.trim()}>
          {connected ? 'Update' : c.wired ? 'Connect' : 'Save key'}
        </Button>
        {connected ? (
          <Button size="sm" variant="ghost" onClick={() => void disconnect()} disabled={busy}>
            Disconnect
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-text3">{c.docsHint ?? `Paste your ${c.keyLabel.toLowerCase()}.`}</span>
        <a
          href={c.getKeyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-label font-medium text-primary transition-colors duration-150 ease-soft hover:text-text1"
        >
          Get {c.kind === 'url' ? 'set up' : 'key'} ↗
        </a>
      </div>
      {msg ? <p className={cx('text-label', msg.includes('✓') || msg === 'Disconnected' ? 'text-success' : 'text-danger')}>{msg}</p> : null}
    </Card>
  );
}

export function SettingsPage() {
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchConnections()
      .then((list) => setStatuses(Object.fromEntries(list.map((s) => [s.id, s]))))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  }, []);

  const byGroup = useMemo(() => {
    const map = new Map<ConnectorGroup, Connector[]>();
    for (const c of CONNECTORS) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return map;
  }, []);

  const connectedCount = Object.values(statuses).filter((s) => s.connected).length;

  return (
    <PageShell
      title="Settings · Connections"
      subtitle="Connect your keys once — each service links straight to where you create the key. Vendor-independent: bring any AI provider, any host."
      actions={
        <Link to="/setup" className="inline-flex items-center gap-1.5 rounded-tile bg-primary px-3 py-2 text-body font-medium text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85">
          <Icon name="rocket" size={14} /> Setup &amp; requirements
        </Link>
      }
    >
      <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-label text-success">
            <Icon name="lock" size={13} />
            Keys are stored in a gitignored file on your machine (mode 600) and never sent back to the browser.
          </span>
          <span className="text-label text-text3">
            {connectedCount} of {CONNECTORS.length} connected
          </span>
        </div>

        <div className="relative mt-4 max-w-md">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter services (github, claude, stripe, steam…)"
            aria-label="Filter services"
            className="h-9 w-full rounded-tile border bg-card pl-9 pr-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none"
          />
        </div>

        {error ? (
          <Card className="mt-6 border-danger/25 bg-danger/10 p-4 text-body text-danger">
            Couldn’t reach the server ({error}). Start the server and set <span className="font-mono">VITE_ACC_TOKEN</span> in <span className="font-mono">.env</span>.
          </Card>
        ) : null}

        {(() => {
          const q = query.trim().toLowerCase();
          const match = (c: Connector) =>
            !q || c.name.toLowerCase().includes(q) || c.id.includes(q) || c.blurb.toLowerCase().includes(q);
          const card = (c: Connector) => (
            <ConnectorCard
              key={c.id}
              c={c}
              status={statuses[c.id]}
              onChanged={(s) => setStatuses((prev) => ({ ...prev, [c.id]: s }))}
            />
          );
          const active = CONNECTORS.filter((c) => c.wired && match(c));
          const previewCount = CONNECTORS.filter((c) => !c.wired && match(c)).length;
          return (
            <>
              {/* Active — wired connectors that do real work the moment you save. */}
              <section className="mt-8">
                <div className="mb-3">
                  <h2 className="text-section font-semibold text-text1">Active integrations</h2>
                  <p className="text-label text-text3">Live now — connecting these does real work in the dashboard.</p>
                </div>
                {active.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">{active.map(card)}</div>
                ) : (
                  <p className="text-label text-text3">No active integrations match “{query}”.</p>
                )}
              </section>

              {/* Everything else — save a key now; it activates in a later release. Collapsed so
                  the working set stands out; auto-opens while searching so results aren't hidden. */}
              {previewCount > 0 ? (
                <details className="group mt-8" open={q.length > 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-section font-semibold text-text1 [&::-webkit-details-marker]:hidden">
                    <Icon name="chevronDown" size={16} className="-rotate-90 text-text3 transition-transform duration-150 ease-soft group-open:rotate-0" />
                    More integrations ({previewCount})
                    <span className="text-label font-normal text-text3">· save a key now, activates in a later release</span>
                  </summary>
                  <div className="mt-4 flex flex-col gap-10">
                    {CONNECTOR_GROUPS.map((group) => {
                      const items = (byGroup.get(group.id) ?? []).filter((c) => !c.wired && match(c));
                      if (items.length === 0) return null;
                      return (
                        <section key={group.id}>
                          <div className="mb-3">
                            <h3 className="text-body font-semibold text-text1">{group.title}</h3>
                            <p className="text-label text-text3">{group.blurb}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-4">{items.map(card)}</div>
                        </section>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </>
          );
        })()}

        {!loaded ? <p className="mt-6 text-body text-text3">Loading connections…</p> : null}
    </PageShell>
  );
}
