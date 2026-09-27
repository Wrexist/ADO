import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectionsStore } from '../connections/store';
import { PromptStore } from '../prompts/store';
import { AutomationStore } from '../automations/store';
import { ProjectDirsStore } from '../projects/store';
import { ProjectSettingsStore } from '../projects/settings';

it('never replaces malformed existing stores with empty defaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'ado-corruption-'));
  try {
    const path = join(root, 'store.json');
    for (const Store of [ConnectionsStore, PromptStore, AutomationStore, ProjectDirsStore, ProjectSettingsStore]) {
      for (const input of ['{broken', 'null', '42']) {
        writeFileSync(path, input);
        expect(() => new Store(path)).toThrow();
        expect(readFileSync(path, 'utf8')).toBe(input);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('refuses malformed policy and preserves live permissions when saving fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'ado-policy-'));
  const file = join(root, 'policy.json');
  try {
    for (const row of [null, [], { agents: 'false' }, { unknownCapability: true }]) {
      const raw = JSON.stringify({ repo: row }); writeFileSync(file, raw);
      expect(() => new ProjectSettingsStore(file)).toThrow('Invalid project policy');
      expect(readFileSync(file, 'utf8')).toBe(raw);
    }
    writeFileSync(file, JSON.stringify({ repo: { agents: false } }));
    const store = new ProjectSettingsStore(file);
    rmSync(file); mkdirSync(file);
    expect(() => store.set('repo', 'agents', true)).toThrow();
    expect(store.isEnabled('repo', 'agents')).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
