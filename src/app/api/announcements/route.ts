import { after } from 'next/server';
import { z } from 'zod';
import { authenticated, localDevelopment } from '@/lib/auth';
import { announcementInput } from '@/features/announcements/schema';
import { announcementReport, audienceHash, cancelAnnouncement, listAnnouncements, queueAnnouncement, processAnnouncements, refreshAnnouncement, resolveAnnouncement } from '@/features/announcements/service';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){
  const message=error instanceof Error?error.message:'';
  return reply({error:error instanceof z.ZodError?'متن، خط فرستنده و شماره‌ها را بررسی کنید.':/^[آ-ی]/.test(message)?message:'عملیات تأیید نشد؛ پیش از تلاش مجدد تاریخچه و پنل پیامکی را بررسی کنید.'},400);
}
export async function GET(request:Request){
  if(!await authenticated())return reply({error:'ورود مدیر الزامی است.'},401);
  try {const url=new URL(request.url),id=url.searchParams.get('id'),page=z.coerce.number().int().min(1).max(10000).parse(url.searchParams.get('page')||'1');return reply(id?await announcementReport(z.uuid().parse(id)):await listAnnouncements(page));}catch(error){return failure(error);}
}
const command=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('preview'),input:announcementInput}).strict(),
  z.object({operation:z.literal('queue'),input:announcementInput,hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
  z.object({operation:z.enum(['cancel','refresh','dispatch']),id:z.uuid()}).strict(),
]);
export async function POST(request:Request){
  if(localDevelopment()||!await authenticated())return reply({error:'ورود مدیر الزامی است.'},401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'مبدأ درخواست معتبر نیست.'},403);
  try {
    const body=await request.text();if(body.length>30000)return reply({error:'حجم درخواست بیش از حد است.'},413);
    const data=command.parse(JSON.parse(body));
    if(data.operation==='preview'){const preview=await resolveAnnouncement(data.input);return reply({recipients:preview.recipients,hash:audienceHash(preview.recipients)});}
    if(data.operation==='queue'){
      const id=await queueAnnouncement(data.input,data.hash);
      dispatchAfterResponse(id);
      return reply({id});
    }
    if(data.operation==='dispatch'){
      const report=await announcementReport(data.id);
      if(report.campaign.status==='queued')dispatchAfterResponse(data.id);
      return reply(report);
    }
    if(data.operation==='cancel')await cancelAnnouncement(data.id);else await refreshAnnouncement(data.id);
    return reply(await announcementReport(data.id));
  }catch(error){return failure(error);}
}

function dispatchAfterResponse(id:string){
  // Vercel keeps this task alive after the HTTP response. The durable queued
  // record is a fallback; only a queued->submitting CAS can authorize a send.
  after(async()=>{try{await processAnnouncements(id);}catch{console.error('announcement_dispatch_failed',{id});}});
}
