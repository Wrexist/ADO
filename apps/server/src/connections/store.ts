/**
 * Connections store — the ONLY place secrets are persisted, in a gitignored JSON file
 * under data/ (same trust model as .env: local-first, 127.0.0.1, file mode 600). Secrets
 * are NEVER returned to the client: callers get a masked hint + connected flag only.
 *
 * Resolution order for any integration: stored value → .env fallback. So existing .env
 * keys keep working, and the Settings page overrides them per-connector.
 */
import { readJsonStore, writeJsonStore } from '../lib/jsonStore';
import { CONNECTOR_BY_ID, type ConnectionStatus } from '@ado/shared';

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

  constructor(
    private filePath: string,
    private envFallback: (id: string) => string | undefined = () => undefined,
    private codec?: SecretCodec,
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
  }

  remove(id: string): void {
    const next = { ...this.data }; delete next[id];
    this.persist(next);
    this.data = next;
  }

  /** Public status for one connector — masked, never the secret. */
  private statusOf(id: string): ConnectionStatus {
    const stored = this.data[id];
    const envVal = this.envFallback(id);
    const value = stored?.value || envVal;
    return {
      id,
      connected: Boolean(value),
      hint: value ? `••••${value.slice(-4)}` : null,
      updatedTs: stored?.updatedTs ?? (envVal ? 'from .env' : null),
    };
  }

  /** Status for every connector in the catalog. */
  statusAll(): ConnectionStatus[] {
    return Object.keys(CONNECTOR_BY_ID).map((id) => this.statusOf(id));
  }

  status(id: string): ConnectionStatus {
    return this.statusOf(id);
  }
}
