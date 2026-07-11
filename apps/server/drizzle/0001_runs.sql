CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`task` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`started_ts` text NOT NULL,
	`ended_ts` text,
	`duration_ms` integer,
	`tokens_in` integer,
	`tokens_out` integer,
	`turns` integer,
	`verify_verdict` text,
	`human_action` text,
	`exit_code` integer,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `runs_repo_idx` ON `runs` (`repo_id`);--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`status`);