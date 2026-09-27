CREATE TABLE verification_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id),
  repo_id TEXT NOT NULL,
  repository_id TEXT,
  git_identity TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  diff_digest TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  process_identity TEXT,
  process_termination TEXT,
  started_ts TEXT NOT NULL,
  ended_ts TEXT,
  note TEXT
);
--> statement-breakpoint
CREATE INDEX verification_attempts_run ON verification_attempts(run_id, started_ts);
--> statement-breakpoint
CREATE TRIGGER verification_attempts_target_immutable BEFORE UPDATE ON verification_attempts
WHEN NEW.id IS NOT OLD.id OR NEW.run_id IS NOT OLD.run_id OR NEW.repo_id IS NOT OLD.repo_id
  OR NEW.repository_id IS NOT OLD.repository_id OR NEW.git_identity IS NOT OLD.git_identity
  OR NEW.workspace_path IS NOT OLD.workspace_path OR NEW.base_sha IS NOT OLD.base_sha
  OR NEW.head_sha IS NOT OLD.head_sha OR NEW.diff_digest IS NOT OLD.diff_digest
  OR NEW.command IS NOT OLD.command OR NEW.started_ts IS NOT OLD.started_ts
  OR (OLD.process_identity IS NOT NULL AND NEW.process_identity IS NOT OLD.process_identity)
BEGIN SELECT RAISE(ABORT, 'Verification attempt target and process identity are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER verification_attempts_no_delete BEFORE DELETE ON verification_attempts
BEGIN SELECT RAISE(ABORT, 'Verification attempt history is immutable'); END;
--> statement-breakpoint
ALTER TABLE verification_evidence ADD COLUMN attempt_id TEXT REFERENCES verification_attempts(id);
--> statement-breakpoint
CREATE UNIQUE INDEX verification_evidence_attempt ON verification_evidence(attempt_id) WHERE attempt_id IS NOT NULL;
