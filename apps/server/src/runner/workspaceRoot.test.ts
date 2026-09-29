import { dirname, relative, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import { agentWorkspaceRoot } from './workspaceRoot';

const inside = (child: string, parent: string) => { const r = relative(resolve(parent), resolve(child)); return r === '' || (!r.startsWith('..') && !r.includes(':')); };

it('keeps agent workspaces outside the profile and the ControlOS tree, separate per profile (T10/T11)', () => {
  const repo = resolve(__dirname, '../../../..');
  const dbPath = resolve(repo, 'data', 'acc.sqlite');
  const root = agentWorkspaceRoot(dbPath);
  expect(inside(root, dirname(dbPath))).toBe(false);
  expect(inside(dirname(dbPath), root)).toBe(false);
  expect(inside(root, repo)).toBe(false);
  expect(root.split(sep)).toContain(process.platform === 'win32' ? 'ControlOS' : 'controlos');
  expect(agentWorkspaceRoot(resolve(repo, 'other', 'acc.sqlite'))).not.toBe(root);
  expect(agentWorkspaceRoot(dbPath)).toBe(root);
});
