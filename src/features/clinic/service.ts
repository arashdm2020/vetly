import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDatabase } from '@/db';
import { owners, pets, visits, vaccinations, reminders } from '@/db/schema';
import { todayISO, visitLabels, type Patient, type RecordEntry } from '@/lib/clinic';
import { readClinicSettings, hasSmsKey } from '@/features/settings/service';
import type { ClinicSettings } from '@/features/settings/schema';

export type ClinicSnapshot = { patients: Patient[]; records: RecordEntry[]; settings: ClinicSettings; keys: Record<string,boolean> };
export async function clinicSnapshot(): Promise<ClinicSnapshot> {
  const database = getDatabase();
  const [patients, visitRows, vaccineRows, taskRows, config] = await Promise.all([
    database.select({id:pets.id,name:pets.name,species:pets.species,owner:owners.fullName,phone:owners.phone})
      .from(pets).innerJoin(owners,eq(pets.ownerId,owners.id)).orderBy(desc(pets.createdAt)),
    database.select().from(visits).orderBy(desc(visits.visitedAt)),
    database.select().from(vaccinations).orderBy(desc(vaccinations.administeredAt)),
    database.select().from(reminders).where(eq(reminders.type,'task')),
    readClinicSettings(),
  ]);
  const empty = {notes:'',diagnosis:'',treatment:'',medications:'',nextDate:'',completed:false};
  return {patients, settings:config, keys:{kavenegar:await hasSmsKey('kavenegar'),smsir:await hasSmsKey('smsir')}, records:[
    ...visitRows.map(r => ({...empty,id:r.id,petId:r.petId,kind:'visit' as const,title:visitLabels[r.type],date:r.visitedAt,notes:r.complaint||r.notes||'',diagnosis:r.diagnosis||'',treatment:r.treatment||'',medications:r.medications||''})),
    ...vaccineRows.map(r => ({...empty,id:r.id,petId:r.petId,kind:'vaccine' as const,title:r.vaccineName,date:r.administeredAt,nextDate:r.nextDueAt||'',notes:r.notes||''})),
    ...taskRows.map(r => ({...empty,id:r.id,petId:r.petId,kind:'reminder' as const,title:r.title,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(r.scheduledAt),notes:r.notes||'',completed:r.completedAt!==null})),
  ]};
}
const recordSchema = z.object({
  id:z.uuid(),petId:z.uuid(),kind:z.enum(['visit','vaccine','reminder']),title:z.string().trim().min(1).max(120),
  date:z.iso.date(),nextDate:z.union([z.iso.date(),z.literal('')]),
  notes:z.string().max(2000),diagnosis:z.string().max(2000),treatment:z.string().max(2000),medications:z.string().max(2000),completed:z.boolean(),
}).strict();
export function scheduledTime(date: string, offset=0) { return Date.parse(date+'T09:00:00+03:30')-offset*86400000; }
export async function createRecord(input: unknown) {
  const data = recordSchema.parse(input);
  const database=getDatabase();
  const [pet]=await database.select({id:pets.id}).from(pets).where(eq(pets.id,data.petId)).limit(1);
  if(!pet) throw new Error('بیمار پیدا نشد.');
  const today=todayISO();
  if(data.kind==='visit') {
    const type=Object.entries(visitLabels).find(([,label])=>label===data.title)?.[0] as keyof typeof visitLabels|undefined;
    if(!type) throw new Error('نوع مراجعه معتبر نیست.');
    await database.insert(visits).values({id:data.id,petId:data.petId,type,visitedAt:today,complaint:data.notes,diagnosis:data.diagnosis,treatment:data.treatment,medications:data.medications});
  } else if(data.kind==='vaccine') {
    if(data.date>today||!data.nextDate||data.nextDate<=data.date) throw new Error('تاریخ واکسن یا موعد بعدی معتبر نیست.');
    const config=await readClinicSettings();
    await database.transaction(async tx=>{
      await tx.insert(vaccinations).values({id:data.id,petId:data.petId,vaccineName:data.title,administeredAt:data.date,nextDueAt:data.nextDate,notes:data.notes,reminderEnabled:config.smsEnabled});
      for(const offset of config.reminderOffsets) {
        const scheduledAt=scheduledTime(data.nextDate,offset);
        if(scheduledAt<Date.now()) continue;
        await tx.insert(reminders).values({petId:data.petId,vaccinationId:data.id,type:'vaccination',title:data.title,scheduledAt,status:config.smsEnabled?'pending':'cancelled'});
      }
    });
  } else {
    if(data.date<today) throw new Error('زمان یادآوری نمی‌تواند در گذشته باشد.');
    const config=await readClinicSettings();
    await database.insert(reminders).values({id:data.id,petId:data.petId,type:'task',title:data.title,notes:data.notes,scheduledAt:scheduledTime(data.date),status:config.smsEnabled?'pending':'cancelled'});
  }
}
export async function completeTask(id: string) {
  z.uuid().parse(id);
  const result=await getDatabase().update(reminders).set({completedAt:Date.now(),status:'cancelled',updatedAt:Date.now()})
    .where(and(eq(reminders.id,id),eq(reminders.type,'task'))).returning({id:reminders.id});
  if(!result.length) throw new Error('یادآوری پیدا نشد.');
}
