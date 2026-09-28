ALTER TABLE task_executions ADD COLUMN context_package_id TEXT REFERENCES context_packages(id);
--> statement-breakpoint
ALTER TABLE task_executions ADD COLUMN context_digest TEXT;
--> statement-breakpoint
ALTER TABLE task_executions ADD COLUMN context_review_version INTEGER;
--> statement-breakpoint
CREATE TRIGGER execution_context_no_update BEFORE UPDATE OF context_package_id, context_digest, context_review_version ON task_executions BEGIN SELECT RAISE(ABORT, 'Execution context binding is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER execution_context_complete BEFORE INSERT ON task_executions
WHEN (NEW.context_package_id IS NULL) != (NEW.context_digest IS NULL)
 OR (NEW.context_package_id IS NULL) != (NEW.context_review_version IS NULL)
 OR NEW.context_review_version <= 0
BEGIN SELECT RAISE(ABORT, 'Execution context binding is incomplete'); END;
