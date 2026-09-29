import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CONNECTORS,
  CONNECTOR_BY_ID,
  CONNECTOR_GROUPS,
  type ConnectionStatus,
  type Connector,
  type ConnectorGroup,
} from '@ado/shared';
import { Button, Card, Chip, Icon, StatusDot, cx, type IconName, type Tone } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { fetchConnections, removeConnection, saveConnection, shapeWarning, verifyConnection } from '../lib/connections';
import { timeAgo } from '../lib/time';

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

type Look = { tone: Tone; label: string };
/** One visible state per outcome, so a rejected key never looks like an unchecked one. */
function lookOf(c: Connector, status: ConnectionStatus | undefined, checking: boolean): Look {
  if (checking) return { tone: 'info', label: 'Checking…' };
  if (!status?.configured) return { tone: 'muted', label: 'Not connected' };
  switch (status.authentication) {
    case 'verified': return { tone: 'success', label: 'Connected' };
    case 'rejected': return { tone: 'danger', label: 'Key rejected' };
    case 'unavailable': return { tone: 'warning', label: 'Couldn’t check' };
    case 'stale': return { tone: 'muted', label: 'Needs a fresh check' };
    case 'unsupported': return { tone: 'info', label: 'Saved' };
    case 'unverified': return c.verifiable ? { tone: 'warning', label: 'Saved · not checked yet' } : { tone: 'info', label: 'Saved' };
  }
}

function ConnectorCard({
  c,
  status,
  checking,
  onChanged,
  onCheck,
}: {
  c: Connector;
  status: ConnectionStatus | undefined;
  checking: boolean;
  onChanged: (s: ConnectionStatus) => void;
  onCheck: () => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = status?.configured ?? false;
  const look = lookOf(c, status, checking);
  const warning = shapeWarning(c.id, value);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  // Saving stores the key; verifiable services are then checked straight away.
  const save = () => act(async () => {
    if (!value.trim()) return;
    onChanged(await saveConnection(c.id, value));
    setValue('');
    if (c.verifiable) await onCheck();
  });
  const disconnect = () => act(async () => { onChanged(await removeConnection(c.id)); });
  const message = connected ? status?.verificationMessage ?? (c.verifiable ? null : 'Saved. This connector has no live check yet.') : null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2">
          <Icon name={ICON[c.id] ?? 'integrations'} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-body font-semibold text-text1">{c.name}</p>
            {c.wired ? null : <Chip size="sm">Preview</Chip>}
          </div>
          <p className="mt-0.5 text-label text-text2">{c.blurb}</p>
        </div>
        <StatusDot dotAfter tone={look.tone} label={look.label} />
      </div>

      {connected ? (
        <div className="flex flex-col gap-1 rounded-tile bg-elevated px-3 py-2 text-label">
          <p className="text-text3">
            Key on file <span className="font-mono tabular-nums text-text2">{status?.hint}</span>
            {status?.updatedTs === 'from .env' ? ' · from .env' : ''}
            {status?.checkedTs ? ` · checked ${timeAgo(status.checkedTs)}` : ''}
          </p>
          {message ? <p className={cx(status?.authentication === 'rejected' ? 'text-danger' : 'text-text2')}>{message}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {c.verifiable ? (
              <Button size="sm" variant="ghost" disabled={busy || checking} aria-label={`Check ${c.name} again`} onClick={() => void act(onCheck)}>
                Check again
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => void disconnect()} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : null}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void save(); }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={connected ? 'Paste a new key to replace it…' : c.placeholder}
          aria-label={`${c.name} ${c.keyLabel}`}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 rounded-tile border-none bg-elevated px-3 font-mono text-body text-text1 placeholder:font-sans placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <Button size="sm" type="submit" disabled={busy || !value.trim()}>
          {connected ? 'Replace' : c.verifiable ? 'Connect' : 'Save'}
        </Button>
      </form>
      {warning ? <p className="text-label text-warning">{warning}</p> : null}

      <div className="flex flex-col gap-1.5">
        <p className="text-label text-text3">{c.docsHint ?? `Paste your ${c.keyLabel.toLowerCase()}.`}</p>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {c.altKey ? (
            <a href={c.altKey.url} target="_blank" rel="noopener noreferrer" className="text-label font-medium text-primary transition-colors duration-150 ease-soft hover:text-text1">
              {c.altKey.label} ↗
            </a>
          ) : null}
          <a href={c.getKeyUrl} target="_blank" rel="noopener noreferrer" className="text-label font-medium text-primary transition-colors duration-150 ease-soft hover:text-text1">
            {c.kind === 'url' ? 'Set up' : status?.authentication === 'rejected' ? 'Create a new key' : 'Get a key'} ↗
          </a>
        </span>
      </div>
      {error ? <p role="alert" className="text-label text-danger">{error}</p> : null}
    </Card>
  );
}

export function SettingsPage() {
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const autoChecked = useRef(new Set<string>());

  const check = useCallback(async (id: string) => {
    setChecking((prev) => ({ ...prev, [id]: true }));
    try {
      const status = await verifyConnection(id);
      setStatuses((prev) => ({ ...prev, [id]: status }));
    } finally {
      setChecking((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void fetchConnections()
      .then((list) => {
        setStatuses(Object.fromEntries(list.map((s) => [s.id, s])));
        setError(null);
        // Once per visit, re-check saved keys whose check is missing or expired, so the
        // page opens on a current answer instead of asking for a click.
        for (const s of list) {
          if (!s.configured || !CONNECTOR_BY_ID[s.id]?.verifiable || autoChecked.current.has(s.id)) continue;
          if (s.authentication !== 'unverified' && s.authentication !== 'stale') continue;
          autoChecked.current.add(s.id);
          void check(s.id).catch(() => undefined);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true)); };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [check]);

  const byGroup = useMemo(() => {
    const map = new Map<ConnectorGroup, Connector[]>();
    for (const c of CONNECTORS) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return map;
  }, []);

  const wired = CONNECTORS.filter((c) => c.wired);
  const connectedCount = wired.filter((c) => statuses[c.id]?.authentication === 'verified').length;

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
            Keys stay on this machine. Desktop encrypts them with your OS account; CLI profiles use protected files.
          </span>
          <span className="text-label text-text3">
            {connectedCount} of {wired.length} live integrations connected
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
            {error}
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
              checking={checking[c.id] ?? false}
              onChanged={(s) => setStatuses((prev) => ({ ...prev, [c.id]: s }))}
              onCheck={() => check(c.id)}
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
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{active.map(card)}</div>
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
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{items.map(card)}</div>
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
