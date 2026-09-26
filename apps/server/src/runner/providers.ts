import { ClaudeSpawner, type SpawnOpts, type Spawner, type SpawnHandle } from './spawner';
import { CodexSpawner } from './codex';
export const PROVIDERS = [
  { id: 'claude', name: 'Claude Code', streaming: true, stop: true, resume: false, interactiveApprovals: false, billing: 'CLI account', isolation: 'trusted local', validation: 'adapter regressions; live login not verified' },
  { id: 'codex', name: 'Codex (experimental)', streaming: true, stop: true, resume: false, interactiveApprovals: false, billing: 'ChatGPT login only', isolation: 'workspace-write requested; host acceptance required', validation: '0.157.0 protocol baseline; current host login and live execution not checked by this endpoint' },
] as const;
export class ProviderSpawner implements Spawner {
  spawn(opts: SpawnOpts): SpawnHandle {
    if (opts.provider === 'codex') return new CodexSpawner().spawn(opts);
    if (!opts.provider || opts.provider === 'claude') return new ClaudeSpawner().spawn(opts);
    throw new Error('Unsupported agent provider');
  }
}
