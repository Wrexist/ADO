import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../chrome/PageShell';
import { Card, Icon } from '../kit';
import { PLANNED } from '../lib/planned';

/** Honest "planned, not wired yet" page for reference nav items that aren't built. */
export function PlaceholderPage() {
  const { slug = '' } = useParams();
  const f = PLANNED[slug] ?? {
    title: 'Coming soon',
    blurb: 'This area is planned but not wired yet.',
    icon: 'sparkle' as const,
  };
  const link =
    'rounded-tile border bg-card px-3 py-2 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1';
  return (
    <PageShell title={f.title} subtitle={f.blurb}>
      <Card className="mt-8 p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-tile bg-elevated text-text3">
            <Icon name={f.icon} size={22} />
          </span>
          <p className="text-section font-semibold text-text1">Planned — not wired yet</p>
          <p className="max-w-[52ch] text-body text-text2">
            An honest placeholder: no fake data or controls live here. When {f.title} is built it
            will render from real events like the rest of the dashboard.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link to="/prompts" className={link}>Browse the Prompt Library</Link>
            <Link to="/settings" className={link}>Connect a service</Link>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
