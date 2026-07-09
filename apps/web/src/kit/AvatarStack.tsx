import { cx } from './cx';
import { toneTint, type Tone } from './tones';

/**
 * Agent avatar stack — monogram circles derived deterministically from agent ids.
 * Replaces the reference's fake teammate photos (no-fabrication rule): you're solo,
 * these are the agents that touched the repo.
 */
const STACK_TONES: Tone[] = ['violet', 'success', 'info', 'warning', 'pink'];

function toneFor(id: string): Tone {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return STACK_TONES[sum % STACK_TONES.length];
}

export function AvatarStack({
  ids,
  overflow,
  className,
}: {
  ids: string[];
  overflow?: number;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center', className)}>
      {ids.map((id, i) => (
        <span
          key={id}
          title={id}
          className={cx(
            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium uppercase ring-2 ring-card',
            toneTint[toneFor(id)],
            i > 0 && '-ml-1.5',
          )}
        >
          {id.slice(0, 2)}
        </span>
      ))}
      {overflow ? (
        <span className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-elevated text-[10px] font-medium text-text2 ring-2 ring-card">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
