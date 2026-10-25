import { z } from 'zod';
import type { ClinicSettings, variableNames } from '@/features/settings/schema';

export type SmsInput = {to:string; sender?:string; pattern:ClinicSettings['vaccinePattern']; values:Record<typeof variableNames[number],string>};
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
      if(name==='faraz') {
        const sender=input.sender?.trim() || '90008361';
        if(!/^\d{1,20}$/.test(sender))return {status:'rejected',reason:'شماره خط فرستنده فراز تنظیم نشده است.'};
        response=await transport('https://api.iranpayamak.com/ws/v1/sms/pattern',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
          headers:{'Content-Type':'application/json','Accept':'application/json','Api-Key':key},
          body:JSON.stringify({code:input.pattern.code,recipient:input.to,line_number:sender,number_format:'persian',attributes:Object.fromEntries(parameters.map(p=>[p.name,p.value]))})});
      } else if(name==='smsir') {
        response=await transport('https://api.sms.ir/v1/send/verify',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
          headers:{'Content-Type':'application/json','x-api-key':key},
          body:JSON.stringify({mobile:input.to,templateId:Number(input.pattern.code),parameters})});
      } else {
        const body=new URLSearchParams({receptor:input.to,template:input.pattern.code,type:'sms'});
        for(const p of parameters)body.set(p.name,p.value);
        response=await transport('https://api.kavenegar.com/v1/'+encodeURIComponent(key)+'/verify/lookup.json',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),body});
      }
      // Any ambiguous response is never retried automatically.
      if(!response.ok && name!=='faraz')return {status:'unknown',reason:'پاسخ سرویس نامشخص است؛ وضعیت را در پنل بررسی کنید.'};
      const json:unknown=name==='faraz'?await response.json().catch(()=>null):await response.json();
      if(name==='faraz') {
        const record=json && typeof json==='object' && !Array.isArray(json)?json as Record<string,unknown>:{};
        const id=record.data;
        if(response.ok && record.status==='success' && typeof id==='number' && Number.isSafeInteger(id) && id>0)
          return {status:'accepted',messageId:String(id)};
        // Error envelopes are not constrained by the success data schema. Validation errors
        // may use object/array data, null messages, or a different status discriminator.
        const fields=['line_number','recipient','code','attributes','number_format'];
        const errorFields=fields.filter(field=>JSON.stringify([record.errors,record.messages,record.message,record.data]).includes(field));
        const descriptions:Record<string,string>={line_number:'شماره خط فرستنده الزامی یا نامعتبر است؛ خط مجاز حساب را تنظیم کنید.',recipient:'شماره گیرنده را بررسی کنید.',code:'کد پترن را بررسی کنید.',attributes:'نام و مقدار پارامترهای پترن را بررسی کنید.',number_format:'قالب اعداد درخواست را بررسی کنید.'};
        const providerCode=String(record.code??'');
        const safeCode=/^\d{1,6}$/.test(providerCode)&&!key.includes(providerCode)?` — کد ${providerCode}`:'';
        const diagnostic=`HTTP ${response.status}`+safeCode+(errorFields.length?' — '+errorFields.map(field=>descriptions[field]).join(' '):'');
        const rejected=['error','failed','fail'].includes(String(record.status)) || [400,401,403,404,405,422].includes(response.status);
        if(rejected)return {status:'rejected',reason:'فراز درخواست را نپذیرفت. '+diagnostic};
        // Only fixed field names / types are exposed; never return arbitrary provider text.
        const statusType=record.status===null?'null':typeof record.status;
        const dataType=Array.isArray(id)?'array':id===null?'null':typeof id;
        return {status:'unknown',reason:`پاسخ فراز قابل تأیید نیست (${diagnostic}؛ status: ${statusType}، data: ${dataType}). پیش از تلاش جدید پنل فراز را بررسی کنید.`};
      } else if(name==='smsir') {
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
