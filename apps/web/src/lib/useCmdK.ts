import { useEffect, type RefObject } from 'react';

/** ⌘K / Ctrl+K focuses the given input. Shared by both top bars (the quality-floor shortcut). */
export function useCmdK(ref: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
