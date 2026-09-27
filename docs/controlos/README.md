# ControlOS recovery

Continues Wrexist/ADO at bb19caba68c1cda13249c8d722a9b6647133dc8f. The supplied preparation document and ControlOS conversation define the target. Historical handoff prompts are reference data; the user's current instruction authorizes implementation.

`acceptance-register.json` retains all 24 requirements, 20 work packages and 46 full acceptance scenarios. Unit tests do not substitute for complete scenarios. Root STATUS.md records actual evidence.

## Execution boundary

Trusted local execution only. Worktrees preserve the original Git checkout; they are not an OS sandbox. Agents can access files and provider credentials available to the logged-in OS user. The server remains loopback-only. Private remote access, device sessions, process-identity reconciliation and cross-device authentication require additional implementation and acceptance. Desktop credential writes now use Electron safeStorage; a native Windows encrypt/decrypt probe passed; full profile migration and update acceptance remain required. The CLI profile still uses owner-protected plaintext files.

The durable queue restores only versioned queued jobs. Previously running attempts are never automatically retried; writer locks stay quarantined because server death does not establish descendant death. No lease expiry releases such a lock. Manual database deletion is not a supported recovery action.

A rejected process-completion promise also retains the durable writer lock, including when the subsequent stop request throws. The run fails with an explicit unknown-outcome note; unrelated repositories can use the freed capacity slot. A stream error alone holds the lock until process completion is observed. The rejection checks alone do not establish descendant termination. Windows agents now use the native host below; cross-platform containment and safe quarantine recovery remain R1 work.

Queue acceptance, claims and terminal run state now commit their build events in the same SQLite transaction. The event log serves as the local outbox; delivery starts after commit and boot replay recovers committed events. SSE reconnects fall back to a snapshot when retained history cannot provide a contiguous replay. The [crash and failure matrix](execution-recovery.md) records the tested boundaries and remaining limitations.

Explicit repository verification runs `npm run verify` against an isolated result, recording revision, content digest, exit status, bounded redacted output and timestamp. Changed output invalidates evidence. It verifies that script, not every task-specific criterion. Human acceptance of new runs requires matching evidence and current content. Acceptance does not merge or deploy.

## Recovery

Windows agent process ownership now uses the [native process host](native-process-host.md).
Identity is persisted before the agent resumes; confirmed empty-job termination
permits normal lock release. Missing confirmation retains the lock. This does
not authorize releasing historical quarantine locks or claim OS sandbox isolation.

`npm run restore -- BACKUP.sqlite NEW_PROFILE_DIRECTORY` validates the backup checksum and SQLite integrity before creating a new profile. Existing profiles are never overwritten. Backups include known profile JSON files. CLI and legacy backups contain credentials in cleartext; encrypted desktop credentials require the original OS account/key provider. Protect all backups like the live profile, and reconnect services after recovery onto another host. Git working copies and external host backups are separate. A real-profile restore drill is still required.

## Expansion sequence

Prove R1 execution, permissions, secrets and recovery before broad R2 planning/inbox/context work. R3 covers a tested Codex adapter and private mobile access. R4 covers installer updates, three pilot projects, heavy tools, capacity and real usage. Historical phase checkmarks are not evidence for these gates.

## Provider references

The Codex adapter targets the locally generated 0.157.0 protocol and the official [Codex app-server contract](https://learn.chatgpt.com/docs/app-server). Its offline fixtures and account handshake do not prove live model execution or host sandbox behavior. Windows credential storage follows [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage); it does not isolate other processes running as the same OS user.
