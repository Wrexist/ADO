CREATE TABLE task_reviews (
 id text PRIMARY KEY NOT NULL REFERENCES operation_approvals(id), task_id text NOT NULL REFERENCES planning_tasks(id),
 task_version integer NOT NULL, definition_version integer NOT NULL, accepted_task_version integer NOT NULL,
 run_id text NOT NULL REFERENCES runs(id), verification_id text NOT NULL REFERENCES verification_evidence(id),
 head_sha text NOT NULL, diff_digest text NOT NULL, criteria_json text NOT NULL, actor_id text NOT NULL,
 recorded_ts text NOT NULL, invalidated_ts text, invalidation_reason text,
 CHECK ((invalidated_ts IS NULL) = (invalidation_reason IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX task_review_current ON task_reviews(task_id) WHERE invalidated_ts IS NULL;
--> statement-breakpoint
CREATE TRIGGER task_review_immutable BEFORE UPDATE ON task_reviews
WHEN OLD.id IS NOT NEW.id OR OLD.task_id IS NOT NEW.task_id OR OLD.task_version IS NOT NEW.task_version
 OR OLD.definition_version IS NOT NEW.definition_version OR OLD.accepted_task_version IS NOT NEW.accepted_task_version
 OR OLD.run_id IS NOT NEW.run_id OR OLD.verification_id IS NOT NEW.verification_id OR OLD.head_sha IS NOT NEW.head_sha
 OR OLD.diff_digest IS NOT NEW.diff_digest OR OLD.criteria_json IS NOT NEW.criteria_json OR OLD.actor_id IS NOT NEW.actor_id
 OR OLD.recorded_ts IS NOT NEW.recorded_ts OR OLD.invalidated_ts IS NOT NULL OR NEW.invalidated_ts IS NULL OR NEW.invalidation_reason IS NULL
BEGIN SELECT RAISE(ABORT, 'Task review binding and invalidation are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER task_review_no_delete BEFORE DELETE ON task_reviews BEGIN SELECT RAISE(ABORT, 'Task review history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER verification_evidence_no_update BEFORE UPDATE ON verification_evidence BEGIN SELECT RAISE(ABORT, 'Verification evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER verification_evidence_no_delete BEFORE DELETE ON verification_evidence BEGIN SELECT RAISE(ABORT, 'Verification evidence is append-only'); END;
