// Disposable UI fixtures only. Never point this helper at a remote/production database.
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDatabase } from '../src/db/index.ts';
import { owners, pets, visits, vaccinations, reminders, settings } from '../src/db/schema.ts';
import { defaultSettings } from '../src/features/settings/schema.ts';
import { todayISO } from '../src/lib/clinic.ts';
assert(!process.env.VERCEL&&!process.env.vetly_TURSO_DATABASE_URL);
assert(process.env.TURSO_DATABASE_URL?.startsWith('file:/tmp/vetly-ui-'),'Use a new /tmp/vetly-ui-* local fixture database');
const db=getDatabase();
try {
 await migrate(db,{migrationsFolder:'./drizzle'});
 assert.equal((await db.select().from(pets)).length,0,'Fixture database must be empty');
 const config=structuredClone(defaultSettings);config.clinicName='کلینیک نمونه وتلی';config.clinicPhone='02100000000';config.smsProvider='faraz';config.smsEnabled=false;config.customSpecies=['خرگوش'];
 for(const [key,names] of [['registrationPattern',['clinic','pet','phone']],['vaccinePattern',['clinic','pet','date','phone']],['taskPattern',['clinic','action','pet','date','phone']]]) {
   config[key].code='preview-'+key;config[key].parameters=names.map(name=>({name,variable:name}));
 }
 await db.insert(settings).values({key:'clinic',value:JSON.stringify(config)});
 const today=todayISO(),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const old=new Date(Date.parse(today+'T12:00:00Z')-3*86400000).toISOString().slice(0,10);
 const owner=crypto.randomUUID();await db.insert(owners).values({id:owner,fullName:'صاحب نمونه',phone:'09120000000'});
 for(const [index,name] of ['نمونه میلو','نمونه لونا','نمونه چارلی'].entries()) {
   const pet=crypto.randomUUID();await db.insert(pets).values({id:pet,ownerId:owner,name,species:index===2?'dog':'cat'});
   await db.insert(visits).values({petId:pet,visitedAt:old,type:'examination',complaint:'یادداشت نمونه برای بررسی نمایش رابط کاربری.',diagnosis:'متن نمونه؛ اطلاعات بیمار واقعی نیست.'});
   await db.insert(vaccinations).values({petId:pet,vaccineName:'واکسن نمونه',administeredAt:old,nextDueAt:index===0?today:tomorrow,reminderEnabled:false});
   await db.insert(reminders).values({petId:pet,type:'task',title:'پیگیری نمونه',dueAt:Date.parse(tomorrow+'T14:00:00+03:30'),scheduledAt:Date.parse(today+'T14:00:00+03:30'),status:'cancelled'});
 }
 console.log('Disposable UI fixtures created. SMS disabled; no provider request made.');
} finally {db.$client.close();}
