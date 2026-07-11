import { Button, Card } from '../../kit';
import { CommandBox } from '../command/CommandBox';

/** Col 3 — AI Assistant: the working command box (Phase 4) + quick suggestion chips. */
const CHIPS = ['Analyze codebase', 'Fix bugs', 'Optimize performance', 'Generate tests'];

export function AssistantPanel() {
  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">AI Assistant</h2>
      <div className="mt-3">
        <CommandBox placeholder="Ask AI anything about your projects…" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <Button key={chip} variant="outline" size="sm" className="rounded-full text-text2">
            {chip}
          </Button>
        ))}
      </div>
    </Card>
  );
}
