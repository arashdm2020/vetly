import 'server-only';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { settings } from '@/db/schema';
import { clinicSettingsSchema, defaultSettings } from './schema';
import { encryptSecret, decryptSecret } from '@/lib/secrets';
export async function readClinicSettings() {
  const [row] = await getDatabase().select().from(settings).where(eq(settings.key, 'clinic')).limit(1);
  return row ? clinicSettingsSchema.parse(JSON.parse(row.value)) : defaultSettings;
}
export async function hasSmsKey(provider: string) {
  const [row] = await getDatabase().select({key:settings.key}).from(settings).where(eq(settings.key, `sms-key:${provider}`)).limit(1);
  return Boolean(row);
}
export async function readSmsKey(provider: string) {
  const [row] = await getDatabase().select().from(settings).where(eq(settings.key, `sms-key:${provider}`)).limit(1);
  if (!row) throw new Error('کلید سرویس پیامکی تنظیم نشده است.');
  return decryptSecret(row.value);
}
export async function saveClinicSettings(input: unknown, apiKey: string) {
  const parsed = clinicSettingsSchema.parse(input);
  if (parsed.smsEnabled && !apiKey && !await hasSmsKey(parsed.smsProvider)) throw new Error('کلید سرویس پیامکی را وارد کنید.');
  const database = getDatabase();
  const write = (key: string, value: string) => database.insert(settings).values({key,value})
    .onConflictDoUpdate({target: settings.key, set: {value, updatedAt: Date.now()}});
  const primary = write('clinic', JSON.stringify(parsed));
  if (apiKey) await database.batch([primary, write(`sms-key:${parsed.smsProvider}`, encryptSecret(apiKey))]);
  else await primary;
  return parsed;
}
