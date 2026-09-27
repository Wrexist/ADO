import { expect, it } from 'vitest';
import { redact } from './redact';
it('redacts exact configured secrets and common credential formats while retaining diagnostics', () => {
  expect(redact('Auth failed: Bearer abc123; custom-long-key password=bad-value', ['custom-long-key']))
    .toBe('Auth failed: Bearer [redacted] [redacted] password=[redacted]');
});
