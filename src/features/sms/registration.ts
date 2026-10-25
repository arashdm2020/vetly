import 'server-only';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { smsDeliveries } from '@/db/schema';
import { readClinicSettings, readSmsKey } from '@/features/settings/service';
import { smsProvider, type SmsResult } from './providers';
import type { ClinicSettings } from '@/features/settings/schema';
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
    await sendClaimedRegistrationSms(patient,deliveryId,config);
  } catch {
    // The patient is already committed. Never surface a send failure as a failed registration.
    if(deliveryId) {
      try { await database.update(smsDeliveries).set({status:'unknown',lastError:'ارسال ثبت پرونده نیازمند بررسی است؛ پیش از ارسال مجدد پنل پیامکی را بررسی کنید.',updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId)); } catch { /* Retain pending claim; do not resend. */ }
    }
  }
}

// Used after a phone-change transaction has durably claimed this one delivery.
export async function sendClaimedRegistrationSms(patient:{id:string;name:string;phone:string},deliveryId:string,config:ClinicSettings):Promise<SmsResult> {
  const database=getDatabase();
  let result:SmsResult;
  try {
    result=!config.smsEnabled||config.smsProvider==='mock'||!config.registrationPattern.code
      ?{status:'rejected',reason:'شماره ذخیره شد؛ ارسال پیامک یا پترن ثبت پرونده فعال نیست.'}
      :await smsProvider(config.smsProvider,await readSmsKey(config.smsProvider)).send({to:patient.phone,sender:config.farazSender,pattern:config.registrationPattern,
        values:{clinic:config.clinicName,pet:patient.name,phone:config.clinicPhone,date:formatDate(todayISO()),action:'ثبت پرونده'}});
  } catch {result={status:'unknown',reason:'شماره ذخیره شد؛ نتیجه پیامک نامشخص است. پیش از تلاش جدید پنل پیامکی را بررسی کنید.'};}
  try {
    await database.update(smsDeliveries).set({status:result.status==='accepted'?'sent':result.status==='rejected'?'failed':result.status==='simulated'?'simulated':'unknown',
      providerMessageId:result.status==='accepted'?result.messageId:null,sentAt:result.status==='accepted'?Date.now():null,
      lastError:result.status==='accepted'?null:result.reason,updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId));
  } catch { /* Retain the durable unknown claim; never repeat the provider call. */ }
  return result;
}
