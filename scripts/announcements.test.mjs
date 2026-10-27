import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index.ts';
import { announcements,owners,pets,settings,reminders,smsDeliveries } from '../src/db/schema.ts';
import { defaultSettings } from '../src/features/settings/schema.ts';
import { saveClinicSettings } from '../src/features/settings/service.ts';
import { resolveAnnouncement,audienceHash,queueAnnouncement,processAnnouncements,announcementReport,refreshAnnouncement,cancelAnnouncement,listAnnouncements } from '../src/features/announcements/service.ts';
import { farazAnnouncements } from '../src/features/announcements/provider.ts';
const folder=mkdtempSync(join(tmpdir(),'vetly-announcement-'));
process.env.TURSO_DATABASE_URL='file:'+join(folder,'db.sqlite');process.env.NODE_ENV='test';process.env.SETTINGS_ENCRYPTION_KEY='a'.repeat(64);
// Fail closed. Every provider request below must be explicitly mocked.
const withLines=handler=>async(url,options)=>String(url).endsWith('/lines/accessible')?new Response(JSON.stringify({status:'success',data:[{line_number:'900012345',is_dedicated:false}]}),{status:200}):handler(url,options);
const offline=withLines(async()=>{throw new Error('Real network disabled');});globalThis.fetch=offline;
let db,cat,dog;
before(async()=>{
 db=getDatabase();await migrate(db,{migrationsFolder:'./drizzle'});
 const owner=crypto.randomUUID();cat=crypto.randomUUID();dog=crypto.randomUUID();
 await db.insert(owners).values({id:owner,fullName:'صاحب نمونه',phone:'09121111111'});
 await db.insert(pets).values([{id:cat,ownerId:owner,name:'گربه',species:'cat'},{id:dog,ownerId:owner,name:'سگ',species:'dog'}]);
 const config={...structuredClone(defaultSettings),smsProvider:'faraz',smsEnabled:true};for(const key of ['registrationPattern','vaccinePattern','taskPattern'])config[key].code='Approved';
 await saveClinicSettings(config,'test-secret-announcements');
});
after(()=>db.$client.close());
const input=()=>({requestId:crypto.randomUUID(),title:'موجودی غذا',text:'غذای جدید موجود شد.',sender:'900012345',audience:'all',petIds:[],manual:[{name:'همکار',phone:'+989122222222'},{name:'تکراری',phone:'۰۹۱۲۱۱۱۱۱۱۱'}],consent:true});
async function enqueue(data){const r=await resolveAnnouncement(data);return queueAnnouncement(data,audienceHash(r.recipients));}
async function cooldown(){await db.update(settings).set({updatedAt:0}).where(eq(settings.key,'announcement:cooldown'));}

test('recipient preview deduplicates normalized owner/manual phones, selects species and rejects invalid data',async()=>{
 const data=input(),r=await resolveAnnouncement(data);assert.equal(r.recipients.length,2);assert.equal(r.recipients[1].phone,'09122222222');
 assert.equal((await resolveAnnouncement({...data,audience:'cat',manual:[]})).recipients.length,1);
 assert.equal((await resolveAnnouncement({...data,audience:'selected',petIds:[dog],manual:[]})).recipients.length,1);
 await assert.rejects(resolveAnnouncement({...data,audience:'none',manual:[]}));
 await assert.rejects(resolveAnnouncement({...data,manual:[{name:'',phone:'123'}]}));
 await assert.rejects(resolveAnnouncement({...data,sender:''}));await assert.rejects(resolveAnnouncement({...data,text:' '}));
 await assert.rejects(resolveAnnouncement({...data,consent:false}));
 await assert.rejects(queueAnnouncement(data,'a'.repeat(64)),/فهرست گیرندگان/);
 assert.equal((await db.select().from(announcements)).length,0);
});

test('campaign queue is persistent, replay-safe, throttled, and sends only in the worker once',async()=>{
 const calls=[];globalThis.fetch=withLines(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({status:'success',data:72501}),{status:201});});
 try{
 const data=input(),hash=audienceHash((await resolveAnnouncement(data)).recipients);
 const ids=await Promise.all([queueAnnouncement(data,hash),queueAnnouncement(data,hash)]);assert.equal(ids[0],ids[1]);assert.equal(calls.length,0);
 assert.equal((await announcementReport(ids[0])).recipients.length,2);
 await assert.rejects(enqueue(input()),/حداقل یک دقیقه/);
 await assert.rejects(queueAnnouncement({...data,text:'متن دیگر'},hash),/محتوای دیگری/);
 const r=await Promise.all([processAnnouncements(),processAnnouncements()]);assert.equal(r.reduce((n,x)=>n+x.processed,0),1);assert.equal(calls.length,1);
 const sent=JSON.parse(calls[0].options.body);assert.equal(calls[0].url,'https://api.iranpayamak.com/ws/v1/sms/simple');assert.deepEqual(sent,{text:data.text,line_number:data.sender,recipients:['09121111111','09122222222'],number_format:'english'});
 assert.equal(calls[0].options.headers['Api-Key'],'test-secret-announcements');
 assert.equal((await announcementReport(ids[0])).campaign.status,'accepted');assert.equal((await announcementReport(ids[0])).campaign.providerId,'72501');
 await processAnnouncements();assert.equal(calls.length,1);
 assert.equal((await db.select().from(reminders)).length,0);assert.equal((await db.select().from(smsDeliveries)).length,0);
 }finally{globalThis.fetch=offline;}
});

test('reports only update recognized campaign recipients, do not send, and throttle refresh',async()=>{
 const [campaign]=await listAnnouncements();let calls=0;
 globalThis.fetch=withLines(async(url,options)=>{calls++;assert.equal(options.method,'GET');return new Response(JSON.stringify(url.includes('/items')?{status:'success',data:{items:[{recipient:'09121111111',status:'delivered'},{recipient:'09122222222',status:'blacklist'},{recipient:'09129999999',status:'delivered'}]}}:{status:'success',data:{status:'approved'}}),{status:200});});
 try{await refreshAnnouncement(campaign.id);const report=await announcementReport(campaign.id);assert.equal(calls,2);assert.equal(report.campaign.providerStatus,'approved');assert.deepEqual(report.recipients.map(r=>r.status),['delivered','blacklist']);await assert.rejects(refreshAnnouncement(campaign.id),/۳۰ ثانیه/);}finally{globalThis.fetch=offline;}
});

test('unknown and rejected sends never retry and cancellation blocks the queued send',async()=>{
 let count=0;globalThis.fetch=withLines(async()=>{count++;throw new DOMException('timeout','TimeoutError');});
 try{
 await cooldown();const id=await enqueue(input());await processAnnouncements();assert.equal((await announcementReport(id)).campaign.status,'unknown');await processAnnouncements();assert.equal(count,1);
 await cooldown();const cancelled=await enqueue(input());await cancelAnnouncement(cancelled);await processAnnouncements();assert.equal(count,1);assert.equal((await announcementReport(cancelled)).campaign.status,'cancelled');
 globalThis.fetch=withLines(async()=>{count++;return new Response(JSON.stringify({status:'error',message:'test-secret-announcements'}),{status:422});});
 await cooldown();const rejected=await enqueue(input());await processAnnouncements();const report=await announcementReport(rejected);assert.equal(report.campaign.status,'rejected');assert.ok(!JSON.stringify(report).includes('test-secret-announcements'));await processAnnouncements();assert.equal(count,2);
 }finally{globalThis.fetch=offline;}
});

test('adapter rejects unconfirmed acceptance and unknown report shapes without leaking raw responses',async()=>{
 const provider=farazAnnouncements('secret',async()=>new Response(JSON.stringify({status:'success',data:{secret:'secret'}}),{status:200}));
 const result=await provider.send('text','9000',['09121111111']);assert.equal(result.status,'unknown');assert.ok(!result.reason.includes('secret'));
 const report=await provider.report('123');assert.equal(report.recognized,false);assert.deepEqual(report.recipients,[]);
});

test('disabling SMS prevents worker sending; stale in-flight campaigns become unknown without retry',async()=>{
 await cooldown();const id=await enqueue(input());await db.update(announcements).set({status:'submitting',updatedAt:0}).where(eq(announcements.id,id));
 await saveClinicSettings({...structuredClone(defaultSettings),smsEnabled:false},'');
 assert.deepEqual(await processAnnouncements(),{processed:0});assert.equal((await announcementReport(id)).campaign.status,'unknown');
});

test('unauthenticated announcements reads and commands are denied before touching the queue',async()=>{
 const {GET,POST}=await import('../src/app/api/announcements/route.ts');
 const before=(await db.select().from(announcements)).length;
 assert.equal((await GET(new Request('https://clinic.example/api/announcements'))).status,401);
 for(const operation of ['preview','queue','refresh','cancel','dispatch'])assert.equal((await POST(new Request('https://clinic.example/api/announcements',{method:'POST',body:JSON.stringify({operation})}))).status,401);
 assert.equal((await db.select().from(announcements)).length,before);
});

test('confirmed audience changes are rejected and failed recipient insertion rolls back the campaign',async()=>{
 const config={...structuredClone(defaultSettings),smsEnabled:true,smsProvider:'faraz'};for(const key of ['registrationPattern','vaccinePattern','taskPattern'])config[key].code='Approved';
 await saveClinicSettings(config,'test-secret-announcements');await cooldown();
 const data=input(),preview=await resolveAnnouncement(data),hash=audienceHash(preview.recipients);
 await db.update(owners).set({phone:'09123333333'});
 await assert.rejects(queueAnnouncement(data,hash),/فهرست گیرندگان تغییر کرده/);
 await db.update(owners).set({phone:'09121111111'});
 const before=(await db.select().from(announcements)).length;
 await db.$client.execute("CREATE TRIGGER fail_announcement_recipient BEFORE INSERT ON announcement_recipients BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 try{await assert.rejects(enqueue(input()));assert.equal((await db.select().from(announcements)).length,before);}
 finally{await db.$client.execute('DROP TRIGGER fail_announcement_recipient');}
});

test('accessible sender lines use a read-only request, deduplicate safely and never expose raw data',async()=>{
 const calls=[];
 const provider=farazAnnouncements('private-key',async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({status:'success',data:{items:[{line_number:'900012345',is_dedicated:false,token:'private-key'},{number:'900099999',is_dedicated:true},{number:'900012345',is_dedicated:false}]}}),{status:200});});
 const lines=await provider.lines();assert.deepEqual(lines,[{number:'900012345',dedicated:false},{number:'900099999',dedicated:true}]);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.iranpayamak.com/ws/v1/lines/accessible');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);assert.ok(!JSON.stringify(lines).includes('private-key'));
 const empty=farazAnnouncements('secret',async()=>new Response(JSON.stringify({status:'success',data:[]}),{status:200}));assert.deepEqual(await empty.lines(),[]);
 const invalid=farazAnnouncements('secret',async()=>new Response(JSON.stringify({status:'success',data:[{id:9000}]}),{status:200}));await assert.rejects(invalid.lines(),/قابل تشخیص/);
 const rejected=farazAnnouncements('secret',async()=>new Response(JSON.stringify({status:'error',message:'secret'}),{status:401}));await assert.rejects(rejected.lines(),error=>!error.message.includes('secret'));
 const timeout=farazAnnouncements('secret',async()=>{throw new Error('secret');});await assert.rejects(timeout.lines(),error=>!error.message.includes('secret'));
});

test('line listing endpoint denies unauthenticated access; forged sender cannot enter queue',async()=>{
 const {GET}=await import('../src/app/api/announcements/lines/route.ts');assert.equal((await GET()).status,401);
 const data={...input(),sender:'999999'};await cooldown();const count=(await db.select().from(announcements)).length;
 await assert.rejects(enqueue(data),/فهرست خطوط مجاز/);assert.equal((await db.select().from(announcements)).length,count);
});

test('line listing keeps valid lines when optional rows are malformed and normalizes Persian digits',async()=>{
 const provider=farazAnnouncements('secret',async()=>new Response(JSON.stringify({status:'success',data:[null,{id:2},{line_number:'۹۰۰۰۸۳۶۱',is_dedicated:false}]}),{status:200}));
 assert.deepEqual(await provider.lines(),[{number:'90008361',dedicated:false}]);
});

test('immediate dispatch targets only the confirmed queued campaign and concurrent triggers send once',async()=>{
 await cooldown();const first=await enqueue(input());await cooldown();const second=await enqueue(input());
 let calls=0;globalThis.fetch=withLines(async()=>{calls++;return new Response(JSON.stringify({status:'success',data:99123}),{status:201});});
 try{
  const results=await Promise.all([processAnnouncements(second),processAnnouncements(second)]);
  assert.equal(results.reduce((n,r)=>n+r.processed,0),1);assert.equal(calls,1);
  assert.equal((await announcementReport(first)).campaign.status,'queued');assert.equal((await announcementReport(second)).campaign.status,'accepted');
  await processAnnouncements(second);assert.equal(calls,1);await cancelAnnouncement(first);
 }finally{globalThis.fetch=offline;}
});
