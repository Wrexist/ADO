# Claude terminal result validation

The stream-json adapter requires an explicit outcome in each result frame: a supported success/error subtype or a boolean `is_error`. Missing outcomes, unknown subtypes, non-boolean error flags and contradictory subtype/error flags are incompatible. Present turn/token counters must be nonnegative safe integers; absent counters remain unknown. A present usage container must be an object. Unsupported required fields fail with a generic diagnostic, without interpolating the raw frame.

The runner observes this failure, requests stop, waits for its process-completion promise and persists failure even if the process returned exit code zero. An incompatible result is not captured as final result text and does not become a successful completion event. This does not weaken the existing process-termination/lock rules.

Eleven regressions failed before the change: ten malformed result variants and an actual Runner/SQLite/Bus path with exit zero. The completed focused suite also includes both explicit error-flag outcomes, unknown usage, normal results, output redaction and independent stream/process completion. Redaction fixtures now supply explicit successful outcomes so they test valid protocol data.

Reproduce: `npx vitest run apps/server/src/runner/claudeResult.test.ts apps/server/src/runner/runner.test.ts apps/server/src/runner/redaction.test.ts apps/server/src/runner/lifecycle.test.ts`. Logs: `controlos-claude-result-before.log` and `controlos-claude-result-focused.log`.

Unknown optional telemetry and malformed non-result lines still use the existing opaque fallback. This change is not negotiated protocol-version support, full T30 acceptance, or proof of a live Claude login/model run. Process completion remains separate from independent result verification and task acceptance.
