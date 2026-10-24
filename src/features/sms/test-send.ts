import 'server-only';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { settings, smsDeliveries } from '@/db/schema';
import { readClinicSettings, readSmsKey } from '@/features/settings/service';
import { normalizePhone } from '@/lib/clinic';
import { smsProvider } from './providers';

export const testSendSchema = z.object({
  requestId:z.string().uuid(),
  recipient:z.string().max(30).transform(normalizePhone).pipe(z.string()),
  pattern:z.enum(['registrationPattern','vaccinePattern','taskPattern']),
  values:z.object({pet:z.string().trim().min(1).max(80),date:z.string().trim().min(1).max(40),
    clinic:z.string().trim().min(1).max(100),phone:z.string().trim().min(1).max(30),action:z.string().trim().min(1).max(100)}).strict(),
}).strict();

// Caller must authenticate before invoking. No worker, patient or reminder side effects.
export async function sendTestSms(raw:unknown) {
  const input=testSendSchema.parse(raw);
  const config=await readClinicSettings();
  if(!config.smsEnabled || config.smsProvider!=='faraz' || !config[input.pattern].code)
    return {status:'rejected' as const,reason:'فراز و پترن انتخابی را ابتدا ذخیره و فعال کنید.'};
  const key=await readSmsKey('faraz');
  const db=getDatabase();
  // Persistent global cooldown survives cold starts and concurrent Vercel instances.
  const now=Date.now();
  const [slot]=await db.insert(settings).values({key:'sms-test:cooldown',value:String(now),updatedAt:now})
    .onConflictDoUpdate({target:settings.key,set:{value:String(now),updatedAt:now},
      setWhere:sql`${settings.updatedAt} <= ${now-60000}`}).returning({key:settings.key});
  if(!slot)return {status:'rejected' as const,reason:'بین ارسال‌های آزمایشی حداقل یک دقیقه صبر کنید.'};
  const [claim]=await db.insert(smsDeliveries).values({idempotencyKey:`sms-test:${input.requestId}`,provider:'faraz',status:'unknown',
    lastError:'آزمایش آغاز شد؛ پیش از ارسال مجدد پنل فراز را بررسی کنید.'})
    .onConflictDoNothing({target:smsDeliveries.idempotencyKey}).returning({id:smsDeliveries.id});
  if(!claim)return {status:'unknown' as const,reason:'این درخواست قبلاً ثبت شده است؛ پنل فراز را بررسی کنید.'};
  // Claim is deliberately retained even on timeout/crash. Never retry this request.
  const result=await smsProvider('faraz',key).send({to:input.recipient,sender:config.farazSender,pattern:config[input.pattern],values:input.values});
  await db.update(smsDeliveries).set({status:result.status==='accepted'?'sent':result.status==='rejected'?'failed':'unknown',
    providerMessageId:result.status==='accepted'?result.messageId:null,lastError:result.status==='accepted'?null:result.reason,
    sentAt:result.status==='accepted'?Date.now():null,updatedAt:Date.now()}).where(eq(smsDeliveries.id,claim.id));
  return result;
}
