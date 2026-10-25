ALTER TABLE `reminders` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `reminders` ADD `visit_id` text REFERENCES visits(id);