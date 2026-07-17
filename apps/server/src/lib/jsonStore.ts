/**
 * Shared JSON-store file helpers. Two honesty rules the naive pattern gets wrong:
 * 1. Only a MISSING file means "fresh install". A corrupted/unreadable file THROWS at boot —
 *    silently resetting to {} would wipe the user's real data on the next persist (conv. 1/12).
 * 2. Persist is atomic (tmp + rename), so a crash mid-write can never truncate the store.
 * Stores may pass a per-row validator to drop malformed rows (kept only in memory — the file
 * is untouched until the next real write, so nothing is destroyed silently).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Parse a store file into a plain object map. null = file absent (fresh). Corruption throws. */
export function readJsonStore(filePath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err; // permissions etc. — surface it, never treat as empty
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${filePath} is corrupted (${(err as Error).message}) — fix or remove the file; refusing to silently reset it`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath} does not contain a JSON object — fix or remove the file; refusing to silently reset it`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Read + validate each row; malformed rows are dropped from memory (reported via onDropped)
 * instead of crashing consumers like scheduler loops.
 */
export function readJsonStoreRows<T>(
  filePath: string,
  parseRow: (row: unknown) => T | null,
  onDropped?: (key: string) => void,
): Record<string, T> {
  const raw = readJsonStore(filePath);
  if (raw === null) return {};
  const out: Record<string, T> = {};
  for (const [key, row] of Object.entries(raw)) {
    const parsed = parseRow(row);
    if (parsed === null) onDropped?.(key);
    else out[key] = parsed;
  }
  return out;
}

/** Atomic persist: write a sibling tmp file, then rename over the target. */
export function writeJsonStore(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, filePath);
}
