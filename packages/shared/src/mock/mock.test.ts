import { describe, it, expect } from 'vitest';
import { FIXTURE, MOCK_NOW, MOCK_VIEW_A, MOCK_VIEW_B } from './index';

const ms = (s: string) => new Date(s).getTime();

describe('mock fixtures (Prompt 0.3)', () => {
  it('are explicitly marked as fixtures', () => {
    expect(FIXTURE).toBe(true);
  });

  it('view A fills the 3×2 grid and exercises a non-happy state (council S1)', () => {
    expect(MOCK_VIEW_A.repos.length).toBeGreaterThanOrEqual(6);
    expect(
      MOCK_VIEW_A.repos.some((r) => r.status !== 'active' || r.progress.state !== 'success'),
    ).toBe(true);
    expect(MOCK_VIEW_B.agentRoster.some((a) => a.state === 'idle')).toBe(true);
  });

  it('per-view illustrative numbers intentionally diverge (council B1)', () => {
    const a = MOCK_VIEW_A.stats.find((s) => s.id === 'total-repos')!.value;
    const b = MOCK_VIEW_B.stats.find((s) => s.id === 'repositories')!.value;
    expect(a).not.toBe(b); // '12' vs '23' — each view mirrors ITS reference image
  });

  it('view B header agrees with its own repositories stat (fixes the reference self-contradiction)', () => {
    const repoStat = MOCK_VIEW_B.stats.find((s) => s.id === 'repositories')!;
    expect(MOCK_VIEW_B.header.subtitle).toContain(repoStat.value);
  });

  it('sparklines respect the >=2-sample floor; radials carry an explicit denominator (council S3)', () => {
    for (const s of MOCK_VIEW_B.stats) {
      if (s.chart?.kind === 'sparkline') expect(s.chart.points.length).toBeGreaterThanOrEqual(2);
      if (s.chart?.kind === 'radial') {
        expect(s.chart.max).toBeGreaterThan(0);
        expect(s.chart.value).toBeLessThanOrEqual(s.chart.max);
      }
    }
    for (const m of MOCK_VIEW_B.monitor) {
      expect(m.points.length).toBeGreaterThanOrEqual(2);
      expect(m.points.at(-1)).toBe(m.valuePct); // headline number = last real sample
    }
  });

  it('timestamps are frozen ISO literals, never after MOCK_NOW (deterministic --demo seed)', () => {
    const now = ms(MOCK_NOW);
    const stamps = [
      ...MOCK_VIEW_A.repos.map((r) => r.updatedTs),
      ...MOCK_VIEW_A.activity.map((a) => a.ts),
      ...MOCK_VIEW_B.activity.map((a) => a.ts),
      ...MOCK_VIEW_B.deployments.map((d) => d.ts),
    ];
    for (const t of stamps) {
      expect(Number.isNaN(ms(t))).toBe(false);
      expect(ms(t)).toBeLessThanOrEqual(now);
    }
  });

  it('build queue: queued rows carry NO duration (honest absence), running rows carry both fields', () => {
    for (const b of MOCK_VIEW_B.buildQueue) {
      if (b.state === 'queued') {
        expect(b.durationLabel).toBeNull();
        expect(b.elapsedSec).toBeNull();
      } else {
        expect(b.durationLabel).toBeTruthy();
        expect(b.elapsedSec).toBeGreaterThan(0);
      }
    }
  });
});
