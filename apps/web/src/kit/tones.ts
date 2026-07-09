/**
 * Tone maps — every tone→class lookup in the kit lives here as FULL literal strings
 * (Tailwind can only see static class names; dynamic `bg-${tone}` would purge away).
 * Tones align with @ado/shared tokens; 'muted' is the honest idle/absent tone.
 */

export type Tone = 'violet' | 'success' | 'warning' | 'info' | 'danger' | 'pink' | 'muted';

export const toneText: Record<Tone, string> = {
  violet: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  danger: 'text-danger',
  pink: 'text-pink',
  muted: 'text-text3',
};

export const toneBg: Record<Tone, string> = {
  violet: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger',
  pink: 'bg-pink',
  muted: 'bg-text3',
};

/** Tinted chip/tile surfaces: soft background + toned text. */
export const toneTint: Record<Tone, string> = {
  violet: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  danger: 'bg-danger/15 text-danger',
  pink: 'bg-pink/15 text-pink',
  muted: 'bg-elevated text-text2',
};
