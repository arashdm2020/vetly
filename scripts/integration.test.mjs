import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDatabase } from '../src/db/index.ts';
import { owners, pets, visits, vaccinations, reminders, settings } from '../src/db/schema.ts';
import { createPatient } from '../src/features/patients/service.ts';
import { createRecord, clinicSnapshot, scheduledTime } from '../src/features/clinic/service.ts';
import { saveClinicSettings, readClinicSettings, readSmsKey } from '../src/features/settings/service.ts';
import { defaultSettings, clinicSettingsSchema, renderTemplate } from '../src/features/settings/schema.ts';
import { smsProvider } from '../src/features/sms/providers.ts';
import { processDueReminders } from '../src/features/reminders/process.ts';
import { todayISO } from '../src/lib/clinic.ts';
import { encryptSecret, decryptSecret } from '../src/lib/secrets.ts';
import { authConfigured, localDevelopment } from '../src/lib/auth.ts';

const folder=mkdtempSync(join(tmpdir(),'vetly-test-'));
process.env.TURSO_DATABASE_URL='file:'+join(folder,'test.db').replaceAll('\\','/');
process.env.NODE_ENV='test';
// Test-only values are confined to the test process and temporary database.
process.env.SETTINGS_ENCRYPTION_KEY='a'.repeat(64);
let db;
before(async()=>{db=getDatabase();await migrate(db,{migrationsFolder:'./drizzle'});});
// Keep disposable fixtures for inspection; Windows may retain native SQLite handles until process exit.
after(()=>{db.$client.close();console.log('Test-only database retained at '+folder);});

test('registration normalizes and persists; libSQL batch rolls back owner on failed pet',async()=>{
  const patient=await createPatient({name:'آزمون',species:'cat',owner:'صاحب آزمایشی',phone:'+989120000000'});
  assert.equal(patient.phone,'09120000000');
  const snapshot=await clinicSnapshot();
  assert.equal(snapshot.patients.find(p=>p.id===patient.id)?.name,'آزمون');
  const ownerId=crypto.randomUUID();
  await assert.rejects(db.batch([
    db.insert(owners).values({id:ownerId,fullName:'rollback',phone:'09120000000'}),
    db.insert(pets).values({id:patient.id,ownerId,name:'duplicate',species:'cat'}),
  ]));
  assert.equal((await db.select().from(owners).where(eq(owners.id,ownerId))).length,0);
});
test('visit date is assigned by server and invalid relationships/dates fail',async()=>{
  const [pet]=await db.select().from(pets);
  const id=crypto.randomUUID();
  const record={id,petId:pet.id,kind:'visit',title:'معاینه عمومی',date:'2099-01-01',nextDate:'',notes:'',diagnosis:'',treatment:'',medications:'',completed:false};
  await createRecord(record);
  assert.equal((await db.select().from(visits).where(eq(visits.id,id)))[0].visitedAt,todayISO());
  await assert.rejects(createRecord({...record,id:crypto.randomUUID(),petId:crypto.randomUUID()}));
  await assert.rejects(createRecord({...record,id:crypto.randomUUID(),kind:'vaccine',date:todayISO(),nextDate:todayISO()}));
});
test('settings persist; API key is encrypted, not in snapshot; unsupported patterns rejected',async()=>{
  const config={...structuredClone(defaultSettings),clinicName:'کلینیک آزمون',smsProvider:'kavenegar'};
  await saveClinicSettings(config,'TEST-ONLY-API-KEY');
  assert.equal((await readClinicSettings()).clinicName,'کلینیک آزمون');
  assert.equal(await readSmsKey('kavenegar'),'TEST-ONLY-API-KEY');
  const rows=await db.select().from(settings);
  assert(!JSON.stringify(rows).includes('TEST-ONLY-API-KEY'));
  assert(!JSON.stringify(await clinicSnapshot()).includes('TEST-ONLY-API-KEY'));
  assert.equal(decryptSecret(encryptSecret('test')),'test');
  assert.throws(()=>decryptSecret('bad.bad.bad'));
  assert(!clinicSettingsSchema.safeParse({...config,vaccinePattern:{...config.vaccinePattern,text:'{unknown}'}}).success);
  assert(!clinicSettingsSchema.safeParse({...config,smsEnabled:true}).success);
});
test('SMS adapters serialize templates and distinguish acceptance, rejection and uncertainty without network',async()=>{
  let calls=0;
  const config=structuredClone(defaultSettings);
  const input={to:'09120000000',pattern:{...config.vaccinePattern,code:'sample'},values:{pet:'میلو',date:'1405',clinic:'test',phone:'test',action:'test'}};
  const kavenegar=smsProvider('kavenegar','test-key',async(url,options)=>{
    calls++;assert.equal(url,'https://api.kavenegar.com/v1/test-key/verify/lookup.json');assert.equal(options.body.get('token'),'میلو');
    assert.equal(options.redirect,'error');
    return Response.json({return:{status:200},entries:[{messageid:123}]});
  });
  assert.deepEqual(await kavenegar.send(input),{status:'accepted',messageId:'123'});
  const smsir=smsProvider('smsir','test-key',async(url,options)=>{
    calls++;assert.equal(url,'https://api.sms.ir/v1/send/verify');assert.equal(JSON.parse(options.body).templateId,123);
    return Response.json({status:1,data:{messageId:456}});
  });
  assert.equal((await smsir.send({...input,pattern:{...input.pattern,code:'123'}})).status,'accepted');
  assert.equal((await smsProvider('smsir','x',async()=>Response.json({status:0,data:null})).send(input)).status,'rejected');
  assert.equal((await smsProvider('smsir','x',async()=>{throw new Error('secret must never escape');}).send(input)).status,'unknown');
  assert.equal((await smsProvider('mock','').send(input)).status,'simulated');assert.equal(calls,2);
  assert.equal(renderTemplate('{pet} {date}',input.values),'میلو 1405');
});
test('concurrent workers claim one reminder once; uncertain send is never retried',async()=>{
  const config=structuredClone(defaultSettings);
  config.smsProvider='kavenegar';config.smsEnabled=true;config.vaccinePattern.code='vaccine';config.taskPattern.code='task';
  await saveClinicSettings(config,'test-key');
  const [pet]=await db.select().from(pets);
  const id=crypto.randomUUID();
  await db.insert(reminders).values({id,petId:pet.id,type:'task',title:'آزمون',scheduledAt:Date.now()-1000});
  let sends=0;const original=globalThis.fetch;
  globalThis.fetch=async()=>{sends++;return Response.json({return:{status:200},entries:[{messageid:10}]});};
  try {
    await Promise.all([processDueReminders(),processDueReminders()]);
    assert.equal(sends,1);
    assert.equal((await db.select().from(reminders).where(eq(reminders.id,id)))[0].status,'sent');
    await processDueReminders();assert.equal(sends,1);
    const unknownId=crypto.randomUUID();
    await db.insert(reminders).values({id:unknownId,petId:pet.id,type:'task',title:'آزمون',scheduledAt:Date.now()-1000});
    globalThis.fetch=async()=>{sends++;throw new Error('timeout');};
    await processDueReminders();await processDueReminders();assert.equal(sends,2);
    assert.equal((await db.select().from(reminders).where(eq(reminders.id,unknownId)))[0].status,'failed');
  } finally {globalThis.fetch=original;}
});
test('disabled sending creates no network traffic and future vaccines have scheduled offsets',async()=>{
  await saveClinicSettings({...defaultSettings,smsEnabled:false},'');
  const [pet]=await db.select().from(pets);
  const nextDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const id=crypto.randomUUID();
  await createRecord({id,petId:pet.id,kind:'vaccine',title:'واکسن آزمون',date:todayISO(),nextDate,notes:'',diagnosis:'',treatment:'',medications:'',completed:false});
  const scheduled=await db.select().from(reminders).where(eq(reminders.vaccinationId,id));
  assert.equal(scheduled.length,2);
  assert.deepEqual(scheduled.map(r=>r.scheduledAt).sort(),[scheduledTime(nextDate,1),scheduledTime(nextDate,7)].sort());
  assert(scheduled.every(r=>r.status==='cancelled'));
  assert.equal((await processDueReminders()).disabled,true);
  assert.equal((await db.select().from(vaccinations).where(eq(vaccinations.id,id)))[0].reminderEnabled,false);
  assert.equal(authConfigured(),false);assert.equal(localDevelopment(),false);
  assert.equal((await db.get(sql`select count(*) as count from __drizzle_migrations`)).count,1);
});
