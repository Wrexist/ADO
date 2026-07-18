/**
 * Outbound notifications — ping the user's connected Slack/Discord incoming webhooks on the
 * events that matter (a real CI failure, a deployment). Connecting a webhook in Settings IS
 * the opt-in (the connector blurb promises build/deploy notifications). Fire-and-forget with
 * a timeout; failures are logged, never thrown. A short per-event dedup avoids flapping-CI spam.
 *
 * The webhook URL is a stored secret resolved server-side — never sent to the client. The
 * message text is composed here from typed event fields (not echoed external instructions).
 */
type WebhookTargets = { slack?: string; discord?: string };
export type PostFn = (url: string, body: unknown) => Promise<void>;

const DEDUP_MS = 60_000;

const realPost: PostFn = async (url, body) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
};

export class Notifier {
  private lastSent = new Map<string, number>();

  constructor(
    private targets: () => WebhookTargets,
    private post: PostFn = realPost,
    private log: (msg: string) => void = () => {},
    private now: () => number = () => Date.now(),
  ) {}

  buildFailed(repoLabel: string, jobLabel: string): void {
    this.fanout(`build.failed:${repoLabel}`, `🔴 CI failed — ${repoLabel}: ${jobLabel}`);
  }

  deployRecorded(name: string, env: string, ok: boolean): void {
    this.fanout(`deploy:${name}:${env}:${ok}`, `${ok ? '🚀' : '⚠️'} Deploy ${ok ? 'succeeded' : 'FAILED'} — ${name} → ${env}`);
  }

  /** Auto-Review found real issues — only non-clean verdicts ping (clean reviews stay quiet). */
  reviewNeedsAttention(repoLabel: string, verdict: 'attention' | 'block', counts: { major: number; critical: number }): void {
    const badge = verdict === 'block' ? '⛔' : '🔍';
    const parts = [counts.critical > 0 ? `${counts.critical} critical` : '', counts.major > 0 ? `${counts.major} major` : ''].filter(Boolean);
    const tail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    this.fanout(`review:${repoLabel}:${verdict}`, `${badge} Auto-Review: ${repoLabel} needs ${verdict === 'block' ? 'a BLOCKING fix' : 'attention'}${tail} — see /reviews`);
  }

  /** Post `text` to every connected webhook (Slack uses {text}, Discord uses {content}). */
  private fanout(key: string, text: string): void {
    if (this.tooSoon(key)) return;
    const t = this.targets();
    if (t.slack) this.dispatch(t.slack, { text }, 'slack');
    if (t.discord) this.dispatch(t.discord, { content: text }, 'discord');
  }

  private dispatch(url: string, body: unknown, kind: string): void {
    this.post(url, body)
      .then(() => this.log(`notify ${kind}: sent`))
      .catch((e) => this.log(`notify ${kind} failed: ${(e as Error).message}`));
  }

  private tooSoon(key: string): boolean {
    const last = this.lastSent.get(key);
    const now = this.now();
    if (last !== undefined && now - last < DEDUP_MS) return true;
    this.lastSent.set(key, now);
    return false;
  }
}
