import { workerAuthorized } from '@/features/reminders/worker-auth';
import { processDueReminders } from '@/features/reminders/process';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  if(!await workerAuthorized(request))return Response.json({error:'دسترسی مجاز نیست.'},{status:401});
  if(new URL(request.url).searchParams.get('dry_run')==='1')return Response.json({authorized:true,dryRun:true,processed:0},{headers:{'Cache-Control':'no-store'}});
  try {return Response.json(await processDueReminders(),{headers:{'Cache-Control':'no-store'}});}
  catch {return Response.json({error:'پردازش یادآوری انجام نشد.'},{status:503});}
}
export const POST=GET;
