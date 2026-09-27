# Execution recovery evidence

The SQLite `events` table is the durable local outbox. `Bus.commit` commits a
state mutation and its validated events in one transaction. Only committed
events update the in-memory snapshot or reach SSE subscribers. Boot replay
recovers the event log; an event is not an instruction to repeat an external
operation. This mechanism does not provide exactly-once external side effects.

## Crash and failure matrix

| Boundary | Current behavior | Evidence |
| --- | --- | --- |
| Before transaction commit | Neither mutation nor event survives | Abrupt child-process exit and database reopen in `bus.test.ts` |
| After commit, during delivery | Mutation and event both survive and replay | Abrupt child-process exit in the subscriber, followed by database reopen |
| Event validation or insertion fails | Entire mutation/event transaction rolls back; no frame is delivered | Invalid event and SQLite abort-trigger tests |
| Accepted queue entry cannot be claimed | Entry remains queued and recoverable; no agent starts | Runner claim-event abort-trigger test |
| Claim committed, spawn not yet established | Run and writer lock remain uncertain after restart; no automatic replacement | Existing orphan recovery; missing durable identity remains quarantined |
| Owner exits after agent starts | Native host stops job and writes signed zero-member receipt; restart atomically confirms stop and releases lock; old attempt stays failed | Real owner subprocess exit, file-backed SQLite reopen and queued-next-job test in `receiptRecovery.test.ts` |
| Recovery event cannot commit | Confirmation and lock deletion both roll back | SQLite abort-trigger recovery test |
| Process-completion observation fails | Run fails and writer lock remains, including after restart | File-backed recovery tests with successful and throwing stop requests |
| Process finishes but terminal state cannot be committed | Writer lock remains; next writer waits | Runner terminal-event abort-trigger test |
| An SSE subscriber throws | Subscriber is removed; committed work and other subscribers continue | Reentrant ordered-delivery test |
| Client cursor predates retained events or crosses a replay gap | Server sends an authoritative snapshot and its cursor | `sse-recovery.test.ts` uses a real loopback HTTP connection after compaction |

Tests are local evidence, not proof of power-loss durability, OS sandboxing,
provider-side idempotency or full R1 acceptance. SQLite currently uses WAL with
`synchronous=NORMAL`; the abrupt-exit tests cover process failure.

## Remaining process boundary

Windows Claude/Codex agents now use a native Job Object host with persisted
identity before resume and confirmed empty-job termination. See the
[native process host](native-process-host.md) for the protocol, tests and limits.
POSIX adapters and auxiliary command runners do not claim this guarantee.
PID-only recovery must not be introduced. Job Objects are not a filesystem sandbox.

Quarantined locks have no expiry or force-unlock workflow. Protocol-v2 native
receipts provide a supported recovery path; missing or invalid evidence keeps
the lock. Startup checks existing receipts, and the authenticated run action
can recheck a receipt published after startup. Recovery never signals a PID.
