CREATE TABLE `announcement_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`announcement_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unreported' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_phone_idx` ON `announcement_recipients` (`announcement_id`,`phone`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`sender` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_id` text,
	`provider_status` text,
	`last_error` text,
	`report_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcements_request_idx` ON `announcements` (`request_id`);--> statement-breakpoint
CREATE INDEX `announcements_queue_idx` ON `announcements` (`status`,`created_at`);