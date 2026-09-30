PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sms_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`reminder_id` text,
	`pet_id` text,
	`idempotency_key` text NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sms_delivery_status_check" CHECK("__new_sms_deliveries"."status" in ('pending','sent','failed','unknown','simulated'))
);
--> statement-breakpoint
INSERT INTO `__new_sms_deliveries`("id", "reminder_id", "pet_id", "idempotency_key", "provider", "provider_message_id", "status", "last_error", "sent_at", "created_at", "updated_at") SELECT "id", "reminder_id", NULL, "idempotency_key", "provider", "provider_message_id", "status", "last_error", "sent_at", "created_at", "updated_at" FROM `sms_deliveries`;--> statement-breakpoint
DROP TABLE `sms_deliveries`;--> statement-breakpoint
ALTER TABLE `__new_sms_deliveries` RENAME TO `sms_deliveries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sms_deliveries_key_idx` ON `sms_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `sms_deliveries_reminder_idx` ON `sms_deliveries` (`reminder_id`);
