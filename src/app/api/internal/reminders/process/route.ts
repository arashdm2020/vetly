import { equalSecret } from '@/lib/auth';
import { processDueReminders } from '@/features/reminders/process';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret||secret.length<32||!equalSecret(request.headers.get('authorization')??'', 'Bearer '+secret))return Response.json({error:'دسترسی مجاز نیست.'},{status:401});
  try {return Response.json(await processDueReminders(),{headers:{'Cache-Control':'no-store'}});}
  catch {return Response.json({error:'پردازش یادآوری انجام نشد.'},{status:503});}
}
export const POST=GET;
