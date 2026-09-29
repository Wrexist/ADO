ALTER TABLE runs ADD COLUMN retry_of_run_id TEXT REFERENCES runs(id);
--> statement-breakpoint
CREATE INDEX runs_retry_of_idx ON runs (retry_of_run_id);
--> statement-breakpoint
CREATE TRIGGER run_retry_lineage_no_update BEFORE UPDATE OF retry_of_run_id ON runs BEGIN SELECT RAISE(ABORT, 'Run retry lineage is immutable'); END;
