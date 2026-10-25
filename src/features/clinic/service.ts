import 'server-only';
import { and, desc, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import { getDatabase } from '@/db';
import { owners, pets, visits, vaccinations, reminders, smsDeliveries } from '@/db/schema';
import { todayISO, visitLabels, type Patient, type RecordEntry } from '@/lib/clinic';
import { readClinicSettings, hasSmsKey } from '@/features/settings/service';
import { sendRecordCreatedSms } from '@/features/sms/record-created';
import { resolveDueAt, secondNotificationAt, eventDate, clinicClock } from '@/features/reminders/schedule';
import type { ClinicSettings } from '@/features/settings/schema';

export type ClinicSnapshot = { patients: Patient[]; records: RecordEntry[]; settings: ClinicSettings; keys: Record<string,boolean> };
export async function clinicSnapshot(): Promise<ClinicSnapshot> {
  const database = getDatabase();
  const [patients, visitRows, vaccineRows, taskRows, config] = await Promise.all([
    database.select({id:pets.id,name:pets.name,species:pets.species,customSpecies:pets.customSpecies,owner:owners.fullName,phone:owners.phone})
      .from(pets).innerJoin(owners,eq(pets.ownerId,owners.id)).orderBy(desc(pets.createdAt)),
    database.select().from(visits).orderBy(desc(visits.visitedAt)),
    database.select().from(vaccinations).orderBy(desc(vaccinations.administeredAt)),
    database.select().from(reminders).where(eq(reminders.type,'task')),
    readClinicSettings(),
  ]);
  const futureRows=await database.select().from(reminders);
  const deliveries=await database.select({key:smsDeliveries.idempotencyKey,status:smsDeliveries.status}).from(smsDeliveries).where(like(smsDeliveries.idempotencyKey,'record:%'));
  const visitsById=new Map(futureRows.filter(row=>row.visitId).map(row=>[row.visitId!,row]));
  const vaccinesById=new Map(futureRows.filter(row=>row.vaccinationId&&row.dueAt!==null).map(row=>[row.vaccinationId!,row]));
  const initialStatuses=new Map(deliveries.map(row=>[row.key,row.status]));
  const reminderInfo=(row:typeof futureRows[number]|undefined)=>row?{dueTime:clinicClock(row.dueAt??row.scheduledAt).slice(0,5),reminderStatus:row.status,notificationAt:row.scheduledAt,followupReminderId:row.id,completed:row.completedAt!==null}:{};
  const empty = {notes:'',diagnosis:'',treatment:'',medications:'',nextDate:'',completed:false};
  const registrationDeliveries=await database.select({petId:smsDeliveries.petId,status:smsDeliveries.status}).from(smsDeliveries).where(like(smsDeliveries.idempotencyKey,'registration:%'));
  const registrationStatus=new Map(registrationDeliveries.map(item=>[item.petId,item.status]));
  return {patients:patients.map(patient=>({...patient,registrationSmsStatus:registrationStatus.get(patient.id)})), settings:config, keys:{faraz:await hasSmsKey('faraz'),kavenegar:await hasSmsKey('kavenegar'),smsir:await hasSmsKey('smsir')}, records:[
    ...visitRows.map(r => ({...empty,id:r.id,petId:r.petId,kind:'visit' as const,title:visitLabels[r.type],date:r.visitedAt,...reminderInfo(visitsById.get(r.id)),nextDate:visitsById.get(r.id)?.dueAt?eventDate(visitsById.get(r.id)!.dueAt!):'',notificationStatus:initialStatuses.get(`record:visit:${r.id}:created`),notes:r.complaint||r.notes||'',diagnosis:r.diagnosis||'',treatment:r.treatment||'',medications:r.medications||''})),
    ...vaccineRows.map(r => ({...empty,id:r.id,petId:r.petId,kind:'vaccine' as const,title:r.vaccineName,date:r.administeredAt,nextDate:r.nextDueAt||'',...reminderInfo(vaccinesById.get(r.id)),notificationStatus:initialStatuses.get(`record:vaccine:${r.id}:created`),notes:r.notes||''})),
    ...taskRows.filter(r=>!r.visitId).map(r => ({...empty,id:r.id,petId:r.petId,kind:'reminder' as const,title:r.title,date:eventDate(r.dueAt??r.scheduledAt),...reminderInfo(r),notificationStatus:initialStatuses.get(`record:reminder:${r.id}:created`),notes:r.notes||'',completed:r.completedAt!==null})),
  ]};
}
const recordSchema = z.object({
  id:z.uuid(),petId:z.uuid(),kind:z.enum(['visit','vaccine','reminder']),title:z.string().trim().min(1).max(120),
  date:z.iso.date(),nextDate:z.union([z.iso.date(),z.literal('')]),
  notes:z.string().max(2000),diagnosis:z.string().max(2000),treatment:z.string().max(2000),medications:z.string().max(2000),completed:z.boolean(),
  dueTime:z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),z.literal('')]).default(''),
}).strict();
export function scheduledTime(date: string, offset=0) { return Date.parse(date+'T09:00:00+03:30')-offset*86400000; }
export async function createRecord(input: unknown) {
  const data = recordSchema.parse(input);
  const database=getDatabase();
  const [pet]=await database.select({id:pets.id}).from(pets).where(eq(pets.id,data.petId)).limit(1);
  if(!pet) throw new Error('بیمار پیدا نشد.');
  const today=todayISO();
  const now=Date.now();
  const config=await readClinicSettings();
  let dueAt=now;
  let reminderId:string|undefined;
  if(data.kind==='visit') {
    const type=Object.entries(visitLabels).find(([,label])=>label===data.title)?.[0] as keyof typeof visitLabels|undefined;
    if(!type)throw new Error('نوع مراجعه معتبر نیست.');
    if(data.nextDate) {
      dueAt=resolveDueAt(data.nextDate,data.dueTime,now);
      secondNotificationAt(dueAt,now);reminderId=crypto.randomUUID();
    }
    await database.transaction(async tx=>{
      await tx.insert(visits).values({id:data.id,petId:data.petId,type,visitedAt:today,complaint:data.notes,diagnosis:data.diagnosis,treatment:data.treatment,medications:data.medications});
      if(reminderId)await tx.insert(reminders).values({id:reminderId,petId:data.petId,visitId:data.id,type:'task',title:data.title,dueAt,
        scheduledAt:secondNotificationAt(dueAt,now),status:config.smsEnabled?'pending':'cancelled',createdAt:now,updatedAt:now});
    });
  } else if(data.kind==='vaccine') {
    if(data.date>today||!data.nextDate||data.nextDate<=data.date)throw new Error('تاریخ واکسن یا موعد بعدی معتبر نیست.');
    dueAt=resolveDueAt(data.nextDate,data.dueTime,now);
    const scheduledAt=secondNotificationAt(dueAt,now);reminderId=crypto.randomUUID();
    await database.transaction(async tx=>{
      await tx.insert(vaccinations).values({id:data.id,petId:data.petId,vaccineName:data.title,administeredAt:data.date,nextDueAt:data.nextDate,notes:data.notes,reminderEnabled:config.smsEnabled});
      await tx.insert(reminders).values({id:reminderId,petId:data.petId,vaccinationId:data.id,type:'vaccination',title:data.title,dueAt,scheduledAt,
        status:config.smsEnabled?'pending':'cancelled',createdAt:now,updatedAt:now});
    });
  } else {
    dueAt=resolveDueAt(data.date,data.dueTime,now);
    const scheduledAt=secondNotificationAt(dueAt,now);reminderId=data.id;
    await database.insert(reminders).values({id:data.id,petId:data.petId,type:'task',title:data.title,notes:data.notes,dueAt,scheduledAt,
      status:config.smsEnabled?'pending':'cancelled',createdAt:now,updatedAt:now});
  }
  await sendRecordCreatedSms({id:data.id,petId:data.petId,kind:data.kind,title:data.title,dueAt,reminderId});
}

export async function completeTask(id: string) {
  z.uuid().parse(id);
  const result=await getDatabase().update(reminders).set({completedAt:Date.now(),status:'cancelled',updatedAt:Date.now()})
    .where(and(eq(reminders.id,id),eq(reminders.type,'task'))).returning({id:reminders.id});
  if(!result.length) throw new Error('یادآوری پیدا نشد.');
}
