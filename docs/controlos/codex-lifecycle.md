# Codex lifecycle correlation

The app-server adapter must not infer completion from a frame belonging to an unknown or different turn. A turn-start reply requires a nonempty string ID and an established thread. A turn-start notification and the reply may arrive in either order, but their IDs must agree. Required turn lifecycle notifications carry the exact established thread ID and a nonempty matching turn ID.

A completion additionally requires a previously established turn and a string status from the supported completed/failed/interrupted set. Missing fields, conflicting identities, unknown status values and array/object coercions are incompatible protocol data. The adapter stops its owned process, yields failed completion and returns a generic diagnostic without interpolating the raw frame. Existing denial of interactive approvals and explicit stop remain in force.

Seven real local child-process fixtures exercise missing turn replies, mismatched completion IDs, missing thread IDs, unknown statuses, completion before any turn identity, conflicting start notifications and an array pretending to be a status. Five initial fixtures failed before the change. The final 17-case Codex suite passes, including valid notification-before-reply ordering, approval denial with a colliding RPC ID, explicit stop, API-account refusal, malformed JSON, output limits and redaction. It runs through the native process host on Windows and makes no model request.

Reproduce: `npx vitest run apps/server/src/runner/codex.test.ts`. Logs: `controlos-codex-lifecycle-before.log` (five expected failures) and `controlos-codex-lifecycle-focused.log` (17 passed).

This tightens the locally supported lifecycle contract. It does not add negotiated protocol-version discovery or certify every future required event/capability, live provider compatibility or the UI limitation flow. T30 remains not_run; this evidence does not complete R3.
