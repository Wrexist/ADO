# T21: recovered PID collision on Windows

The acceptance probe `node --import tsx scripts/probe-process-identity.mts` exercises the production server, SQLite startup recovery, agent stop/reconcile and verification stop/reconcile endpoints. It starts an actual native-owned Node process under a separate owner process, outside the recovery server's process registry. Its exact PID and Windows creation FILETIME come from the native Job Object host.

The probe fault-injects historical agent and verifier records with that live PID, different job identities and older creation times. It does not force the Windows PID allocator to reuse a number. This constructs the stale-identity collision state directly. The unrelated child must answer a new random challenge with its own PID after each recovery step; a PID existence lookup alone is not the oracle.

Checks cover startup recovery, missing receipts, invalid HMAC, a correctly authenticated receipt with the same PID but a different creation time, explicit stop/reconcile requests, server shutdown and reopening the profile. Both stale writer locks remain, termination remains unconfirmed, and no old run is retried. A separate native process supplies a real authenticated empty-job receipt as a positive control: startup confirms its termination and releases only its lock. Final cleanup uses the fixture owner's live input channel, never a persisted PID.

The first fixture incorrectly put the test child in the recovery server's own process registry. Normal server shutdown therefore stopped it. The corrected fixture uses a separate owner process; this correction is essential to the unrelated-process claim. Another initial fixture exceeded the actual two-writer limit; the positive control now completes before the two quarantined owners are installed.

`process-identity-evidence.json` binds the tested sources and native executable and records environment and checks. T21 is locally passed for this Windows fault-injection scenario. This is not evidence of forced OS allocator reuse, an OS sandbox, private remote execution or a complete R1 gate.

## Verification ownership correction

Related review reproduced two defects using valid signed receipts: a lock referring to another run and two locks sharing one verifier owner could be released during reconciliation. Receipt authenticity does not prove which lock belongs to the attempt. `VerificationOwnership` now requires exactly one lock for the attempt and the matching run before identity use, confirmation or release. Finalization validates ownership before changing history and deletes only the exact bound lock within a transaction. Inconsistent ownership remains quarantined; it is not automatically repaired. The regression restores the fixture binding explicitly and then verifies successful recovery as a positive control.

Logs: `controlos-verification-lock-binding-before.log` contains both reproduced failures; `controlos-verification-lock-binding-focused.log` is the passing focused regression. The process-identity probe is rerun after the correction so its evidence refers to the corrected ownership implementation.

Final validation: `controlos-process-identity-verify.log` passed typecheck, lint, 422 tests in 93 files and build. `controlos-process-identity-probe-final.log` passed all seven live-process checks and the native-receipt positive control. Source and native executable hashes match the final evidence artifact.
