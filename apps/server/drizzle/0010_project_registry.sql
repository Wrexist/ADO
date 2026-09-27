CREATE TABLE `portfolio_projects` (
 `id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `kind` text NOT NULL,
 `goal` text NOT NULL, `lifecycle` text NOT NULL, `focus` integer NOT NULL,
 `manual_priority` integer NOT NULL, `next_task_id` text,
 `created_ts` text NOT NULL, `updated_ts` text NOT NULL, `version` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_repositories` (
 `id` text PRIMARY KEY NOT NULL, `project_id` text NOT NULL REFERENCES `portfolio_projects` (`id`),
 `host` text NOT NULL, `external_id` text NOT NULL, `name` text NOT NULL,
 `canonical_remote` text, `default_branch` text, `observed_ts` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_repository_identity` ON `portfolio_repositories` (`host`, `external_id`);
--> statement-breakpoint
CREATE TABLE `portfolio_checkouts` (
 `id` text PRIMARY KEY NOT NULL, `repository_id` text NOT NULL REFERENCES `portfolio_repositories` (`id`),
 `host_id` text NOT NULL, `canonical_path` text NOT NULL, `path_identity` text NOT NULL,
 `git_identity` text NOT NULL, `source_id` text NOT NULL, `managed` integer NOT NULL,
 `head_sha` text, `observed_ts` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_checkout_path` ON `portfolio_checkouts` (`host_id`, `canonical_path`);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_checkout_identity` ON `portfolio_checkouts` (`host_id`, `path_identity`);
--> statement-breakpoint
CREATE TABLE `portfolio_sources` (
 `id` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `data_json` text NOT NULL, `observed_ts` text NOT NULL
);
