CREATE TABLE `daily_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `daily_questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_answers_uniq` ON `daily_answers` (`question_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `daily_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`day_key` text NOT NULL,
	`question` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_questions_day_key_unique` ON `daily_questions` (`day_key`);--> statement-breakpoint
CREATE INDEX `daily_questions_day_idx` ON `daily_questions` (`day_key`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`emoji` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `milestones_kind_idx` ON `milestones` (`kind`);--> statement-breakpoint
CREATE TABLE `reminder_log` (
	`key` text PRIMARY KEY NOT NULL,
	`sent_at` integer NOT NULL
);
