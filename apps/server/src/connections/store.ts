/**
 * Connections store — the ONLY place secrets are persisted, in a gitignored JSON file
 * under data/ (same trust model as .env: local-first, 127.0.0.1, file mode 600). Secrets
 * are NEVER returned to the client: callers get a masked hint + connected flag only.
 *
 * Resolution order for any integration: stored value → .env fallback. So existing .env
 * keys keep working, and the Settings page overrides them per-connector.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONNECTOR_BY_ID, type ConnectionStatus } from '@ado/shared';

interface StoredConn {
  value: string;
  updatedTs: string;
}

export class ConnectionsStore {
  private data: Record<string, StoredConn> = {};

  constructor(
    private filePath: string,
    private envFallback: (id: string) => string | undefined = () => undefined,
  ) {
    this.load();
  }

  private load(): void {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, StoredConn>;
    } catch {
      this.data = {}; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    try {
      chmodSync(this.filePath, 0o600); // owner-only — secrets on disk
    } catch {
      /* non-POSIX — best effort */
    }
  }

  /** The value an integration should use: stored wins, else .env fallback. */
  resolve(id: string): string | undefined {
    return this.data[id]?.value || this.envFallback(id) || undefined;
  }

  set(id: string, value: string): void {
    if (!CONNECTOR_BY_ID[id]) throw new Error(`unknown connector '${id}'`);
    const trimmed = value.trim();
    if (!trimmed) throw new Error('value is empty');
    this.data[id] = { value: trimmed, updatedTs: new Date().toISOString() };
    this.persist();
  }

  remove(id: string): void {
    delete this.data[id];
    this.persist();
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
