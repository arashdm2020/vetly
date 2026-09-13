import { z } from 'zod';
import type { ClinicSettings, variableNames } from '@/features/settings/schema';

export type SmsInput = {to:string; pattern:ClinicSettings['vaccinePattern']; values:Record<typeof variableNames[number],string>};
export type SmsResult = {status:'accepted'; messageId:string}|{status:'simulated'|'rejected'|'unknown'; reason:string};
export interface SmsProvider { send(input:SmsInput):Promise<SmsResult>; }
export class MockSmsProvider implements SmsProvider {
  async send():Promise<SmsResult>{return {status:'simulated',reason:'ارسال واقعی انجام نشد.'};}
}
export function smsProvider(name:ClinicSettings['smsProvider'],key:string,transport:typeof fetch=fetch):SmsProvider {
  if(name==='mock')return new MockSmsProvider();
  return {async send(input) {
    try {
      const parameters=input.pattern.parameters.map(p=>({name:p.name,value:input.values[p.variable]}));
      let response:Response;
      if(name==='smsir') {
        response=await transport('https://api.sms.ir/v1/send/verify',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
          headers:{'Content-Type':'application/json','x-api-key':key},
          body:JSON.stringify({mobile:input.to,templateId:Number(input.pattern.code),parameters})});
      } else {
        const body=new URLSearchParams({receptor:input.to,template:input.pattern.code,type:'sms'});
        for(const p of parameters)body.set(p.name,p.value);
        response=await transport('https://api.kavenegar.com/v1/'+encodeURIComponent(key)+'/verify/lookup.json',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),body});
      }
      // Any ambiguous response is never retried automatically.
      if(!response.ok)return {status:'unknown',reason:'پاسخ سرویس نامشخص است؛ وضعیت را در پنل بررسی کنید.'};
      const json:unknown=await response.json();
      if(name==='smsir') {
        const parsed=z.object({status:z.number(),data:z.object({messageId:z.union([z.number(),z.string()])}).nullish()}).safeParse(json);
        if(parsed.success&&parsed.data.status===1&&parsed.data.data?.messageId)return {status:'accepted',messageId:String(parsed.data.data.messageId)};
        if(parsed.success&&parsed.data.status!==1)return {status:'rejected',reason:'درخواست توسط سرویس پیامکی پذیرفته نشد.'};
      } else {
        const parsed=z.object({return:z.object({status:z.number()}),entries:z.array(z.object({messageid:z.union([z.number(),z.string()])})).nullish()}).safeParse(json);
        if(parsed.success&&parsed.data.return.status===200&&parsed.data.entries?.[0]?.messageid)return {status:'accepted',messageId:String(parsed.data.entries[0].messageid)};
        if(parsed.success&&parsed.data.return.status!==200)return {status:'rejected',reason:'درخواست توسط سرویس پیامکی پذیرفته نشد.'};
      }
      return {status:'unknown',reason:'نتیجه ارسال نامشخص است؛ پنل پیامکی را بررسی کنید.'};
    } catch {return {status:'unknown',reason:'ارتباط قطع شد؛ پیش از ارسال مجدد پنل پیامکی را بررسی کنید.'};}
  }};
}
