import { authenticated } from '@/lib/auth';
import { accessibleAnnouncementLines } from '@/features/announcements/service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;
export async function GET(){
  const headers={'Cache-Control':'no-store'};
  if(!await authenticated())return Response.json({error:'ورود مدیر الزامی است.'},{status:401,headers});
  try{return Response.json({lines:await accessibleAnnouncementLines()},{headers});}
  catch(error){
    const message=error instanceof Error?error.message:'';
    return Response.json({error:/^[آ-ی]/.test(message)?message:'دریافت خطوط ممکن نشد؛ تنظیمات فراز را بررسی کنید.'},{status:502,headers});
  }
}
