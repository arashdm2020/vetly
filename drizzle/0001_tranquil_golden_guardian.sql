-- Add nullable fields in place to preserve existing patients and their references.
ALTER TABLE `pets` ADD `color` text;--> statement-breakpoint
ALTER TABLE `pets` ADD `weight_grams` integer CONSTRAINT `pets_weight_check` CHECK (`weight_grams` is null or `weight_grams` > 0);--> statement-breakpoint
ALTER TABLE `pets` ADD `microchip` text;--> statement-breakpoint
ALTER TABLE `pets` ADD `sterilized` integer;--> statement-breakpoint
ALTER TABLE `pets` ADD `allergies` text;--> statement-breakpoint
ALTER TABLE `pets` ADD `chronic_conditions` text;--> statement-breakpoint
ALTER TABLE `pets` ADD `current_medications` text;--> statement-breakpoint
ALTER TABLE `vaccinations` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `visits` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `appointments_status_date_idx` ON `appointments` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `appointments_pet_idx` ON `appointments` (`pet_id`);
