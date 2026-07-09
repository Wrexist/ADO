import { Link } from 'react-router-dom';
import { Card, EmptyState } from '../kit';

/** View B — Ops Dashboard (/ops). Built in Prompt 1.4 from the same kit. */
export function OpsPage() {
  return (
    <div className="flex min-h-screen min-w-[1280px] items-center justify-center bg-app p-8 text-text1">
      <Card className="w-full max-w-md border-dashed p-2">
        <EmptyState
          icon="chart"
          title="View B — Ops Dashboard lands with Prompt 1.4"
          hint="Projects table, build queue, agents roster, system monitor — all from the shared kit."
        />
        <p className="pb-4 text-center text-label text-text3">
          <Link to="/command" className="text-text2 hover:text-text1">
            /command
          </Link>
          {' · '}
          <Link to="/kit" className="text-text2 hover:text-text1">
            /kit
          </Link>
        </p>
      </Card>
    </div>
  );
}
