CREATE TABLE task_executions (
 run_id text PRIMARY KEY NOT NULL REFERENCES runs(id), task_id text NOT NULL REFERENCES planning_tasks(id),
 task_version integer NOT NULL, task_snapshot_json text NOT NULL, checkout_id text NOT NULL REFERENCES portfolio_checkouts(id),
 base_sha text NOT NULL, current_task_version integer NOT NULL, state text NOT NULL, created_ts text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER task_execution_binding_immutable BEFORE UPDATE OF run_id, task_id, task_version, task_snapshot_json, checkout_id, base_sha, created_ts ON task_executions BEGIN SELECT RAISE(ABORT, 'Task execution binding is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER task_execution_no_delete BEFORE DELETE ON task_executions BEGIN SELECT RAISE(ABORT, 'Task execution history is immutable'); END;
