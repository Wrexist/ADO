ALTER TABLE runs ADD COLUMN workspace_path text;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN base_sha text;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN branch text;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN head_sha text;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN diff_digest text;
