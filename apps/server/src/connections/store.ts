/**
 * Connections store — the ONLY place secrets are persisted, in a gitignored JSON file
 * under data/ (same trust model as .env: local-first, 127.0.0.1, file mode 600). Secrets
 * are NEVER returned to the client: callers get a masked hint and separate configuration/check states.
 *
 * Resolution order for any integration: stored value → .env fallback. So existing .env
 * keys keep working, and the Settings page overrides them per-connector.
 */
import { readJsonStore, writeJsonStore } from '../lib/jsonStore';
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
  private data: Record<string, StoredConn> = {};
  private checks = new Map<string, { fingerprint: string; at: number; state: ConnectionStatus['authentication']; message: string }>();
  private revisions = new Map<string, number>();

  constructor(
    private filePath: string,
    private envFallback: (id: string) => string | undefined = () => undefined,
    private codec?: SecretCodec,
    private fetchImpl: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {
    this.load();
  }

  private load(): void {
    const rows = readJsonStore(this.filePath) ?? {};
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
    writeJsonStore(this.filePath, encoded);
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
    return {
      id,
      configured: Boolean(value),
      authentication: matching ? this.now() - matching.at > 300000 ? 'stale' : matching.state : 'unverified',
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
    let message = 'No credential verification is implemented for this connector.';
    if (id === 'github') {
      try {
        const response = await this.fetchImpl('https://api.github.com/user', { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${value}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2026-03-10' } });
        state = response.status === 200 ? 'verified' : response.status === 401 ? 'rejected' : 'unavailable';
        message = state === 'verified' ? 'GitHub accepted this credential. Repository permissions were not checked.' : state === 'rejected' ? 'GitHub rejected this credential.' : 'GitHub verification was inconclusive; retry later.';
        await response.body?.cancel();
      } catch { state = 'unavailable'; message = 'GitHub could not be verified; check connectivity and retry.'; }
    }
    if (this.revisions.get(id) === revision && this.resolve(id) === value) this.checks.set(id, { fingerprint: this.fingerprint(value), at: this.now(), state, message });
    return this.status(id);
  }

  /** Status for every connector in the catalog. */
  statusAll(): ConnectionStatus[] {
    return Object.keys(CONNECTOR_BY_ID).map((id) => this.statusOf(id));
  }

  status(id: string): ConnectionStatus {
    return this.statusOf(id);
  }
}
