import { describe, it, expect } from 'vitest';
import { tokens, themes } from './tokens';
import { parseEvent } from './events';

describe('design tokens', () => {
  it('keeps normal text and primary actions readable across both appearance palettes', () => {
    const luminance = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    for (const palette of Object.values(themes)) {
      for (const foreground of [palette.text1, palette.text2, palette.text3]) {
        for (const background of [palette.bgApp, palette.bgPanel, palette.bgCard, palette.bgElevated]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(palette.onPrimary, palette.primary)).toBeGreaterThanOrEqual(4.5);
    }
  });
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
