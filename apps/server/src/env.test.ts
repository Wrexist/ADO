import { expect, it } from 'vitest';
import { assertSupportedRuntime } from './env';

it('enforces supported runtimes without weakening file identity validation', () => {
  for (const version of ['20.19.0', '22.12.0', '22.17.0', '23.0.0', '24.0.0']) expect(() => assertSupportedRuntime(version)).toThrow('requires Node');
  for (const version of ['22.18.0', '22.23.0', '24.11.0', '25.0.0']) expect(() => assertSupportedRuntime(version)).not.toThrow();
});
