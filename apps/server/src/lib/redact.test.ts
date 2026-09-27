import { expect, it } from 'vitest';
import { redact } from './redact';
it('redacts exact configured secrets and common credential formats while retaining diagnostics', () => {
  expect(redact('Auth failed: Bearer abc123; custom-long-key password=bad-value', ['custom-long-key']))
    .toBe('Auth failed: Bearer [redacted] [redacted] password=[redacted]');
});
it('redacts configured URL and JSON encodings before consumers shorten text', () => {
  const secret = 'CANARY/private value?&"tail';
  const text = [secret, encodeURIComponent(secret), encodeURI(secret), JSON.stringify(secret), new URLSearchParams({ key: secret }).toString()].join('\n');
  expect(redact(text, [secret])).not.toContain('CANARY');
  expect(redact('test\ud800-key', ['test\ud800-key'])).toBe('[redacted]');
});
