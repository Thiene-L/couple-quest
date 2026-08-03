CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
