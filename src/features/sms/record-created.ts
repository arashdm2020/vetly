import 'server-only';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { smsDeliveries, pets, owners } from '@/db/schema';
import { readClinicSettings, readSmsKey } from '@/features/settings/service';
import { smsProvider } from './providers';
import { eventDateTime } from '@/features/reminders/schedule';

// Called only after the medical record and its single future notification commit.
// A durable claim precedes HTTP; errors must never turn a saved record into a failed save.
export async function sendRecordCreatedSms(event:{id:string;petId:string;kind:'visit'|'vaccine'|'reminder';title:string;dueAt:number;reminderId?:string}) {
  const db=getDatabase();let deliveryId:string|undefined;
  try {
    const config=await readClinicSettings();
    const pattern=event.kind==='vaccine'?config.vaccinePattern:config.taskPattern;
    const enabled=config.smsEnabled&&config.smsProvider!=='mock'&&Boolean(pattern.code);
    const [claim]=await db.insert(smsDeliveries).values({petId:event.petId,reminderId:event.reminderId,
      idempotencyKey:`record:${event.kind}:${event.id}:created`,provider:config.smsProvider,status:enabled?'pending':'failed',
      lastError:enabled?null:'ارسال هنگام ثبت غیرفعال بود یا پترن تنظیم نشده است.'})
      .onConflictDoNothing({target:smsDeliveries.idempotencyKey}).returning({id:smsDeliveries.id});
    if(!claim||!enabled)return;
    deliveryId=claim.id;
    const [patient]=await db.select({name:pets.name,phone:owners.phone}).from(pets).innerJoin(owners,eq(pets.ownerId,owners.id)).where(eq(pets.id,event.petId)).limit(1);
    if(!patient)throw new Error('Missing patient');
    const result=await smsProvider(config.smsProvider,await readSmsKey(config.smsProvider)).send({to:patient.phone,sender:config.farazSender,pattern,
      values:{pet:patient.name,clinic:config.clinicName,phone:config.clinicPhone,date:eventDateTime(event.dueAt),action:event.title}});
    await db.update(smsDeliveries).set({status:result.status==='accepted'?'sent':result.status==='rejected'?'failed':result.status==='simulated'?'simulated':'unknown',
      providerMessageId:result.status==='accepted'?result.messageId:null,sentAt:result.status==='accepted'?Date.now():null,
      lastError:result.status==='accepted'?null:result.reason,updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId));
  } catch {
    if(deliveryId)try {await db.update(smsDeliveries).set({status:'unknown',lastError:'نتیجه پیامک ثبت مشخص نیست؛ پیش از تلاش مجدد پنل سرویس را بررسی کنید.',updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId));} catch { /* Retain durable claim. */ }
  }
}
