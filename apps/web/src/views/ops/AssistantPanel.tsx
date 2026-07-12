import { useState } from 'react';
import { Button, Card } from '../../kit';
import { useBus } from '../../store/bus';
import { CommandBox } from '../command/CommandBox';

/**
 * Col 3 — AI Assistant: the working command box (Phase 4) + suggestion chips. Chips carry a
 * real repo (or are read intents) so they actually resolve — the old "Fix bugs" chips carried
 * no repo and dead-ended on "which repo?". Copy matches the 5 intents the parser understands.
 */
export function AssistantPanel() {
  const repos = useBus((s) => s.state.repos);
  const firstRepo = Object.values(repos)[0]?.id;
  const chips = [
    'status',
    'summarize recent activity',
    ...(firstRepo ? [`gate status of ${firstRepo}`, `fix the flaky test in ${firstRepo}`] : []),
  ];
  const [seed, setSeed] = useState<{ text: string; n: number }>();
  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">AI Assistant</h2>
      <p className="mt-0.5 text-label text-text3">Ask about status, or create and dispatch a task.</p>
      <div className="mt-3">
        <CommandBox placeholder="e.g. status · fix the flaky test in …" seed={seed} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Button
            key={chip}
            variant="outline"
            size="sm"
            className="rounded-full text-text2"
            onClick={() => setSeed((prev) => ({ text: chip, n: (prev?.n ?? 0) + 1 }))}
          >
            {chip}
          </Button>
        ))}
      </div>
    </Card>
  );
}
