ALTER TABLE runs ADD COLUMN engine_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN idempotency_key TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN request_hash TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN diagnostics TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX runs_idempotency_idx ON runs(idempotency_key);
--> statement-breakpoint
CREATE TABLE execution_locks (resource TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL, owner TEXT NOT NULL, acquired_ts TEXT NOT NULL);
