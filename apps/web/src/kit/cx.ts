/** Tiny class joiner — keeps kit components free of a classnames dependency. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
