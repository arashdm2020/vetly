import 'server-only';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { smsDeliveries } from '@/db/schema';
import { readClinicSettings, readSmsKey } from '@/features/settings/service';
import { smsProvider } from './providers';
import { formatDate, todayISO } from '@/lib/clinic';

// A unique delivery claim precedes any network call. Ambiguous sends are never retried.
export async function sendRegistrationSms(patient: {id:string;name:string;phone:string}) {
  const database=getDatabase();
  let deliveryId: string | undefined;
  try {
    const config=await readClinicSettings();
    const enabled=config.smsEnabled && config.smsProvider!=='mock' && Boolean(config.registrationPattern.code);
    const [claim]=await database.insert(smsDeliveries).values({petId:patient.id,idempotencyKey:`registration:${patient.id}`,provider:config.smsProvider,
      status:enabled?'pending':'failed',lastError:enabled?null:'پیامک ثبت پرونده ارسال نشد؛ سرویس یا قالب ثبت پرونده تنظیم نشده است.'})
      .onConflictDoNothing({target:smsDeliveries.idempotencyKey}).returning({id:smsDeliveries.id});
    if(!claim || !enabled)return;
    deliveryId=claim.id;
    const key=await readSmsKey(config.smsProvider);
    const result=await smsProvider(config.smsProvider,key).send({to:patient.phone,sender:config.farazSender,pattern:config.registrationPattern,
      values:{clinic:config.clinicName,pet:patient.name,phone:config.clinicPhone,date:formatDate(todayISO()),action:'ثبت پرونده'}});
    await database.update(smsDeliveries).set({status:result.status==='accepted'?'sent':result.status==='rejected'?'failed':result.status==='simulated'?'simulated':'unknown',
      providerMessageId:result.status==='accepted'?result.messageId:null,sentAt:result.status==='accepted'?Date.now():null,
      lastError:result.status==='accepted'?null:result.reason,updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId));
  } catch {
    // The patient is already committed. Never surface a send failure as a failed registration.
    if(deliveryId) {
      try { await database.update(smsDeliveries).set({status:'unknown',lastError:'ارسال ثبت پرونده نیازمند بررسی است؛ پیش از ارسال مجدد پنل پیامکی را بررسی کنید.',updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId)); } catch { /* Retain pending claim; do not resend. */ }
    }
  }
}
