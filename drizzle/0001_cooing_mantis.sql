CREATE TABLE `challenges` (
	`challenge` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `challenges_expires_idx` ON `challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `point_ledger` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_dedupe_uniq` ON `point_ledger` (`dedupe_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `completions_active_uniq` ON `task_completions` (`task_id`,`day_key`) WHERE status in ('pending', 'confirmed');