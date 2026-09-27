import { expect, it } from 'vitest';
import { usageLabel } from './usage';

it('distinguishes absent, partial and explicitly reported zero usage', () => {
  expect(usageLabel(0, 0, 0)).toBe('No runs');
  expect(usageLabel(0, 0, 4)).toBe('Unknown');
  expect(usageLabel(0, 4, 4)).toBe('0');
  expect(usageLabel(0, 1, 4)).toBe('0 reported · partial');
  expect(usageLabel(1200, 3, 4)).toBe('1.2K reported · partial');
  expect(usageLabel(1200, 4, 4)).toBe('1.2K');
});
