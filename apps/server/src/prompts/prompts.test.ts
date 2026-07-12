import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PromptStore } from './store';

let dir: string;
const newPath = () => {
  dir = mkdtempSync(join(tmpdir(), 'acc-prompts-'));
  return join(dir, 'prompts.json');
};
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

const valid = {
  title: 'Generate a level',
  category: 'game' as const,
  summary: 'Make a tunable level layout',
  tags: ['unity', 'level'],
  recommendedModel: 'claude' as const,
  body: 'Design a level for {game} with {constraints}.',
  dispatchable: true,
};

describe('custom prompt store', () => {
  it('creates a prompt with a custom- id and marks it custom', () => {
    const store = new PromptStore(newPath());
    const p = store.upsert(valid);
    expect(p.id).toMatch(/^custom-/);
    expect(p.custom).toBe(true);
    expect(p.title).toBe('Generate a level');
    expect(store.list()).toHaveLength(1);
  });

  it('updates in place when a known id is supplied', () => {
    const store = new PromptStore(newPath());
    const p = store.upsert(valid);
    const edited = store.upsert({ ...valid, id: p.id, title: 'Generate a boss arena' });
    expect(edited.id).toBe(p.id); // same id → update, not a second entry
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].title).toBe('Generate a boss arena');
  });

  it('rejects invalid input (empty title, bad category, oversized body)', () => {
    const store = new PromptStore(newPath());
    expect(() => store.upsert({ ...valid, title: '' })).toThrow();
    expect(() => store.upsert({ ...valid, category: 'nope' })).toThrow();
    expect(() => store.upsert({ ...valid, body: 'x'.repeat(9000) })).toThrow();
  });

  it('persists across instances and removes cleanly', () => {
    const path = newPath();
    const id = new PromptStore(path).upsert(valid).id;
    const reopened = new PromptStore(path);
    expect(reopened.has(id)).toBe(true);
    expect(reopened.remove(id)).toBe(true);
    expect(reopened.remove(id)).toBe(false); // already gone
    expect(new PromptStore(path).list()).toHaveLength(0);
  });

  it('defaults tags and dispatchable when omitted', () => {
    const store = new PromptStore(newPath());
    const p = store.upsert({ title: 'T', category: 'app', summary: 'S', body: 'B', recommendedModel: 'any' });
    expect(p.tags).toEqual([]);
    expect(p.dispatchable).toBe(true);
  });
});
