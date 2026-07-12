import { useEffect, useState } from 'react';
import type { WorkflowMeta } from '@ado/shared';
import { Card, Chip, Icon, cx, type IconName } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { fetchWorkflows } from '../lib/workflows';

const ICON: Record<string, IconName> = {
  understand: 'search',
  'ship-feature': 'rocket',
  review: 'check',
  audit: 'list',
  harden: 'health',
  'verify-gate': 'workflow',
};

/** Horizontal phase stepper — the recipe's meta.phases, in order, with connectors. */
function PhasePipeline({ phases }: { phases: WorkflowMeta['phases'] }) {
  if (phases.length === 0) return <p className="text-label text-text3">Single-pass — no declared phases.</p>;
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {phases.map((p, i) => (
        <div key={`${p.title}-${i}`} className="flex items-stretch gap-2">
          <div className="flex min-w-[7rem] flex-col rounded-tile border bg-elevated/60 px-3 py-2">
            <span className="flex items-center gap-1.5 text-body font-medium text-text1">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold tabular-nums text-primary">
                {i + 1}
              </span>
              {p.title}
            </span>
            {p.detail ? <span className="mt-0.5 text-label text-text3">{p.detail}</span> : null}
          </div>
          {i < phases.length - 1 ? (
            <span className="flex items-center text-text3" aria-hidden>
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflows()
      .then(setWorkflows)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <PageShell
      title="Workflows"
      subtitle="Multi-agent orchestration recipes for this repo. They run in Claude Code (not in this app) — this is a live view of the real .claude/workflows files, so it can never drift from what's on disk."
    >
      <Card className="mt-6 flex items-start gap-3 border-primary/20 bg-primary/[0.06] p-4">
        <Icon name="sparkle" size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-body text-text2">
          <p className="text-text1">Opt-in — nothing here runs on its own.</p>
          <p className="mt-1">
            Invoke one inside a Claude Code session, e.g.{' '}
            <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-label text-text1">use a workflow: review</span>. Each fans work across
            subagents with an adversarial-verify pass so findings and plans have to earn their place.
          </p>
        </div>
      </Card>

      {error ? (
        <Card className="mt-6 border-danger/25 bg-danger/10 p-4 text-body text-danger">
          Couldn’t load workflows ({error}). Start the server — this reads the real{' '}
          <span className="font-mono">.claude/workflows</span> files.
        </Card>
      ) : workflows === null ? (
        <p className="mt-6 text-body text-text3">Reading .claude/workflows…</p>
      ) : workflows.length === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-body text-text2">No workflow recipes found</p>
          <p className="mt-1 text-label text-text3">Add one to .claude/workflows and it appears here.</p>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {workflows.map((w) => (
              <Card key={w.file} className="flex flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-elevated text-text2">
                    <Icon name={ICON[w.name] ?? 'pipeline'} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-body font-semibold text-text1">{w.name}</p>
                      <Chip size="sm">{w.phases.length} phase{w.phases.length === 1 ? '' : 's'}</Chip>
                    </div>
                    <p className="mt-0.5 text-label text-text2">{w.description}</p>
                  </div>
                </div>

                <PhasePipeline phases={w.phases} />

                {w.whenToUse ? (
                  <p className="text-label text-text3">
                    <span className="font-medium text-text2">When: </span>
                    {w.whenToUse}
                  </p>
                ) : null}

                <p className="mt-auto flex items-center gap-1.5 pt-1 text-label text-text3">
                  <Icon name="code" size={12} />
                  <span className="font-mono">.claude/workflows/{w.file}</span>
                </p>
              </Card>
            ))}
          </div>
          <p className={cx('mt-8 text-label text-text3')}>
            {workflows.length} recipe{workflows.length === 1 ? '' : 's'} · read live from disk
          </p>
        </>
      )}
    </PageShell>
  );
}
