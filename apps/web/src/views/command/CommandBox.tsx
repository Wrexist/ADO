import { useState } from 'react';
import type { CommandResponse } from '@ado/shared';
import { Button, Icon } from '../../kit';
import { confirmIntent, runCommand } from '../../lib/command';

/**
 * The working command center input (Phase 4). NL → intent: read intents answer inline;
 * mutating intents show a preview with a Confirm button — nothing acts without it.
 * `variant` styles the send button for View A (violet round) vs View B (assistant).
 */
export function CommandBox({ placeholder }: { placeholder: string }) {
  const [text, setText] = useState('');
  const [resp, setResp] = useState<CommandResponse | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setResp(null);
    try {
      setResp(await runCommand(text));
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!resp?.confirm) return;
    setBusy(true);
    try {
      setResult(await confirmIntent(resp.confirm));
      setResp(null);
      setText('');
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder={placeholder}
          className="h-10 w-full rounded-tile border-none bg-elevated pl-3 pr-12 text-body text-text1 placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          aria-label="Run command"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85 disabled:opacity-50"
        >
          <Icon name="send" size={13} />
        </button>
      </div>

      {resp ? (
        <div className="rounded-tile bg-elevated p-3">
          <div className="mb-1 flex items-center gap-2 text-label text-text3">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-primary">{resp.intent.type}</span>
            <span>· {resp.intent.parsedBy} · {Math.round(resp.intent.confidence * 100)}%</span>
          </div>
          <p className="whitespace-pre-wrap text-body text-text2">{resp.message}</p>
          {resp.confirm ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void confirm()} disabled={busy}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResp(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className={`rounded-tile p-3 text-body ${result.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
