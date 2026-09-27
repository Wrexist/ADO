CREATE TABLE task_reopenings (
 id text PRIMARY KEY NOT NULL, task_id text NOT NULL REFERENCES planning_tasks(id), run_id text NOT NULL REFERENCES runs(id),
 from_version integer NOT NULL, to_version integer NOT NULL, reason text NOT NULL,
 idempotency_key text NOT NULL UNIQUE, request_hash text NOT NULL, actor_id text NOT NULL, recorded_ts text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER task_reopenings_no_update BEFORE UPDATE ON task_reopenings BEGIN SELECT RAISE(ABORT, 'Task reopening history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER task_reopenings_no_delete BEFORE DELETE ON task_reopenings BEGIN SELECT RAISE(ABORT, 'Task reopening history is immutable'); END;
