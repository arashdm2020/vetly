import { authenticated, localDevelopment } from '@/lib/auth';
import { sendTestSms } from '@/features/sms/test-send';
import { z } from 'zod';

export const runtime='nodejs';
export async function POST(request:Request) {
  // The clinic password is Vetly's existing administrator boundary. Do not allow dev bypass for paid sends.
  if(localDevelopment() || !await authenticated())return Response.json({status:'rejected',reason:'ورود مدیر کلینیک الزامی است.'},{status:401});
  if(request.headers.get('origin')!==new URL(request.url).origin)
    return Response.json({status:'rejected',reason:'مبدأ درخواست معتبر نیست.'},{status:403});
  try {
    const body=await request.text();
    if(body.length>4096)return Response.json({status:'rejected',reason:'درخواست بیش از حد بزرگ است.'},{status:413});
    return Response.json(await sendTestSms(JSON.parse(body)));
  } catch(error) {
    return Response.json({status:error instanceof z.ZodError || error instanceof SyntaxError?'rejected':'unknown',
      reason:error instanceof z.ZodError || error instanceof SyntaxError?'شماره و مقادیر پترن معتبر وارد کنید.':'نتیجه مشخص نیست؛ پیش از ارسال مجدد پنل فراز را بررسی کنید.'},{status:400});
  }
}
