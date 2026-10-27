import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { announcements, announcementRecipients, owners, pets } from '@/db/schema';
import { readClinicSettings, readSmsKey } from '@/features/settings/service';
import { normalizePhone } from '@/lib/clinic';
import { announcementInput, recipientLimit } from './schema';
import { farazAnnouncements } from './provider';

export async function resolveAnnouncement(raw:unknown){
  const input=announcementInput.parse(raw),db=getDatabase();
  const selected=input.audience==='none'?[]:await db.select({phone:owners.phone,name:owners.fullName}).from(pets).innerJoin(owners,eq(pets.ownerId,owners.id))
    .where(input.audience==='selected'?inArray(pets.id,input.petIds):input.audience==='all'?undefined:eq(pets.species,input.audience)).orderBy(asc(owners.id)).limit(1001);
  // Reject instead of silently truncating a large audience.
  if(selected.length>1000)throw new Error('گروه بزرگ است؛ مشتریان را در گروه‌های کوچک‌تر انتخاب کنید.');
  const normalized=selected.map(row=>{const phone=normalizePhone(row.phone);if(!phone)throw new Error('یکی از شماره‌های پرونده نامعتبر است؛ ابتدا آن را اصلاح کنید.');return {...row,phone};});
  const recipients=[...new Map([...normalized,...input.manual].map(row=>[row.phone,row])).values()].sort((a,b)=>a.phone.localeCompare(b.phone));
  if(!recipients.length||recipients.length>recipientLimit)throw new Error(`بین ۱ تا ${recipientLimit} شماره یکتا انتخاب کنید.`);
  return {input,recipients};
}
export function audienceHash(recipients:{phone:string;name:string}[]){return createHash('sha256').update(JSON.stringify(recipients)).digest('hex');}
export async function accessibleAnnouncementLines(){
  const config=await readClinicSettings();
  if(config.smsProvider!=='faraz')throw new Error('ابتدا سرویس فراز را در تنظیمات پیامک انتخاب کنید.');
  return farazAnnouncements(await readSmsKey('faraz')).lines();
}
export async function queueAnnouncement(raw:unknown,expectedHash:string){
  const {input,recipients}=await resolveAnnouncement(raw),db=getDatabase();
  if(audienceHash(recipients)!==expectedHash)throw new Error('فهرست گیرندگان تغییر کرده است؛ دوباره پیش‌نمایش را بررسی کنید.');
  const fingerprint=createHash('sha256').update(JSON.stringify({title:input.title,text:input.text,sender:input.sender,recipients})).digest('hex');
  const [old]=await db.select().from(announcements).where(eq(announcements.requestId,input.requestId));
  if(old){if(old.fingerprint!==fingerprint)throw new Error('این درخواست قبلاً با محتوای دیگری ثبت شده است.');return old.id;}
  const config=await readClinicSettings();
  if(!config.smsEnabled||config.smsProvider!=='faraz')throw new Error('ابتدا سرویس فراز را در تنظیمات پیامک فعال کنید.');
  const lines=await accessibleAnnouncementLines();
  if(!lines.some(line=>line.number===input.sender))throw new Error('خط انتخاب‌شده در فهرست خطوط مجاز حساب نیست؛ فهرست خطوط را دوباره دریافت کنید.');
  const id=crypto.randomUUID(),now=Date.now();
  // Each insertion is conditional on this campaign ID. Concurrent UUID replays
  // return the winning campaign; the persistent cooldown limits accidental bulk sends.
  const result=await db.$client.batch([
    {sql:`INSERT INTO settings(key,value,created_at,updated_at) VALUES('announcement:cooldown',?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
      WHERE settings.updated_at<=?`,args:[id,now,now,now-60000]},
    {sql:`INSERT INTO announcements(id,request_id,fingerprint,title,text,sender,status,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM settings WHERE key='announcement:cooldown' AND value=?)
      ON CONFLICT(request_id) DO NOTHING`,args:[id,input.requestId,fingerprint,input.title,input.text,input.sender,now,now,id]},
    ...recipients.map(row=>({sql:`INSERT INTO announcement_recipients(id,announcement_id,phone,name,status,created_at,updated_at)
      SELECT ?,?,?,?,'unreported',?,? WHERE EXISTS(SELECT 1 FROM announcements WHERE id=?)`,args:[crypto.randomUUID(),id,row.phone,row.name,now,now,id]})),
    {sql:'SELECT id,fingerprint FROM announcements WHERE request_id=?',args:[input.requestId]},
  ],'write');
  const winner=result.at(-1)!.rows[0];
  if(!winner)throw new Error('بین ثبت اطلاع‌رسانی‌ها حداقل یک دقیقه فاصله بگذارید.');
  if(winner.fingerprint!==fingerprint)throw new Error('این درخواست قبلاً با محتوای دیگری ثبت شده است.');
  return String(winner.id);
}
export async function listAnnouncements(page=1){
  return getDatabase().select().from(announcements).orderBy(desc(announcements.createdAt)).limit(20).offset((page-1)*20);
}
export async function announcementReport(id:string){
  const [campaign]=await getDatabase().select().from(announcements).where(eq(announcements.id,id));
  if(!campaign)throw new Error('اطلاع‌رسانی پیدا نشد.');
  const recipients=await getDatabase().select().from(announcementRecipients).where(eq(announcementRecipients.announcementId,id)).orderBy(asc(announcementRecipients.phone));
  return {campaign,recipients};
}
export async function cancelAnnouncement(id:string){
  await getDatabase().update(announcements).set({status:'cancelled',updatedAt:Date.now()}).where(and(eq(announcements.id,id),eq(announcements.status,'queued')));
}
export async function refreshAnnouncement(id:string){
  const db=getDatabase(),{campaign}=await announcementReport(id);
  if(!campaign.providerId)throw new Error('شناسه‌ای از فراز نداریم؛ برای نتیجه نامشخص پنل را بررسی کنید.');
  const [lock]=await db.update(announcements).set({reportAt:Date.now()}).where(and(eq(announcements.id,id),sql`(${announcements.reportAt} IS NULL OR ${announcements.reportAt}<${Date.now()-30000})`)).returning({id:announcements.id});
  if(!lock)throw new Error('بین بررسی گزارش‌ها ۳۰ ثانیه فاصله بگذارید.');
  const report=await farazAnnouncements(await readSmsKey('faraz')).report(campaign.providerId);
  await db.batch([
    db.update(announcements).set({providerStatus:report.status,lastError:report.recognized?null:'ساختار گزارش فراز قابل تفسیر نیست؛ گزارش قطعی را در پنل بررسی کنید.',updatedAt:Date.now()}).where(eq(announcements.id,id)),
    ...report.recipients.map(row=>db.update(announcementRecipients).set({status:row.status,updatedAt:Date.now()}).where(and(eq(announcementRecipients.announcementId,id),eq(announcementRecipients.phone,row.phone)))),
  ]);
}
export async function processAnnouncements(campaignId?:string){
  const db=getDatabase(),config=await readClinicSettings();
  // Stale in-flight claims become unknown, never queued for another paid send.
  await db.update(announcements).set({status:'unknown',lastError:'پردازش قطع شد؛ پیش از ارسال جدید پنل را بررسی کنید.',updatedAt:Date.now()})
    .where(and(eq(announcements.status,'submitting'),lte(announcements.updatedAt,Date.now()-10*60000)));
  if(!config.smsEnabled||config.smsProvider!=='faraz')return {processed:0};
  const key=await readSmsKey('faraz');
  const [campaign]=await db.select().from(announcements).where(campaignId?and(eq(announcements.status,'queued'),eq(announcements.id,campaignId)):eq(announcements.status,'queued')).orderBy(asc(announcements.createdAt)).limit(1);
  if(!campaign)return {processed:0};
  const [claim]=await db.update(announcements).set({status:'submitting',updatedAt:Date.now()}).where(and(eq(announcements.id,campaign.id),eq(announcements.status,'queued'))).returning({id:announcements.id});
  if(!claim)return {processed:0};
  try {
    const current=await readClinicSettings();
    if(!current.smsEnabled||current.smsProvider!=='faraz'){await db.update(announcements).set({status:'cancelled',lastError:'سرویس پیامک غیرفعال شد؛ ارسال انجام نشد.',updatedAt:Date.now()}).where(eq(announcements.id,campaign.id));return {processed:0};}
    const recipients=await db.select().from(announcementRecipients).where(eq(announcementRecipients.announcementId,campaign.id));
    const result=await farazAnnouncements(key).send(campaign.text,campaign.sender,recipients.map(row=>row.phone));
    await db.update(announcements).set({status:result.status,providerId:result.status==='accepted'?result.id:null,lastError:result.status==='accepted'?null:result.reason,updatedAt:Date.now()}).where(eq(announcements.id,campaign.id));
  } catch {await db.update(announcements).set({status:'unknown',lastError:'نتیجه ارسال نامشخص است؛ پنل را بررسی کنید.',updatedAt:Date.now()}).where(eq(announcements.id,campaign.id));}
  return {processed:1};
}
