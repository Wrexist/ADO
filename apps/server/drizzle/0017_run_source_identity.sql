ALTER TABLE runs ADD COLUMN source_git_identity TEXT;
--> statement-breakpoint
CREATE TRIGGER runs_source_identity_immutable BEFORE UPDATE ON runs
WHEN OLD.source_git_identity IS NOT NULL AND NEW.source_git_identity IS NOT OLD.source_git_identity
BEGIN SELECT RAISE(ABORT, 'Run source repository identity is immutable'); END;
