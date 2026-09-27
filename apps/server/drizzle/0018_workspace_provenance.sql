ALTER TABLE runs ADD COLUMN workspace_kind TEXT CHECK(workspace_kind IN ('worktree','isolated_clone','snapshot'));
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN workspace_git_identity TEXT;
--> statement-breakpoint
CREATE TRIGGER runs_workspace_provenance_immutable BEFORE UPDATE ON runs
WHEN OLD.workspace_kind IS NOT NULL AND (
  NEW.workspace_kind IS NOT OLD.workspace_kind OR NEW.workspace_git_identity IS NOT OLD.workspace_git_identity
  OR NEW.workspace_path IS NOT OLD.workspace_path OR NEW.base_sha IS NOT OLD.base_sha OR NEW.branch IS NOT OLD.branch)
BEGIN SELECT RAISE(ABORT, 'Workspace provenance is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER runs_workspace_provenance_complete BEFORE UPDATE ON runs
WHEN (NEW.workspace_kind IS NULL) != (NEW.workspace_git_identity IS NULL)
  OR (NEW.workspace_kind = 'isolated_clone' AND NEW.workspace_git_identity = NEW.source_git_identity)
  OR (NEW.workspace_kind IS NOT NULL AND (NEW.workspace_path IS NULL OR NEW.base_sha IS NULL OR NEW.source_git_identity IS NULL))
BEGIN SELECT RAISE(ABORT, 'Workspace provenance must be complete'); END;
--> statement-breakpoint
CREATE TRIGGER runs_workspace_provenance_insert BEFORE INSERT ON runs
WHEN (NEW.workspace_kind IS NULL) != (NEW.workspace_git_identity IS NULL)
  OR (NEW.workspace_kind = 'isolated_clone' AND NEW.workspace_git_identity = NEW.source_git_identity)
  OR (NEW.workspace_kind IS NOT NULL AND (NEW.workspace_path IS NULL OR NEW.base_sha IS NULL OR NEW.source_git_identity IS NULL))
BEGIN SELECT RAISE(ABORT, 'Workspace provenance must be complete'); END;
