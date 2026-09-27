CREATE TABLE automation_dispatches (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES runs(id),
  automation_id TEXT NOT NULL,
  accepted_ts TEXT NOT NULL,
  recorded_ts TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX automation_pending_dispatch ON automation_dispatches(automation_id) WHERE recorded_ts IS NULL;
