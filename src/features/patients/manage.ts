import 'server-only';
import { and, eq, inArray, or, gte } from 'drizzle-orm';
import { z } from 'zod';
import { getDatabase } from '@/db';
import { owners, pets, visits, vaccinations, reminders, appointments, smsDeliveries } from '@/db/schema';
import { createPatientSchema } from './schema';
import { readClinicSettings } from '@/features/settings/service';

const details=createPatientSchema.omit({phone:true});
const editSchema=z.object({id:z.uuid(),expected:details,patient:details}).strict();
export async function updatePatient(raw:unknown) {
  const input=editSchema.parse(raw),config=await readClinicSettings();
  return getDatabase().transaction(async tx=>{
    const [current]=await tx.select({name:pets.name,species:pets.species,customSpecies:pets.customSpecies,owner:owners.fullName,ownerId:owners.id}).from(pets).innerJoin(owners,eq(pets.ownerId,owners.id)).where(eq(pets.id,input.id));
    if(!current)throw new Error('بیمار پیدا نشد.');
    if(current.name!==input.expected.name||current.species!==input.expected.species||(current.customSpecies||'')!==(input.expected.customSpecies||'')||current.owner!==input.expected.owner)
      throw new Error('اطلاعات بیمار تغییر کرده است؛ صفحه را تازه کنید.');
    const patient=input.patient;
    if(patient.customSpecies&&(patient.species!=='other'||(!config.customSpecies.includes(patient.customSpecies)&&patient.customSpecies!==current.customSpecies)))throw new Error('نوع حیوان را از فهرست تنظیمات انتخاب کنید.');
    await tx.update(pets).set({name:patient.name,species:patient.species,customSpecies:patient.customSpecies||null,updatedAt:Date.now()}).where(eq(pets.id,input.id));
    await tx.update(owners).set({fullName:patient.owner,updatedAt:Date.now()}).where(eq(owners.id,current.ownerId));
  });
}

// Explicit clinic action only. Keep SMS audit rows, detach deleted clinical links.
export async function deletePatient(raw:unknown) {
  const id=z.uuid().parse(raw);
  return getDatabase().transaction(async tx=>{
    const [patient]=await tx.select().from(pets).where(eq(pets.id,id));
    if(!patient)throw new Error('بیمار پیدا نشد.');
    const queue=await tx.select().from(reminders).where(eq(reminders.petId,id));
    const reminderIds=queue.map(row=>row.id);
    const linked=reminderIds.length?or(eq(smsDeliveries.petId,id),inArray(smsDeliveries.reminderId,reminderIds)):eq(smsDeliveries.petId,id);
    const active=await tx.select({id:smsDeliveries.id}).from(smsDeliveries).where(and(linked,or(eq(smsDeliveries.status,'pending'),and(eq(smsDeliveries.status,'unknown'),gte(smsDeliveries.updatedAt,Date.now()-60000))))).limit(1);
    if(queue.some(row=>row.status==='processing')||active.length)throw new Error('ارسال پیامک این بیمار در حال بررسی است؛ کمی بعد دوباره حذف کنید.');
    await tx.update(smsDeliveries).set({petId:null,reminderId:null}).where(linked);
    await tx.delete(reminders).where(eq(reminders.petId,id));
    await tx.delete(appointments).where(eq(appointments.petId,id));
    await tx.delete(vaccinations).where(eq(vaccinations.petId,id));
    await tx.delete(visits).where(eq(visits.petId,id));
    await tx.delete(pets).where(eq(pets.id,id));
    const [other]=await tx.select({id:pets.id}).from(pets).where(eq(pets.ownerId,patient.ownerId)).limit(1);
    if(!other)await tx.delete(owners).where(eq(owners.id,patient.ownerId));
  });
}
