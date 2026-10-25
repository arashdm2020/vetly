import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDatabase } from '../src/db/index.ts';
import { owners, pets, visits, vaccinations, reminders, appointments, settings } from '../src/db/schema.ts';
import { createPatient } from '../src/features/patients/service.ts';
import { createRecord, clinicSnapshot } from '../src/features/clinic/service.ts';
import { saveClinicSettings, readClinicSettings, readSmsKey } from '../src/features/settings/service.ts';
import { defaultSettings, clinicSettingsSchema, renderTemplate } from '../src/features/settings/schema.ts';
import { smsProvider } from '../src/features/sms/providers.ts';
import { sendRegistrationSms } from '../src/features/sms/registration.ts';
import { smsDeliveries } from '../src/db/schema.ts';
import { processDueReminders } from '../src/features/reminders/process.ts';
import { resolveDueAt, secondNotificationAt, eventDate, clinicClock } from '../src/features/reminders/schedule.ts';
import { sendRecordCreatedSms } from '../src/features/sms/record-created.ts';
import { todayISO } from '../src/lib/clinic.ts';
import { encryptSecret, decryptSecret } from '../src/lib/secrets.ts';
import { authConfigured, localDevelopment } from '../src/lib/auth.ts';

const folder=mkdtempSync(join(tmpdir(),'vetly-test-'));
process.env.TURSO_DATABASE_URL='file:'+join(folder,'test.db').replaceAll('\\','/');
process.env.NODE_ENV='test';
// Test-only values are confined to the test process and temporary database.
process.env.SETTINGS_ENCRYPTION_KEY='a'.repeat(64);
// Fail closed: no automated test may reach an SMS provider. Individual tests inject mocks.
globalThis.fetch=async()=>{throw new Error('Real network disabled in integration tests');};
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
  assert.equal(clinicSettingsSchema.safeParse(config).success,true);
  await saveClinicSettings(config,'FAKE-FARAZ-KEY');
  assert.equal((await readClinicSettings()).farazSender,'');
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
  let omitted=0;
  const noSender=smsProvider('faraz','fake',async(url,options)=>{omitted++;assert.equal(JSON.parse(options.body).line_number,'90008361');return Response.json({status:'error',messages:{line_number:['required']}},{status:422});});
  const rejected=await noSender.send({...input,sender:''});assert.equal(rejected.status,'rejected');assert.match(rejected.reason,/فرستنده/);assert.equal(omitted,1);assert.equal(calls,1);
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
test('disabled sending creates no network traffic and a single cancelled future notification',async()=>{
  await saveClinicSettings({...defaultSettings,smsEnabled:false},'');
  const [pet]=await db.select().from(pets);
  const nextDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const id=crypto.randomUUID();
  await createRecord({id,petId:pet.id,kind:'vaccine',title:'واکسن آزمون',date:todayISO(),nextDate,notes:'',diagnosis:'',treatment:'',medications:'',completed:false});
  const scheduled=await db.select().from(reminders).where(eq(reminders.vaccinationId,id));
  assert.equal(scheduled.length,1);
  assert.equal(scheduled[0].scheduledAt,scheduled[0].dueAt-86400000);
  assert.equal(eventDate(scheduled[0].dueAt),nextDate);
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
    await client.execute("INSERT INTO reminders(id,pet_id,type,title,scheduled_at,status,created_at,updated_at) VALUES('legacy-reminder','pet','task','Keep',1,'pending',1,1)");
    await client.batch(statements('./drizzle/0003_white_gauntlet.sql'),'write');
    await client.batch(statements('./drizzle/0004_foamy_kingpin.sql'),'write');
    const legacy=(await client.execute("SELECT * FROM reminders WHERE id='legacy-reminder'")).rows[0];
    assert.equal(legacy.status,'pending');assert.equal(legacy.scheduled_at,1);assert.equal(legacy.due_at,null);assert.equal(legacy.visit_id,null);
    assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length,0);
    await assert.rejects(client.execute("UPDATE pets SET weight_grams=-1 WHERE id='pet'"));
  } finally { client.close(); }
});


test('live test endpoint rejects unauthenticated callers before sending',async()=>{
  const {POST}=await import('../src/app/api/settings/sms-test/route.ts');
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
  try {const response=await POST(new Request('https://vetly.example/api/settings/sms-test',{method:'POST'}));assert.equal(response.status,401);assert.equal(calls,0);}
  finally {globalThis.fetch=original;}
});
test('test sends validate, claim once, rate limit and never retry uncertainty or touch clinical data',async()=>{
  const {sendTestSms}=await import('../src/features/sms/test-send.ts');
  const config=structuredClone(defaultSettings);config.smsProvider='faraz';config.smsEnabled=true;config.vaccinePattern.code='approved';config.taskPattern.code='approved-task';
  await saveClinicSettings(config,'TEST-ONLY-FARAZ');
  const input={requestId:crypto.randomUUID(),recipient:'09120000000',pattern:'vaccinePattern',values:{pet:'test',date:'1405',clinic:'test',phone:'02100000000',action:'test'}};
  const original=globalThis.fetch;let calls=0;
  const counts=async()=>Promise.all([pets,reminders,appointments].map(table=>db.select({count:sql`count(*)`}).from(table)));
  const before=await counts();
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).line_number,'90008361');throw new DOMException('timeout','TimeoutError');};
  try {
    await assert.rejects(sendTestSms({...input,recipient:'bad'}));
    await assert.rejects(sendTestSms({...input,values:{...input.values,pet:''}}));
    const results=await Promise.all([sendTestSms(input),sendTestSms({...input,requestId:crypto.randomUUID()})]);
    assert.equal(calls,1);assert(results.some(r=>r.status==='unknown'));assert(results.some(r=>r.status==='rejected'));
    await db.update(settings).set({updatedAt:0}).where(eq(settings.key,'sms-test:cooldown'));
    assert.equal((await sendTestSms(input)).status,'unknown');assert.equal(calls,1);
    await db.update(settings).set({updatedAt:0}).where(eq(settings.key,'sms-test:cooldown'));
    globalThis.fetch=async()=>{calls++;return Response.json({status:'success',data:998},{status:201});};
    assert.deepEqual(await sendTestSms({...input,requestId:crypto.randomUUID()}),{status:'accepted',messageId:'998'});
    assert.deepEqual(await counts(),before);
  } finally {globalThis.fetch=original;await saveClinicSettings(defaultSettings,'');}
});


test('Faraz validation errors do not require the success envelope and never expose raw secrets',async()=>{
  const input={to:'09120000000',sender:'',pattern:{...defaultSettings.vaccinePattern,code:'approved'},values:{pet:'test',date:'test',clinic:'test',phone:'test',action:'test'}};
  for(const payload of [
    {status:'error',data:{line_number:['required']},message:null},
    {message:'private-api-key',errors:{line_number:['private-api-key']}},
    {status:false,data:null,errors:{line_number:['required']}},
  ]) {
    let calls=0;
    const result=await smsProvider('faraz','private-api-key',async()=>{calls++;return Response.json(payload,{status:422});}).send(input);
    assert.equal(result.status,'rejected');assert.match(result.reason,/HTTP 422/);assert.match(result.reason,/فرستنده/);
    assert(!result.reason.includes('private-api-key'));assert.equal(calls,1);
  }
  const result=await smsProvider('faraz','key',async()=>Response.json({status:'success',data:{id:123}})).send(input);
  assert.equal(result.status,'unknown');assert.match(result.reason,/HTTP 200/);assert.match(result.reason,/data: object/);
});

test('Faraz shared line is explicit for blank/absent sender and dedicated sender still wins',async()=>{
  const input={to:'09120000000',pattern:{...defaultSettings.vaccinePattern,code:'approved'},values:{pet:'test',date:'test',clinic:'test',phone:'test',action:'test'}};
  for(const [sender,expected] of [[undefined,'90008361'],['','90008361'],['  ','90008361'],['3000505','3000505']]) {
    let calls=0;
    const result=await smsProvider('faraz','test-key',async(url,options)=>{
      calls++;assert.equal(JSON.parse(options.body).line_number,expected);
      return Response.json({status:'success',data:123},{status:201});
    }).send({...input,sender});
    assert.deepEqual(result,{status:'accepted',messageId:'123'});assert.equal(calls,1);
  }
});


test('two-stage timing boundaries: >24h, exactly24h, >3h, exactly3h and imminent',()=>{
  const now=Date.parse('2026-10-25T14:00:00+03:30'),hour=3600000;
  for(const [remaining,lead] of [[72,24],[24.001,24],[24,3],[12,3],[3.001,3],[3,0],[1,0]])
    assert.equal(secondNotificationAt(now+remaining*hour,now),now+(remaining-lead)*hour);
  assert.throws(()=>secondNotificationAt(now,now));
  assert.throws(()=>secondNotificationAt(now-hour,now));
  const tomorrow=resolveDueAt('2026-10-26','',now);
  assert.equal(clinicClock(tomorrow),'14:00:00');
  assert.equal(secondNotificationAt(tomorrow,now),Date.parse('2026-10-26T11:00:00+03:30'));
  assert.equal(clinicClock(resolveDueAt('2026-10-26','16:45',now)),'16:45:00');
  assert.equal(clinicClock(Date.parse('2026-10-25T23:50:00+03:30')),'23:50:00');
});

test('each new record sends once on creation, then one independent claimed scheduled send',async()=>{
  const [pet]=await db.select().from(pets);
  const config=structuredClone(defaultSettings);config.smsEnabled=true;config.smsProvider='faraz';
  config.vaccinePattern.code='approved-vaccine';config.taskPattern.code='approved-task';
  config.vaccinePattern.parameters=['clinic','pet','date','phone'].map(name=>({name,variable:name}));
  config.taskPattern.parameters=['clinic','action','pet','date','phone'].map(name=>({name,variable:name}));
  await saveClinicSettings(config,'FAKE-ONLY');
  const original=globalThis.fetch;let sends=0;const sent=[];
  globalThis.fetch=async(url,options)=>{sends++;sent.push(JSON.parse(options.body));return Response.json({status:'success',data:100+sends},{status:201});};
  const ids=[];
  try {
    // Existing unrelated legacy pending rows must not participate in this scenario.
    await db.update(reminders).set({status:'cancelled'}).where(eq(reminders.status,'pending'));
    const date=eventDate(Date.now()+3*86400000);
    for(const kind of ['vaccine','reminder','visit']) {
      const id=crypto.randomUUID();ids.push(id);
      const record={id,petId:pet.id,kind,title:kind==='visit'?'ویزیت مجدد':'آزمون برنامه',date:kind==='reminder'?date:todayISO(),nextDate:kind==='reminder'?'':date,dueTime:'14:30',notes:'',diagnosis:'',treatment:'',medications:'',completed:false};
      await createRecord(record);
      const [delivery]=await db.select().from(smsDeliveries).where(eq(smsDeliveries.idempotencyKey,`record:${kind}:${id}:created`));
      assert.equal(delivery.status,'sent');
      const [scheduled]=await db.select().from(reminders).where(eq(reminders.id,delivery.reminderId));
      assert.equal(scheduled.scheduledAt,scheduled.dueAt-86400000);
      assert.equal(scheduled.status,'pending');
      await sendRecordCreatedSms({id,petId:pet.id,kind,title:record.title,dueAt:scheduled.dueAt,reminderId:scheduled.id});
      assert.equal(sends,ids.length); // replay cannot resend registration stage
      await assert.rejects(createRecord(record));assert.equal(sends,ids.length);
      await db.update(reminders).set({scheduledAt:Date.now()-1000}).where(eq(reminders.id,scheduled.id));
    }
    assert.equal(sends,3);assert.equal(sent[0].code,'approved-vaccine');
    assert.equal(sent[1].code,'approved-task');assert.match(sent[1].attributes.date,/۱۴:۳۰/);
    await Promise.all([processDueReminders(),processDueReminders()]);
    assert.equal(sends,6);await processDueReminders();assert.equal(sends,6);
    const snapshot=await clinicSnapshot();
    const task=snapshot.records.find(row=>row.id===ids[1]);assert.equal(task.date,date);assert.equal(task.dueTime,'14:30');
    assert.equal(task.notificationStatus,'sent');assert.equal(task.reminderStatus,'sent');
    assert(snapshot.records.find(row=>row.id===ids[2]).nextDate===date);
    assert.equal(snapshot.records.filter(row=>row.kind==='reminder'&&row.followupReminderId===snapshot.records.find(row=>row.id===ids[2]).followupReminderId).length,0);
  } finally {globalThis.fetch=original;await saveClinicSettings(defaultSettings,'');}
});

test('initial SMS timeout does not roll back the record or retry; completed tasks suppress second send',async()=>{
  const [pet]=await db.select().from(pets);
  const config=structuredClone(defaultSettings);config.smsEnabled=true;config.smsProvider='faraz';config.vaccinePattern.code='vaccine';config.taskPattern.code='task';
  await saveClinicSettings(config,'FAKE-ONLY');
  const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;throw new DOMException('timeout','TimeoutError');};
  try {
    const id=crypto.randomUUID(),date=eventDate(Date.now()+2*86400000);
    await createRecord({id,petId:pet.id,kind:'reminder',title:'test',date,nextDate:'',dueTime:'15:00',notes:'',diagnosis:'',treatment:'',medications:'',completed:false});
    assert.equal(sends,1);
    const [row]=await db.select().from(reminders).where(eq(reminders.id,id));assert(row);
    const [delivery]=await db.select().from(smsDeliveries).where(eq(smsDeliveries.idempotencyKey,`record:reminder:${id}:created`));
    assert.equal(delivery.status,'unknown');
    await sendRecordCreatedSms({id,petId:pet.id,kind:'reminder',title:'test',dueAt:row.dueAt,reminderId:id});assert.equal(sends,1);
    await db.update(reminders).set({status:'cancelled',completedAt:Date.now(),scheduledAt:Date.now()-1000}).where(eq(reminders.id,id));
    await processDueReminders();assert.equal(sends,1);
    // Registration status must not be overwritten by a record notification.
    const snapshot=await clinicSnapshot();
    const registrations=await db.select().from(smsDeliveries).where(eq(smsDeliveries.idempotencyKey,`registration:${pet.id}`));
    assert.equal(snapshot.patients.find(p=>p.id===pet.id).registrationSmsStatus,registrations[0]?.status);
  } finally {globalThis.fetch=original;await saveClinicSettings(defaultSettings,'');}
});


test('past deadline is suppressed and an immediate-only visit never creates a second event',async()=>{
  const [pet]=await db.select().from(pets);
  const config=structuredClone(defaultSettings);config.smsEnabled=true;config.smsProvider='faraz';config.vaccinePattern.code='vaccine';config.taskPattern.code='task';
  await saveClinicSettings(config,'FAKE-ONLY');
  const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return Response.json({status:'success',data:88},{status:201});};
  try {
    const id=crypto.randomUUID();
    await createRecord({id,petId:pet.id,kind:'visit',title:'معاینه عمومی',date:todayISO(),nextDate:'',notes:'',diagnosis:'',treatment:'',medications:'',completed:false});
    assert.equal(sends,1);assert.equal((await db.select().from(reminders).where(eq(reminders.visitId,id))).length,0);
    const late=crypto.randomUUID();
    await db.insert(reminders).values({id:late,petId:pet.id,type:'task',title:'late',dueAt:Date.now()-3600000,scheduledAt:Date.now()-7200000});
    await processDueReminders();assert.equal(sends,1);
    assert.equal((await db.select().from(reminders).where(eq(reminders.id,late)))[0].status,'cancelled');
  } finally {globalThis.fetch=original;await saveClinicSettings(defaultSettings,'');}
});

test('scheduled worker route enforces existing cron secret and never sends while disabled',async()=>{
  const {GET}=await import('../src/app/api/internal/reminders/process/route.ts');
  const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='TEST-ONLY-CRON-SECRET-'.repeat(3);
  try {
    const url='https://vetly.example/api/internal/reminders/process';
    assert.equal((await GET(new Request(url))).status,401);
    assert.equal((await GET(new Request(url,{headers:{authorization:'Bearer wrong'}}))).status,401);
    await saveClinicSettings(defaultSettings,'');
    const response=await GET(new Request(url,{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}));
    assert.equal(response.status,200);assert.equal((await response.json()).disabled,true);
  } finally {if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});

test('GitHub scheduler identity verifies signature and pins audience, repo, ref, workflow and event',async()=>{
  const {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT}=await import('jose');
  const {githubWorkerAuthorized,workerAudience}=await import('../src/features/reminders/worker-auth.ts');
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='test-only';
  const keys=createLocalJWKSet({keys:[jwk]});
  const now=Math.floor(Date.now()/1000);
  const claims={iss:'https://token.actions.githubusercontent.com',aud:workerAudience,
    sub:'repo:arashdm2020@114090010/vetly@1368496594:ref:refs/heads/main',
    iat:now,nbf:now-1,exp:now+300,repository:'arashdm2020/vetly',repository_id:'1368496594',repository_owner_id:'114090010',
    ref:'refs/heads/main',workflow_ref:'arashdm2020/vetly/.github/workflows/reminders.yml@refs/heads/main',runner_environment:'github-hosted',event_name:'schedule'};
  const token=async patch=>new SignJWT({...claims,...patch}).setProtectedHeader({alg:'RS256',kid:'test-only'}).sign(privateKey);
  assert.equal(await githubWorkerAuthorized(await token({}),keys),true);
  assert.equal(await githubWorkerAuthorized(await token({event_name:'workflow_dispatch'}),keys),true);
  assert.equal(await githubWorkerAuthorized(await token({sub:'repo:arashdm2020/vetly:ref:refs/heads/main'}),keys),true);
  for(const patch of [{aud:'wrong'},{iss:'wrong'},{repository_id:'other'},{repository_owner_id:'other'},
    {repository:'other/repo'},{ref:'refs/heads/feature'},{workflow_ref:'arashdm2020/vetly/.github/workflows/other.yml@refs/heads/main'},
    {event_name:'pull_request'},{runner_environment:'self-hosted'},{sub:'other'},{exp:now-100},{iat:now-3600},{nbf:now+60}])
    assert.equal(await githubWorkerAuthorized(await token(patch),keys),false);
  assert.equal(await githubWorkerAuthorized('invalid',keys),false);
  const {publicKey:other}=await generateKeyPair('RS256');const otherJwk=await exportJWK(other);otherJwk.kid='test-only';
  assert.equal(await githubWorkerAuthorized(await token({}),createLocalJWKSet({keys:[otherJwk]})),false);
});

test('worker dry run authenticates without touching the SMS queue',async()=>{
  const {GET}=await import('../src/app/api/internal/reminders/process/route.ts');
  const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='TEST-ONLY-CRON-'.repeat(4);
  try {
    const before=await db.select({count:sql`count(*)`}).from(smsDeliveries);
    const response=await GET(new Request('https://vetly.example/api/internal/reminders/process?dry_run=1',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}));
    assert.equal(response.status,200);assert.equal((await response.json()).dryRun,true);
    assert.deepEqual(await db.select({count:sql`count(*)`}).from(smsDeliveries),before);
  } finally {if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});

test('phone edits persist once, normalize, reject stale/invalid input and send only to the new number',async()=>{
  const {changePatientPhone}=await import('../src/features/patients/change-phone.ts');
  await saveClinicSettings({...structuredClone(defaultSettings),smsEnabled:false},'');
  const patient=await createPatient({name:'تغییر شماره',species:'cat',owner:'صاحب آزمون',phone:'09121111111'});
  const [pet]=await db.select().from(pets).where(eq(pets.id,patient.id));
  const sibling=crypto.randomUUID();await db.insert(pets).values({id:sibling,ownerId:pet.ownerId,name:'بیمار دوم',species:'cat'});
  const config={...structuredClone(defaultSettings),smsEnabled:true,smsProvider:'faraz',clinicPhone:'02112345678'};
  for(const key of ['registrationPattern','vaccinePattern','taskPattern'])config[key].code='ApprovedPhone';
  await saveClinicSettings(config,'test-phone-key');
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({status:'success',data:55501}),{status:200});};
  try {
    const input={petId:patient.id,requestId:crypto.randomUUID(),expectedPhone:patient.phone,phone:'+989122222222'};
    const settled=await Promise.allSettled([changePatientPhone(input),changePatientPhone(input)]);
    const results=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
    assert.equal(results.length,2);
    assert.equal(calls.length,1);assert.equal(calls[0].recipient,'09122222222');assert.equal(calls[0].code,config.registrationPattern.code);
    assert.ok(results.every(r=>r.changed));assert.ok(results.some(r=>r.sms.status==='accepted'));
    assert.equal((await db.select().from(owners).where(eq(owners.id,pet.ownerId)))[0].phone,'09122222222');
    assert.equal((await clinicSnapshot()).patients.find(p=>p.id===sibling).phone,'09122222222');
    const replay=await changePatientPhone(input);assert.equal(replay.sms.status,'accepted');assert.equal(calls.length,1);
    const unchanged=await changePatientPhone({...input,requestId:crypto.randomUUID(),expectedPhone:'09122222222',phone:'۰۹۱۲۲۲۲۲۲۲۲'});
    assert.deepEqual(unchanged,{changed:false,sms:null});assert.equal(calls.length,1);
    await assert.rejects(changePatientPhone({...input,requestId:crypto.randomUUID(),phone:'09123333333'}),/شماره پرونده تغییر کرده/);
    await assert.rejects(changePatientPhone({...input,phone:'123'}));
    await assert.rejects(changePatientPhone({...input,petId:crypto.randomUUID()}),/بیمار پیدا نشد/);
    assert.equal(calls.length,1);
    assert.equal((await db.select().from(reminders).where(eq(reminders.petId,patient.id))).length,0);
  }finally{globalThis.fetch=originalFetch;}
});

test('phone changes survive rejected/unknown/disabled SMS and never resend the same operation',async()=>{
  const {changePatientPhone}=await import('../src/features/patients/change-phone.ts');
  await saveClinicSettings({...structuredClone(defaultSettings),smsEnabled:false},'');
  const patient=await createPatient({name:'خطای پیامک',species:'dog',owner:'صاحب آزمون',phone:'09124444444'});
  const config={...structuredClone(defaultSettings),smsEnabled:true,smsProvider:'faraz'};
  for(const key of ['registrationPattern','vaccinePattern','taskPattern'])config[key].code='ApprovedPhone';
  await saveClinicSettings(config,'test-phone-key');
  const originalFetch=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({status:'error'}),{status:422});};
    const rejected={petId:patient.id,requestId:crypto.randomUUID(),expectedPhone:patient.phone,phone:'09125555555'};
    assert.equal((await changePatientPhone(rejected)).sms.status,'rejected');
    await changePatientPhone(rejected);assert.equal(calls,1);
    globalThis.fetch=async()=>{calls++;throw new DOMException('timeout','TimeoutError');};
    const timedout={...rejected,requestId:crypto.randomUUID(),expectedPhone:'09125555555',phone:'09126666666'};
    assert.equal((await changePatientPhone(timedout)).sms.status,'unknown');await changePatientPhone(timedout);assert.equal(calls,2);
    await saveClinicSettings({...config,smsEnabled:false},'');
    const disabled={...timedout,requestId:crypto.randomUUID(),expectedPhone:'09126666666',phone:'09127777777'};
    assert.equal((await changePatientPhone(disabled)).sms.status,'rejected');assert.equal(calls,2);
    assert.equal((await clinicSnapshot()).patients.find(p=>p.id===patient.id).phone,'09127777777');
  }finally{globalThis.fetch=originalFetch;}
});

test('phone edit server action denies unauthenticated access before mutation or SMS',async()=>{
  const {editPatientPhone}=await import('../src/features/clinic/actions.ts');
  const before=await db.select().from(owners);const beforeClaims=await db.select().from(smsDeliveries);
  const response=await editPatientPhone({petId:crypto.randomUUID(),requestId:crypto.randomUUID(),expectedPhone:'09121111111',phone:'09122222222'});
  assert.equal(response.ok,false);assert.deepEqual(await db.select().from(owners),before);assert.deepEqual(await db.select().from(smsDeliveries),beforeClaims);
});

test('phone update failure rolls back the delivery claim and never sends',async()=>{
  const {changePatientPhone}=await import('../src/features/patients/change-phone.ts');
  await saveClinicSettings({...structuredClone(defaultSettings),smsEnabled:false},'');
  const patient=await createPatient({name:'تراکنش',species:'cat',owner:'صاحب آزمون',phone:'09128888888'});
  const before=(await db.select().from(smsDeliveries)).length;
  await db.$client.execute("CREATE TRIGGER fail_phone_edit BEFORE UPDATE OF phone ON owners WHEN NEW.phone='09129999999' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  try {
    await assert.rejects(changePatientPhone({petId:patient.id,requestId:crypto.randomUUID(),expectedPhone:patient.phone,phone:'09129999999'}));
    assert.equal((await db.select().from(smsDeliveries)).length,before);
    assert.equal((await clinicSnapshot()).patients.find(p=>p.id===patient.id).phone,patient.phone);
  }finally{await db.$client.execute('DROP TRIGGER fail_phone_edit');}
});
