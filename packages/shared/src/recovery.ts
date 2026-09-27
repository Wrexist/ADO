export type RecoveryReferenceStatus = 'identity_matches' | 'missing' | 'replaced' | 'other_host' | 'unrecorded' | 'unavailable';
export interface RecoveryReference {
  kind: 'checkout' | 'run_workspace' | 'verification_workspace';
  id: string;
  path: string | null;
  status: RecoveryReferenceStatus;
}
export interface RecoveryReferenceReport {
  checkedAt: string;
  references: RecoveryReference[];
  pendingRuns: number;
  retainedLocks: number;
  pendingVerifications: number;
  contentVerified: false;
  executionEnabled: false;
}
export interface RecoveryContentReport {
  runId: string;
  checkedAt: string;
  status: 'matches_recorded' | 'differs_from_recorded' | 'unavailable' | 'not_recorded';
  executionEnabled: false;
}
