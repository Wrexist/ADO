# Retry without resume (T31)

Both providers declare `resume: false` and no Resume control existed, but
"Dispatch again" started an unrelated run in one click: no link to the
earlier attempt, no warning about effects the earlier attempt may already
have had, and for task runs it bypassed the task review (version, base and
context checks) by resending the expanded prompt.

Now:

- Migration `0024_run_retry_lineage` adds `runs.retry_of_run_id` (nullable,
  indexed, immutable by trigger). Historical rows migrate with `null`.
- `/api/dispatch` accepts `retryOf`. The runner refuses it unless the earlier
  run exists, belongs to the same repository, has finished, has a process stop
  that is not unconfirmed, and is not a task run. Task runs are retried from the
  task review. `retryOf` is part of the idempotency hash; the UI sends one
  `Idempotency-Key` per confirmed retry, so a resubmit returns the same run.
- Run detail: "Dispatch again" first shows that this is a new attempt, not a
  resume, and lists the risks (the agent starts over; outside effects of the
  earlier attempt are not undone and may repeat; working-copy changes are not
  carried over). "Start new attempt" dispatches; "Keep this run only" cancels.
  Task runs have the button disabled with an explanation. Detail shows "New
  attempt of run …" and "Retried as …". CORS now allows the
  `idempotency-key` header.

Evidence: `runner.test.ts` "retry lineage without resume" (unfinished,
missing, other-repository and unconfirmed-stop refusals; lineage recorded;
same key returns the same run; changed request conflicts; lineage cannot be
updated), `approvalMigration.test.ts` (historical rows unchanged apart from
the new null column), and `npm run smoke` (confirmation text, buttons and no
overflow at 1536/390 px, `smoke-shots/retry-confirm-*.png`, DEMO fixture).
`scripts/verify.sh`: 500 tests passed. Full T31 remains open.
