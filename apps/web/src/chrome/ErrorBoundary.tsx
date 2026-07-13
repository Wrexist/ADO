import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Icon } from '../kit';
import { reportIncident } from '../lib/incidents';

interface Props {
  children: ReactNode;
  /** When this changes (a route navigation), a caught error is cleared so the app recovers. */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

function firstComponent(stack?: string | null): string {
  if (!stack) return 'unknown component';
  const line = stack
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.startsWith('in '));
  return line ?? 'unknown component';
}

/**
 * Root error boundary — the app's last line of resilience. A render crash anywhere below is
 * caught here instead of blanking the screen: we report it to the server (which asks the AI/
 * heuristic diagnoser WHY it happened) and show a calm fallback. Navigating away — the resetKey
 * changes — clears the error so a single bad screen never wedges the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Best-effort report — the diagnosis surfaces on /diagnostics. reportIncident never throws.
    void reportIncident({
      kind: 'react-render',
      message: error.message || String(error),
      stack: error.stack,
      context: `${window.location.pathname} · ${firstComponent(info.componentStack)}`,
    });
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null }); // route changed → recover
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <Fallback message={this.state.error.message} />;
  }
}

/** Calm, self-contained fallback (no data dependencies — it must render when everything else broke). */
function Fallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-6 text-text1">
      <Card className="w-full max-w-[560px] p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-danger/15 text-danger">
            <Icon name="health" size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-title font-semibold text-text1">Something broke on this screen</h1>
            <p className="text-body text-text2">The rest of the app is still running.</p>
          </div>
        </div>

        <p className="mt-5 break-words rounded-tile bg-elevated px-3 py-2 font-mono text-label text-text2">
          {message || 'Unknown render error'}
        </p>

        <p className="mt-4 text-body text-text2">
          This crash was captured and sent for diagnosis. Open Diagnostics to see the root cause
          and, if you want, dispatch a fix.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => window.location.reload()}>Reload this screen</Button>
          <Link
            to="/diagnostics"
            className="inline-flex h-9 items-center rounded-tile border bg-card px-4 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
          >
            View diagnostics →
          </Link>
        </div>
      </Card>
    </div>
  );
}
