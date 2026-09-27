# Secret redaction evidence

Agent adapters redact complete parsed text before shortening progress (80 code
units) and results (4,000). Tool names, runner logs, terminal errors, diagnostics
and event-backed status also pass through redaction. Known secrets are matched
in literal, standard URL/form encoded and JSON-escaped forms. Provider JSON parse
errors use a generic description rather than echoing raw input.

Incident reports redact kind, message, stack and context before persistence or
diagnosis. Diagnosis text is redacted before publication. Unexpected HTTP errors
redact their response and logged error fields; diagnostic-provider failures
redact the provider key before fallback logging. This does not authorize sending
private project context to a provider or establish a filesystem sandbox.

Local Windows evidence (Node 22.18.0):

- `runner/redaction.test.ts`: canaries crossing both truncation boundaries,
  tool names, encoded URLs, stored runs, timeline, event rows, subscriber frames,
  snapshot and runner logs. These are deterministic runner fixtures.
- `runner/codex.test.ts`: real local child with protocol canaries at truncation
  boundaries and a provider-error reply; no model or API call.
- `incidents/redaction.test.ts`: redacted input reaches a mocked diagnoser,
  redacted diagnosis reaches the event store, and an actual injected HTTP route
  failure returns a redacted response and incident snapshot.
- `lib/redact.test.ts`: configured literal/encoded secrets, common token formats
  and a malformed-surrogate secret do not bypass or crash redaction.
- `lib/processOutput.test.ts`: configured values with trailing whitespace are
  masked before diagnostic whitespace is trimmed. The regression failed before
  the fix because trimming first retained a recognizable credential fragment.
- `runner/redaction.test.ts`: a real local Node child launched through
  `ClaudeSpawner` emits canaries in stdout, tool names, stderr split across
  writes, an encoded URL and a failed provider result. The production runner
  stores redacted diagnostics/results in a disk-backed SQLite profile; event
  rows, subscriber frames, snapshots, timeline and runner logs contain no canary.
  This is an offline process fixture, not an authenticated Claude/model call.

The diagnostic-order fix passed 17 focused tests in 3 files. Local logs:
`controlos-diagnostic-redaction-before.log` (expected failure) and
`controlos-diagnostic-redaction-focused.log` (pass). The synthetic child fixture
and its database remain under `controlos-child-redaction-*` in the temporary
directory for inspection. No user credential or project was used.

T23 remains **not_run** as a complete acceptance scenario. The tests do not yet
certify every auxiliary runner, integration, existing log, export, report or UI
surface. In particular, old data is not retroactively scrubbed. Redaction is
best effort: arbitrary transformations and unknown secret formats are not
guaranteed. Never use a green unit test as permission to expose credentials.
