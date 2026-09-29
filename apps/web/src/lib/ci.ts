import { ciRevision, type CiRevision, type RepoCI } from '@ado/shared';
import type { Tone } from '../kit';
import { CI_TONE } from './repoLook';
import { timeAgo } from './time';

export interface CiView {
  revision: CiRevision;
  /** The run's own outcome may be shown as a check of the current code. */
  current: boolean;
  tone: 'gradient' | Tone;
  /** Reserved right-hand slot: pct for a current terminal run, otherwise a word. */
  slot: string;
  /** Visible provenance for a result that does not describe the current head. */
  note: string | null;
}

const short = (sha: string) => sha.slice(0, 7);

/**
 * T03: a CI result only counts for the current code when its run SHA equals the branch
 * head read with it. Older or unverified results keep their SHA and age visible, lose
 * the success/failure tone and never render as a check of the newer commit.
 */
export function ciView(ci: RepoCI, now = Date.now()): CiView {
  const revision = ciRevision(ci);
  if (revision === 'current') {
    return {
      revision, current: true, tone: CI_TONE[ci.state], note: null,
      slot: ci.state === 'success' || ci.state === 'failed' ? `${ci.pct}%` : ci.state,
    };
  }
  const run = ci.headSha ? `Run for ${short(ci.headSha)}` : 'Run for unknown commit';
  const age = ci.runTs ? ` · ${timeAgo(ci.runTs, now)}` : '';
  const why = revision === 'older' && ci.branchHeadSha
    ? ` · not head ${short(ci.branchHeadSha)}`
    : ' · current head unverified';
  return {
    revision, current: false, tone: 'muted',
    slot: revision === 'older' ? 'older' : 'unverified',
    note: `${run}${age}${why} (${ci.state})`,
  };
}
