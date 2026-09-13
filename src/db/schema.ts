import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// UTC epoch milliseconds for instants; ISO YYYY-MM-DD for clinic calendar dates.
const timestamps = () => ({
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
});
const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());

export const owners = sqliteTable('owners', {
  id: id(), fullName: text('full_name').notNull(), phone: text('phone').notNull(), ...timestamps(),
}, table => [index('owners_phone_idx').on(table.phone)]);

export const pets = sqliteTable('pets', {
  id: id(), ownerId: text('owner_id').notNull().references(() => owners.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), species: text('species', { enum: ['dog', 'cat', 'bird', 'other'] }).notNull(),
  breed: text('breed'), sex: text('sex', { enum: ['male', 'female', 'unknown'] }).notNull().default('unknown'),
  birthDate: text('birth_date'), notes: text('notes'), ...timestamps(),
}, table => [
  index('pets_owner_idx').on(table.ownerId), index('pets_name_idx').on(table.name),
  check('pets_species_check', sql`${table.species} in ('dog','cat','bird','other')`),
  check('pets_sex_check', sql`${table.sex} in ('male','female','unknown')`),
]);

export const visits = sqliteTable('visits', {
  id: id(), petId: text('pet_id').notNull().references(() => pets.id, { onDelete: 'restrict' }),
  visitedAt: text('visited_at').notNull(),
  type: text('type', { enum: ['examination', 'followup', 'emergency', 'procedure'] }).notNull(),
  complaint: text('complaint'), diagnosis: text('diagnosis'), treatment: text('treatment'),
  medications: text('medications'), notes: text('notes'), ...timestamps(),
}, table => [
  index('visits_pet_date_idx').on(table.petId, table.visitedAt),
  check('visits_type_check', sql`${table.type} in ('examination','followup','emergency','procedure')`),
]);

export const vaccinations = sqliteTable('vaccinations', {
  id: id(), petId: text('pet_id').notNull().references(() => pets.id, { onDelete: 'restrict' }),
  vaccineName: text('vaccine_name').notNull(), administeredAt: text('administered_at').notNull(),
  nextDueAt: text('next_due_at'), notes: text('notes'),
  reminderEnabled: integer('reminder_enabled', { mode: 'boolean' }).notNull().default(false), ...timestamps(),
}, table => [
  index('vaccinations_due_idx').on(table.nextDueAt), index('vaccinations_pet_idx').on(table.petId),
  uniqueIndex('vaccinations_id_pet_idx').on(table.id, table.petId),
  check('vaccinations_dates_check', sql`${table.nextDueAt} is null or ${table.nextDueAt} > ${table.administeredAt}`),
]);

export const appointments = sqliteTable('appointments', {
  id: id(), petId: text('pet_id').notNull().references(() => pets.id, { onDelete: 'restrict' }),
  scheduledAt: integer('scheduled_at').notNull(),
  status: text('status', { enum: ['scheduled', 'completed', 'cancelled'] }).notNull().default('scheduled'),
  notes: text('notes'), ...timestamps(),
}, table => [index('appointments_date_idx').on(table.scheduledAt),
  check('appointments_status_check', sql`${table.status} in ('scheduled','completed','cancelled')`)]);

export const reminders = sqliteTable('reminders', {
  id: id(), petId: text('pet_id').notNull().references(() => pets.id, { onDelete: 'restrict' }),
  vaccinationId: text('vaccination_id'),
  type: text('type', { enum: ['vaccination', 'task'] }).notNull(), title: text('title').notNull(), notes: text('notes'),
  scheduledAt: integer('scheduled_at').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'sent', 'failed', 'cancelled'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0), lastError: text('last_error'), sentAt: integer('sent_at'),
  completedAt: integer('completed_at'), ...timestamps(),
}, table => [
  index('reminders_due_idx').on(table.status, table.scheduledAt), index('reminders_pet_idx').on(table.petId),
  uniqueIndex('reminders_vaccination_schedule_idx').on(table.vaccinationId, table.scheduledAt),
  foreignKey({ columns: [table.vaccinationId, table.petId], foreignColumns: [vaccinations.id, vaccinations.petId] }).onDelete('restrict'),
  check('reminders_type_check', sql`${table.type} in ('vaccination','task')`),
  check('reminders_status_check', sql`${table.status} in ('pending','processing','sent','failed','cancelled')`),
  check('reminders_attempts_check', sql`${table.attempts} >= 0`),
  check('reminders_relationship_check', sql`(${table.type} = 'vaccination' and ${table.vaccinationId} is not null) or (${table.type} = 'task' and ${table.vaccinationId} is null)`),
]);

export const smsDeliveries = sqliteTable('sms_deliveries', {
  id: id(), reminderId: text('reminder_id').notNull().references(() => reminders.id, { onDelete: 'restrict' }),
  idempotencyKey: text('idempotency_key').notNull(), provider: text('provider').notNull(),
  providerMessageId: text('provider_message_id'),
  status: text('status', { enum: ['pending', 'sent', 'failed', 'unknown', 'simulated'] }).notNull().default('pending'),
  lastError: text('last_error'), sentAt: integer('sent_at'), ...timestamps(),
}, table => [uniqueIndex('sms_deliveries_key_idx').on(table.idempotencyKey),
  index('sms_deliveries_reminder_idx').on(table.reminderId),
  check('sms_delivery_status_check', sql`${table.status} in ('pending','sent','failed','unknown','simulated')`)]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(), value: text('value').notNull(), ...timestamps(),
});
