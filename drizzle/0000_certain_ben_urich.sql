CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_id` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "appointments_status_check" CHECK("appointments"."status" in ('scheduled','completed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `appointments_date_idx` ON `appointments` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `owners_phone_idx` ON `owners` (`phone`);--> statement-breakpoint
CREATE TABLE `pets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`breed` text,
	`sex` text DEFAULT 'unknown' NOT NULL,
	`birth_date` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pets_species_check" CHECK("pets"."species" in ('dog','cat','bird','other')),
	CONSTRAINT "pets_sex_check" CHECK("pets"."sex" in ('male','female','unknown'))
);
--> statement-breakpoint
CREATE INDEX `pets_owner_idx` ON `pets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `pets_name_idx` ON `pets` (`name`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_id` text NOT NULL,
	`vaccination_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`scheduled_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`vaccination_id`,`pet_id`) REFERENCES `vaccinations`(`id`,`pet_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reminders_type_check" CHECK("reminders"."type" in ('vaccination','task')),
	CONSTRAINT "reminders_status_check" CHECK("reminders"."status" in ('pending','processing','sent','failed','cancelled')),
	CONSTRAINT "reminders_attempts_check" CHECK("reminders"."attempts" >= 0),
	CONSTRAINT "reminders_relationship_check" CHECK(("reminders"."type" = 'vaccination' and "reminders"."vaccination_id" is not null) or ("reminders"."type" = 'task' and "reminders"."vaccination_id" is null))
);
--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `reminders_pet_idx` ON `reminders` (`pet_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_vaccination_schedule_idx` ON `reminders` (`vaccination_id`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`reminder_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sms_delivery_status_check" CHECK("sms_deliveries"."status" in ('pending','sent','failed','unknown','simulated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_deliveries_key_idx` ON `sms_deliveries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `sms_deliveries_reminder_idx` ON `sms_deliveries` (`reminder_id`);--> statement-breakpoint
CREATE TABLE `vaccinations` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_id` text NOT NULL,
	`vaccine_name` text NOT NULL,
	`administered_at` text NOT NULL,
	`next_due_at` text,
	`notes` text,
	`reminder_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "vaccinations_dates_check" CHECK("vaccinations"."next_due_at" is null or "vaccinations"."next_due_at" > "vaccinations"."administered_at")
);
--> statement-breakpoint
CREATE INDEX `vaccinations_due_idx` ON `vaccinations` (`next_due_at`);--> statement-breakpoint
CREATE INDEX `vaccinations_pet_idx` ON `vaccinations` (`pet_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `vaccinations_id_pet_idx` ON `vaccinations` (`id`,`pet_id`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_id` text NOT NULL,
	`visited_at` text NOT NULL,
	`type` text NOT NULL,
	`complaint` text,
	`diagnosis` text,
	`treatment` text,
	`medications` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "visits_type_check" CHECK("visits"."type" in ('examination','followup','emergency','procedure'))
);
--> statement-breakpoint
CREATE INDEX `visits_pet_date_idx` ON `visits` (`pet_id`,`visited_at`);