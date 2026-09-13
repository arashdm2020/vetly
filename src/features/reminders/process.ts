import 'server-only';
import { and, eq, isNull, lte, asc, sql } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { reminders, smsDeliveries, pets, owners, vaccinations } from '@/db/schema';
import { readClinicSettings, readSmsKey } from '@/features/settings/service';
import { smsProvider } from '@/features/sms/providers';
import { formatDate } from '@/lib/clinic';

// One worker batch, bounded for serverless execution. Provider acceptance is not handset delivery.
export async function processDueReminders() {
  const config=await readClinicSettings();
  if(!config.smsEnabled||config.smsProvider==='mock')return {processed:0,accepted:0,failed:0,disabled:true};
  const provider=smsProvider(config.smsProvider,await readSmsKey(config.smsProvider));
  const database=getDatabase();
  const due=await database.select().from(reminders).where(and(eq(reminders.status,'pending'),isNull(reminders.completedAt),lte(reminders.scheduledAt,Date.now()))).orderBy(asc(reminders.scheduledAt)).limit(5);
  const counts={processed:0,accepted:0,failed:0,disabled:false};
  for(const reminder of due) {
    // Respect a setting change before each irreversible send.
    const current=await readClinicSettings();
    if(!current.smsEnabled||current.smsProvider!==config.smsProvider)break;
    const [claimed]=await database.update(reminders).set({status:'processing',attempts:sql`${reminders.attempts}+1`,updatedAt:Date.now()})
      .where(and(eq(reminders.id,reminder.id),eq(reminders.status,'pending'),isNull(reminders.completedAt))).returning({id:reminders.id});
    if(!claimed)continue;
    counts.processed++;
    try {
      const [patient]=await database.select({name:pets.name,phone:owners.phone}).from(pets).innerJoin(owners,eq(pets.ownerId,owners.id)).where(eq(pets.id,reminder.petId)).limit(1);
      if(!patient)throw new Error('Missing patient');
      let dueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(reminder.scheduledAt);
      if(reminder.vaccinationId) {
        const [vaccine]=await database.select().from(vaccinations).where(and(eq(vaccinations.id,reminder.vaccinationId),eq(vaccinations.petId,reminder.petId))).limit(1);
        if(!vaccine?.reminderEnabled||!vaccine.nextDueAt){await database.update(reminders).set({status:'cancelled',updatedAt:Date.now()}).where(eq(reminders.id,reminder.id));continue;}
        dueDate=vaccine.nextDueAt;
      }
      const deliveryId=crypto.randomUUID();
      await database.insert(smsDeliveries).values({id:deliveryId,reminderId:reminder.id,idempotencyKey:reminder.id,provider:config.smsProvider});
      const result=await provider.send({to:patient.phone,pattern:reminder.type==='vaccination'?config.vaccinePattern:config.taskPattern,
        values:{pet:patient.name,date:formatDate(dueDate),clinic:config.clinicName,phone:config.clinicPhone,action:reminder.title}});
      const accepted=result.status==='accepted';
      const lastError=accepted?null:result.reason;
      await database.batch([
        database.update(smsDeliveries).set({status:accepted?'sent':result.status==='rejected'?'failed':result.status==='simulated'?'simulated':'unknown',providerMessageId:accepted?result.messageId:null,sentAt:accepted?Date.now():null,lastError,updatedAt:Date.now()}).where(eq(smsDeliveries.id,deliveryId)),
        database.update(reminders).set({status:accepted?'sent':'failed',sentAt:accepted?Date.now():null,lastError,updatedAt:Date.now()}).where(and(eq(reminders.id,reminder.id),eq(reminders.status,'processing'))),
      ]);
      if(accepted)counts.accepted++;else counts.failed++;
    } catch {
      // Do not requeue: the provider might have accepted before a database/network failure.
      await database.update(reminders).set({status:'failed',lastError:'وضعیت نیازمند بررسی در پنل پیامکی است.',updatedAt:Date.now()}).where(and(eq(reminders.id,reminder.id),eq(reminders.status,'processing')));
      counts.failed++;
    }
  }
  return counts;
}
