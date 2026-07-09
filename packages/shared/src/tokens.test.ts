import { describe, it, expect } from 'vitest';
import { tokens } from './tokens';
import { parseEvent } from './events';

describe('design tokens', () => {
  it('match the DESIGN_SPEC palette 1:1', () => {
    expect(tokens.color.bgApp).toBe('#0A0A12');
    expect(tokens.color.primary).toBe('#7C5CFF');
    expect(tokens.color.gradientFrom).toBe('#A855F7');
    expect(tokens.color.gradientTo).toBe('#EC4899');
    expect(tokens.layout.canonicalWidth).toBe(1536);
  });
});

describe('event contracts', () => {
  it('accept a well-formed event and reject a sourceless one', () => {
    const good = {
      id: 'evt_1',
      ts: '2026-07-09T12:00:00.000Z',
      source: { kind: 'sysmon', ref: 'sample_1' },
      type: 'system.sample',
      payload: { cpuPct: 32, memPct: 68, netPct: 42 },
    };
    expect(parseEvent(good).type).toBe('system.sample');
    expect(() => parseEvent({ ...good, source: undefined })).toThrow();
  });
});
