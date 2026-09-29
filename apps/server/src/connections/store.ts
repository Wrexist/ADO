/**
 * Connections store — the ONLY place secrets are persisted, in a gitignored JSON file
 * under data/ (same trust model as .env: local-first, 127.0.0.1, file mode 600). Secrets
 * are NEVER returned to the client: callers get a masked hint and separate configuration/check states.
 *
 * Resolution order for any integration: stored value → .env fallback. So existing .env
 * keys keep working, and the Settings page overrides them per-connector.
 */
import { ConnectionFile } from './file';
import { CONNECTOR_BY_ID, type ConnectionStatus } from '@ado/shared';
import { createHash } from 'node:crypto';

export interface SecretCodec {
  id: string;
  encrypt(value: string): string;
  decrypt(value: string): string;
  legacyDecoders?: Record<string, (value: string) => string>;
}

interface StoredConn {
  value: string;
  updatedTs: string;
  encoding?: string;
}

export class ConnectionsStore {
  private file: ConnectionFile;
  private data: Record<string, StoredConn> = {};
  private checks = new Map<string, { fingerprint: string; at: number; elapsedAt: number; lastWall: number; lastElapsed: number; stale: boolean; state: ConnectionStatus['authentication']; message: string }>();
  private revisions = new Map<string, number>();

  constructor(
    filePath: string,
    private envFallback: (id: string) => string | undefined = () => undefined,
    private codec?: SecretCodec,
    private fetchImpl: typeof fetch = fetch,
    private now: () => number = Date.now,
    private elapsedNow: () => number = () => performance.now(),
  ) {
    this.file = new ConnectionFile(filePath);
    this.load();
  }

  private load(): void {
    const rows = this.file.read();
    const decoded: Record<string, StoredConn> = {};
    let needsMigration = false;
    for (const [id, row] of Object.entries(rows)) {
      const value = row as Partial<StoredConn> | null;
      if (!value || typeof value.value !== 'string' || typeof value.updatedTs !== 'string') {
        throw new Error(`Invalid connection '${id}'; refusing to overwrite the store`);
      }
      const legacy = this.codec?.legacyDecoders;
      const decoder = value.encoding === this.codec?.id ? this.codec?.decrypt
        : value.encoding && legacy && Object.hasOwn(legacy, value.encoding) ? legacy[value.encoding] : undefined;
      if (value.encoding && !decoder) throw new Error('This credential store requires its original OS key provider');
      decoded[id] = { value: value.encoding ? decoder!(value.value) : value.value, updatedTs: value.updatedTs };
      needsMigration ||= value.encoding !== this.codec?.id;
    }
    if (this.codec && needsMigration) this.persist(decoded);
    this.data = decoded;
  }

  private persist(data: Record<string, StoredConn>): void {
    const encoded = Object.fromEntries(Object.entries(data).map(([id, row]) => {
      if (!this.codec) return [id, row];
      const value = this.codec.encrypt(row.value);
      if (this.codec.decrypt(value) !== row.value) throw new Error('Credential encryption round-trip failed; original store preserved');
      return [id, { ...row, value, encoding: this.codec.id }];
    }));
    this.file.write(encoded);
  }

  /** The value an integration should use: stored wins, else .env fallback. */
  resolve(id: string): string | undefined {
    return this.data[id]?.value || this.envFallback(id) || undefined;
  }

  set(id: string, value: string): void {
    if (!CONNECTOR_BY_ID[id]) throw new Error(`unknown connector '${id}'`);
    const trimmed = value.trim();
    if (!trimmed) throw new Error('value is empty');
    const next = { ...this.data, [id]: { value: trimmed, updatedTs: new Date().toISOString() } };
    this.persist(next);
    this.data = next;
    this.checks.delete(id); this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
  }

  remove(id: string): void {
    const next = { ...this.data }; delete next[id];
    this.persist(next);
    this.data = next;
    this.checks.delete(id); this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
  }

  /** Public status for one connector — masked, never the secret. */
  private statusOf(id: string): ConnectionStatus {
    const stored = this.data[id];
    const envVal = this.envFallback(id);
    const value = stored?.value || envVal;
    const check = this.checks.get(id);
    const matching = value && check?.fingerprint === this.fingerprint(value) ? check : undefined;
    if (matching && !matching.stale) {
      const wall = this.now(), elapsed = this.elapsedNow();
      // Wall time is displayed; monotonic elapsed time prevents clock adjustment
      // from extending authentication freshness. Once stale, only rechecking renews it.
      matching.stale = !Number.isFinite(wall) || !Number.isFinite(elapsed)
        || wall < matching.lastWall || elapsed < matching.lastElapsed
        || wall - matching.at >= 300000 || elapsed - matching.elapsedAt >= 300000;
      matching.lastWall = wall; matching.lastElapsed = elapsed;
    }
    return {
      id,
      configured: Boolean(value),
      authentication: matching ? matching.stale ? 'stale' : matching.state : 'unverified',
      checkedTs: matching ? new Date(matching.at).toISOString() : null,
      verificationMessage: matching?.message ?? null,
      hint: value ? value.length > 4 ? `••••${value.slice(-4)}` : '••••' : null,
      updatedTs: stored?.updatedTs ?? (envVal ? 'from .env' : null),
    };
  }

  private fingerprint(value: string): string { return createHash('sha256').update(value).digest('hex'); }

  /** Explicit read-only check. A saved key alone never authenticates a connector. */
  async verify(id: string): Promise<ConnectionStatus> {
    if (!Object.hasOwn(CONNECTOR_BY_ID, id)) throw new Error('unknown connector');
    const value = this.resolve(id);
    if (!value) return this.status(id);
    const revision = (this.revisions.get(id) ?? 0) + 1; this.revisions.set(id, revision);
    let state: ConnectionStatus['authentication'] = 'unsupported';
    let message = CONNECTOR_BY_ID[id].kind === 'webhook'
      ? 'Saved. Webhooks are not tested automatically because a test would post a message.'
      : 'Saved. This connector has no live check yet.';
    if (id === 'github') ({ state, message } = await this.checkGithub(value));
    if (id === 'anthropic') ({ state, message } = await this.checkAnthropic(value));
    if (this.revisions.get(id) === revision && this.resolve(id) === value) {
      const at = this.now(), elapsedAt = this.elapsedNow();
      // Invalid clocks cannot produce a serializable verification timestamp.
      if (!Number.isFinite(at) || !Number.isFinite(elapsedAt) || !Number.isFinite(new Date(at).getTime())) this.checks.delete(id);
      else this.checks.set(id, { fingerprint: this.fingerprint(value), at, elapsedAt, lastWall: at, lastElapsed: elapsedAt, stale: false, state, message });
    }
    return this.status(id);
  }

  private async checkGithub(value: string): Promise<{ state: ConnectionStatus['authentication']; message: string }> {
    try {
      const response = await this.fetchImpl('https://api.github.com/user', { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${value}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2026-03-10' } });
      if (response.status !== 200) {
        await response.body?.cancel();
        return response.status === 401
          ? { state: 'rejected', message: 'GitHub rejected this token. It may be expired or revoked; create a new one.' }
          : { state: 'unavailable', message: `GitHub answered ${response.status}; the token could not be checked. Try again shortly.` };
      }
      const body = await response.json().catch(() => null) as { login?: unknown } | null;
      const login = typeof body?.login === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(body.login) ? ` as @${body.login}` : '';
      // Classic tokens report their scopes; fine-grained and app tokens do not.
      const header = response.headers.get('x-oauth-scopes');
      if (header === null) return { state: 'verified', message: `Connected${login}. Fine-grained token: repository access was not checked; missing permissions show as unknown data.` };
      const scopes = header.split(',').map((scope) => scope.trim()).filter(Boolean);
      const access = scopes.includes('repo') ? 'public and private repositories are readable.'
        : scopes.includes('public_repo') ? 'only public repositories are readable (no repo scope).'
        : 'this token has no repo scope, so repositories, pull requests and CI will be missing.';
      return { state: 'verified', message: `Connected${login}; ${access}` };
    } catch { return { state: 'unavailable', message: 'Could not reach GitHub. Check your connection and try again.' }; }
  }

  private async checkAnthropic(value: string): Promise<{ state: ConnectionStatus['authentication']; message: string }> {
    try {
      const response = await this.fetchImpl('https://api.anthropic.com/v1/models?limit=1', { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' } });
      await response.body?.cancel();
      if (response.status === 200) return { state: 'verified', message: 'Connected. Anthropic accepted this API key.' };
      if (response.status === 401) return { state: 'rejected', message: 'Anthropic rejected this API key. It may be disabled or deleted; create a new one.' };
      return { state: 'unavailable', message: `Anthropic answered ${response.status}; the key could not be checked. Try again shortly.` };
    } catch { return { state: 'unavailable', message: 'Could not reach Anthropic. Check your connection and try again.' }; }
  }

  /** Status for every connector in the catalog. */
  statusAll(): ConnectionStatus[] {
    return Object.keys(CONNECTOR_BY_ID).map((id) => this.statusOf(id));
  }

  status(id: string): ConnectionStatus {
    return this.statusOf(id);
  }
}
