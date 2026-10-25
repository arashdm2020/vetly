import 'server-only';
import { createHash } from 'node:crypto';
import { getDatabase } from '@/db';
import { readClinicSettings } from '@/features/settings/service';
import { sendClaimedRegistrationSms } from '@/features/sms/registration';
import type { SmsResult } from '@/features/sms/providers';
import { changePatientPhoneSchema } from './schema';

export type PhoneChangeResult={changed:boolean;sms:SmsResult|null};
// Called only through the authenticated clinic action. Phone update and send claim
// commit together; neither retries nor an ambiguous send can duplicate the SMS.
export async function changePatientPhone(raw:unknown):Promise<PhoneChangeResult> {
  const input=changePatientPhoneSchema.parse(raw),db=getDatabase();
  const config=await readClinicSettings();
  const digest=createHash('sha256').update(input.expectedPhone+':'+input.phone).digest('hex');
  const key=`phone-change:${input.petId}:${input.requestId}:${digest}`;
  const deliveryId=crypto.randomUUID(),now=Date.now();
  // A write batch is atomic on both local SQLite and remote libSQL. Only the
  // invocation that inserted this random claim ID may change the owner or send.
  const rows=await db.$client.batch([
    {sql:`INSERT INTO sms_deliveries (id,pet_id,idempotency_key,provider,status,last_error,created_at,updated_at)
      SELECT ?,p.id,?,?,'unknown',?, ?,? FROM pets p JOIN owners o ON o.id=p.owner_id
      WHERE p.id=? AND o.phone=? AND o.phone<>? ON CONFLICT(idempotency_key) DO NOTHING`,
      args:[deliveryId,key,config.smsProvider,'شماره ذخیره شد؛ پیامک ثبت پرونده در حال بررسی است. ارسال خودکار تکرار نمی‌شود.',now,now,input.petId,input.expectedPhone,input.phone]},
    {sql:`UPDATE owners SET phone=?,updated_at=? WHERE id=(SELECT owner_id FROM pets WHERE id=?) AND phone=?
      AND EXISTS (SELECT 1 FROM sms_deliveries WHERE id=?)`,args:[input.phone,now,input.petId,input.expectedPhone,deliveryId]},
    {sql:'SELECT p.id,p.name,o.phone FROM pets p JOIN owners o ON o.id=p.owner_id WHERE p.id=?',args:[input.petId]},
    {sql:'SELECT id,status,provider_message_id,last_error FROM sms_deliveries WHERE idempotency_key=?',args:[key]},
  ],'write');
  const patient=rows[2].rows[0],delivery=rows[3].rows[0];
  if(!patient)throw new Error('بیمار پیدا نشد.');
  if(delivery?.id===deliveryId)return {changed:true,sms:await sendClaimedRegistrationSms({id:String(patient.id),name:String(patient.name),phone:input.phone},deliveryId,config)};
  if(delivery){
    const sms:SmsResult=delivery.status==='sent'&&delivery.provider_message_id
      ?{status:'accepted',messageId:String(delivery.provider_message_id)}
      :{status:delivery.status==='failed'?'rejected':'unknown',reason:String(delivery.last_error||'نتیجه پیامک نامشخص است؛ پنل پیامکی را بررسی کنید.')};
    return {changed:true,sms};
  }
  if(patient.phone===input.phone)return {changed:false,sms:null};
  throw new Error('شماره پرونده تغییر کرده است؛ صفحه را تازه کنید و دوباره بررسی کنید.');
}
