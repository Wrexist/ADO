import { describe, expect, it } from 'vitest';
import type { StatPoint } from '@ado/shared';
import { statDelta, weekDelta } from './selectors';

const hist = (pts: Array<[string, number]>): StatPoint[] => pts.map(([day, value]) => ({ day, value }));

describe('stat deltas (honest — computed only from stored history)', () => {
  it('returns null until ≥2 days of history exist', () => {
    expect(statDelta(10, undefined)).toBeNull();
    expect(statDelta(10, hist([['2026-07-07', 8]]))).toBeNull();
  });

  it('computes current minus the ~week-ago baseline (anchored to the latest day)', () => {
    const h = hist([
      ['2026-07-01', 6],
      ['2026-07-04', 6],
      ['2026-07-07', 7],
    ]);
    // latest = 07-07, cutoff = 06-30; oldest in-window & before latest = 07-01 (6)
    expect(statDelta(8, h)).toBe(2);
  });

  it('never invents a trend: null current → null delta', () => {
    expect(statDelta(null, hist([['2026-07-01', 6], ['2026-07-07', 7]]))).toBeNull();
  });

  it('weekDelta hides null/zero and tones by direction', () => {
    expect(weekDelta(null)).toBeUndefined();
    expect(weekDelta(0)).toBeUndefined();
    expect(weekDelta(2)).toMatchObject({ trend: 'up', tone: 'success', label: '2 this week' });
    expect(weekDelta(-3)).toMatchObject({ trend: 'down', tone: 'danger', label: '3 this week' });
  });
});
