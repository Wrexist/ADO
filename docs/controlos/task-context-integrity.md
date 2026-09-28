# Task context integrity before execution

Task dispatch already stores a task snapshot and references the immutable planning revision. Execution now parses and compares that snapshot with the original revision, then regenerates the owner-task prompt and compares it with the persisted run prompt. This check runs during queue admission, claim, workspace preparation and native process identity registration through the existing task execution boundary. A mismatch requires review; it does not silently reconstruct or replace the queued request.

The complete serialized owner-task prompt has a 65,536-byte UTF-8 application limit, including the framing, acceptance criteria and source-reference strings. Oversized tasks are rejected before dispatch. Previously accepted oversized task requests fail closed when checked for execution. The prompt format for existing valid requests is unchanged. This is a bound on ControlOS's task input, not a tokenizer estimate or proof that every provider context window can accommodate it. Generic manual/automation prompts are outside this particular task-bound check.

## Evidence

`apps/server/src/runner/taskContext.test.ts` verifies:

- A persisted replacement prompt is refused against the immutable task revision.
- The existing SQLite trigger still rejects normal snapshot updates. Explicit fault injection after removing that trigger simulates damaged/restored data and is refused by execution validation.
- Equal character counts with ASCII versus multibyte text produce different byte-budget outcomes.
- A disk profile is reopened with a replaced queued prompt. Runner recovery fails that run, blocks its task and preserves the original revision before acquiring a writer lock, making a workspace or invoking a provider. Reconciliation cannot retry it.

The unchanged task execution API test remains the valid-request control and runs an isolated real local process through completion and review state. The initial log `controlos-task-context-before.log` reproduced the missing prompt comparison and byte limit. Its third failure was an attempted fixture mutation correctly refused by the existing immutable-binding trigger; it was not a product failure. The corrected fixture explicitly injects damaged storage.

Final `npm run verify` passed type checking, lint, 427 tests in 95 files and builds on Windows x64 / Node 22.18.0. Logs: `controlos-task-context-focused.log` and `controlos-task-context-verify.log`. No renderer change or new browser acceptance is claimed in this step.

## Remaining context package work

This change does not complete B12 or T10/T11. Committed source selection and durable reference-package review now exist in `context-packages.md`; instruction roles, provider integration, versioned handoffs, full source-conflict/staleness review and provider budget accounting remain open. Repository text must not alter policy or resource assignments. Canary isolation requires independent sandbox/provider evidence; prompt framing alone is insufficient. No new full acceptance scenario is marked passed here.
