CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`ts` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_ref` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`name` text PRIMARY KEY NOT NULL,
	`last_run_ts` text
);
--> statement-breakpoint
CREATE TABLE `samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`cpu_pct` real NOT NULL,
	`mem_pct` real NOT NULL,
	`net_pct` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `samples_ts_idx` ON `samples` (`ts`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`key` text NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_day_key_unique` ON `snapshots` (`day`,`key`);