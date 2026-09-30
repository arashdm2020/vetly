import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
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
import { sendRegistrationSms } from '../src/features/sms/registration.ts';
import { smsDeliveries } from '../src/db/schema.ts';
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
test('custom animal types persist and removing an option preserves patient history',async()=>{
  const config=await readClinicSettings();
  await saveClinicSettings({...config,customSpecies:['گاو','گوسفند','جوجه']},'');
  const patient=await createPatient({name:'آزمون نوع',species:'other',customSpecies:'گوسفند',owner:'صاحب آزمایشی',phone:'09120000000'});
  assert.equal((await clinicSnapshot()).patients.find(p=>p.id===patient.id).customSpecies,'گوسفند');
  await assert.rejects(createPatient({name:'آزمون',species:'other',customSpecies:'نام ثبت نشده',owner:'صاحب آزمایشی',phone:'09120000000'}));
  await saveClinicSettings({...config,customSpecies:[]},'');
  assert.equal((await clinicSnapshot()).patients.find(p=>p.id===patient.id).customSpecies,'گوسفند');
  assert(!clinicSettingsSchema.safeParse({...config,customSpecies:['گاو','گاو']}).success);
  assert(!clinicSettingsSchema.safeParse({...config,customSpecies:['پرنده']}).success);
  const legacy={...config};
  delete legacy.customSpecies;
  assert.deepEqual(clinicSettingsSchema.parse(legacy).customSpecies,[]);
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
test('Faraz adapter follows official pattern request and handles ambiguous responses safely',async()=>{
  const config=structuredClone(defaultSettings);
  config.smsProvider='faraz';config.smsEnabled=true;config.vaccinePattern.code='vaccine';config.taskPattern.code='task';
  assert.equal(clinicSettingsSchema.safeParse(config).success,false);
  config.farazSender='3000505';
  await saveClinicSettings(config,'FAKE-FARAZ-KEY');
  assert.equal(await readSmsKey('faraz'),'FAKE-FARAZ-KEY');
  assert.equal((await clinicSnapshot()).keys.faraz,true);
  assert(!JSON.stringify(await clinicSnapshot()).includes('FAKE-FARAZ-KEY'));
  const input={to:'09120000000',sender:config.farazSender,pattern:{...config.registrationPattern,code:'approved-pattern'},values:{clinic:'کلینیک',pet:'میلو',phone:'02100000000',date:'۱۴۰۵/۰۷/۰۸',action:'پیگیری'}};
  let calls=0;
  const provider=smsProvider('faraz','FAKE-FARAZ-KEY',async(url,options)=>{
    calls++;assert.equal(url,'https://api.iranpayamak.com/ws/v1/sms/pattern');
    assert.equal(options.headers['Api-Key'],'FAKE-FARAZ-KEY');
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{code:'approved-pattern',recipient:input.to,line_number:'3000505',number_format:'persian',attributes:{CLINIC:'کلینیک',PET:'میلو',PHONE:'02100000000'}});
    return Response.json({status:'success',data:456,messages:null},{status:201});
  });
  assert.deepEqual(await provider.send(input),{status:'accepted',messageId:'456'});
  assert.equal((await provider.send({...input,sender:''})).status,'rejected');assert.equal(calls,1);
  for(const [response,expected] of [[{status:'error',data:null},'rejected'],[{status:'success',data:null},'unknown'],[{unexpected:true},'unknown']]) {
    assert.equal((await smsProvider('faraz','fake',async()=>Response.json(response)).send(input)).status,expected);
  }
  assert.equal((await smsProvider('faraz','fake',async()=>Response.json({}, {status:500})).send(input)).status,'unknown');
  assert.equal((await smsProvider('faraz','fake',async()=>{throw new Error('private');}).send(input)).status,'unknown');
  await saveClinicSettings(defaultSettings,'');
});

test('registration SMS sends once after persistence; errors never roll back a patient',async()=>{
  const config=structuredClone(defaultSettings);
  config.smsEnabled=true;config.smsProvider='smsir';
  config.vaccinePattern.code='123';config.taskPattern.code='124';config.registrationPattern.code='125';
  await saveClinicSettings(config,'test-key');
  let sends=0;const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    sends++;
    const body=JSON.parse(options.body);
    assert.equal(body.templateId,125);
    assert.deepEqual(body.parameters.map(p=>p.name),['CLINIC','PET','PHONE']);
    assert((await db.select().from(pets)).some(p=>p.name==='پیامک ثبت'));
    return Response.json({status:1,data:{messageId:123}});
  };
  try {
    const patient=await createPatient({name:'پیامک ثبت',species:'cat',owner:'مالک آزمون',phone:'09120000000'});
    await Promise.all([sendRegistrationSms(patient),sendRegistrationSms(patient)]);
    assert.equal(sends,1);
    assert.equal((await db.select().from(smsDeliveries).where(eq(smsDeliveries.petId,patient.id)))[0].status,'sent');
    globalThis.fetch=async()=>{sends++;throw new Error('timeout');};
    const failed=await createPatient({name:'ثبت با خطای پیامک',species:'bird',owner:'مالک آزمون',phone:'09120000000'});
    assert.equal((await db.select().from(pets).where(eq(pets.id,failed.id))).length,1);
    await sendRegistrationSms(failed);
    assert.equal(sends,2);
    assert.equal((await db.select().from(smsDeliveries).where(eq(smsDeliveries.petId,failed.id)))[0].status,'unknown');
  } finally {globalThis.fetch=original;await saveClinicSettings(defaultSettings,'');}
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
  const journal=JSON.parse(readFileSync('./drizzle/meta/_journal.json','utf8'));
  assert.equal((await db.get(sql`select count(*) as count from __drizzle_migrations`)).count,journal.entries.length);
});

test('additive migrations preserve existing patients and medical references',async()=>{
  const client=createClient({url:'file:'+join(folder,'upgrade.db').replaceAll('\\','/')});
  try {
    const statements=file=>readFileSync(file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
    await client.batch(statements('./drizzle/0000_certain_ben_urich.sql'),'write');
    await client.execute('PRAGMA foreign_keys=ON');
    await client.batch([
      "INSERT INTO owners(id,full_name,phone,created_at,updated_at) VALUES('owner','Test','09120000000',1,1)",
      "INSERT INTO pets(id,owner_id,name,species,notes,created_at,updated_at) VALUES('pet','owner','Test','bird','Keep',1,1)",
      "INSERT INTO visits(id,pet_id,visited_at,type,created_at,updated_at) VALUES('visit','pet','2026-09-01','examination',1,1)",
    ],'write');
    await client.batch([...statements('./drizzle/0001_tranquil_golden_guardian.sql'),...statements('./drizzle/0002_fluffy_jack_murdock.sql')],'write');
    const patient=(await client.execute("SELECT * FROM pets WHERE id='pet'")).rows[0];
    assert.equal(patient.notes,'Keep');
    assert.equal(patient.custom_species,null);
    assert.equal((await client.execute('SELECT pet_id FROM visits')).rows[0].pet_id,'pet');
    assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length,0);
    await assert.rejects(client.execute("UPDATE pets SET weight_grams=-1 WHERE id='pet'"));
  } finally { client.close(); }
});
