# Bounded agent output

Claude and Codex stdout now use a draining JSONL boundary instead of readline's
unbounded partial-line and async queue accumulation. The maximum frame is
4 Mi UTF-16 code units; queued complete frames are limited to 8 Mi code units
and 1,024 lines. These are memory limits, not byte quotas. Overflow discards the
queue, requests owned-process stop and reports a failed run with an explicit
reason. The pipe remains drained while stop completes. Confirmation still
depends on the process host; output limits never authorize early lock release.

Stderr is drained continuously. Each line is limited to 8,192 code units;
oversized lines are discarded completely. Complete lines are redacted before
entering a 3,500-code-unit rolling buffer. Discarding a line or evicting an older
line adds `[diagnostics truncated: output was discarded]` to the persisted
diagnostics. Credentials split across pipe chunks are joined within that bounded
line before redaction. Raw output is not spooled to disk. The UI shows the same
diagnostics and marker. Redaction remains defense in depth, not a sandbox.

Evidence:

- `processOutput.test.ts`: oversized unbroken frames, stalled-consumer backlog,
  split Unicode, split credentials, oversized diagnostic lines and eviction.
- `outputFlood.test.ts`: real Claude-adapter fixture, over 1 MiB of stderr with
  backpressure, persisted redacted bounded diagnostics, explicit failure, and
  writer-lock release only after completion. An endless stdout fixture is
  stopped by the frame limit, not the run timeout.
- `codex.test.ts`: native Codex-adapter protocol fixtures with stderr flood and
  oversized stdout, alongside account, approval, interruption and normal flows.
- `smoke.mjs`: explicit diagnostic-loss fixture rendered at 1536 and 390 pixels.

These are local offline process fixtures; no model calls or pilot jobs. This
boundary applies to agent adapters. Review, installer and other auxiliary
command runners need their own acceptance evidence.
