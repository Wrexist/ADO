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

T23 remains **not_run** as a complete acceptance scenario. The tests do not yet
certify every auxiliary runner, integration, existing log, export, report or UI
surface. In particular, old data is not retroactively scrubbed. Redaction is
best effort: arbitrary transformations and unknown secret formats are not
guaranteed. Never use a green unit test as permission to expose credentials.
