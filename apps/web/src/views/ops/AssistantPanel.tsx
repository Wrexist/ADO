import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Button, Card, Icon } from '../../kit';

/** Col 3 — AI Assistant: input + quick chips (wired to real intents in Phase 4). */
export function AssistantPanel() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">AI Assistant</h2>
      <div className="relative mt-3">
        <input
          type="text"
          placeholder={m.assistant.placeholder}
          className="h-10 w-full rounded-tile border-none bg-elevated pl-3 pr-12 text-body text-text1 placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          type="button"
          aria-label="Ask AI"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85"
        >
          <Icon name="send" size={13} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {m.assistant.chips.map((chip) => (
          <Button key={chip} variant="outline" size="sm" className="rounded-full text-text2">
            {chip}
          </Button>
        ))}
      </div>
    </Card>
  );
}
