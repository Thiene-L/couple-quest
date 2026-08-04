CREATE TABLE `duels` (
	`id` text PRIMARY KEY NOT NULL,
	`challenger_id` text NOT NULL,
	`opponent_id` text NOT NULL,
	`game` text NOT NULL,
	`stake` integer NOT NULL,
	`challenger_move` text NOT NULL,
	`opponent_move` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`winner` text,
	`created_at` integer NOT NULL,
	`settled_at` integer,
	FOREIGN KEY (`challenger_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `duels_status_idx` ON `duels` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `pokes` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`seen_at` integer,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pokes_to_idx` ON `pokes` (`to_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reactions_target_idx` ON `reactions` (`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reactions_one_per_user` ON `reactions` (`user_id`,`target_type`,`target_id`);