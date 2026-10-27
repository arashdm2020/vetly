import { z } from 'zod';
import { digits, normalizePhone } from '@/lib/clinic';
const base='https://api.iranpayamak.com/ws/v1';
export const deliveryStatuses=['not-started','in-queue','sent','send-failure','delivered','delivery-failure','delivery-undetermined','system-error','blacklist'] as const;
export type AnnouncementSendResult={status:'accepted';id:string}|{status:'rejected'|'unknown';reason:string};
const envelope=z.object({status:z.literal('success'),data:z.number().int().positive().safe()});
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function farazAnnouncements(key:string,transport:typeof fetch=fetch) {
  async function request(path:string,body?:unknown) {
    return transport(base+path,{method:body?'POST':'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
      headers:{'Api-Key':key,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  }
  return {
    async lines(){
      let response:Response;
      try {response=await request('/lines/accessible');}catch{throw new Error('دریافت خطوط فراز ممکن نشد؛ اتصال را بررسی و دوباره تلاش کنید.');}
      const json=record(await response.json().catch(()=>null));
      if(!response.ok||json.status!=='success')throw new Error(`فهرست خطوط فراز دریافت نشد (HTTP ${response.status})؛ کلید و دسترسی حساب را بررسی کنید.`);
      const data=record(json.data);
      const rows=Array.isArray(json.data)?json.data:Array.isArray(data.items)?data.items:Array.isArray(data.lines)?data.lines:null;
      if(!rows)throw new Error('ساختار فهرست خطوط فراز قابل تشخیص نیست؛ از پشتیبانی فراز پیگیری کنید.');
      const lines=rows.flatMap(item=>{
        const row=record(item);
        // Never interpret row IDs or arbitrary nested numbers as sender lines.
        const raw=typeof item==='string'?item:row.line_number??row.number;
        const number=typeof raw==='string'?digits(raw.trim()):typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):'';
        if(!/^\d{1,20}$/.test(number))return [];
        return [{number,dedicated:typeof row.is_dedicated==='boolean'?row.is_dedicated:null}];
      });
      if(rows.length&&lines.length!==rows.length){
        const known=['line_number','number','line','lineNumber','phone_number','sender_number','is_dedicated'];
        // Diagnostics contain only fixed field names and types, never values.
        console.warn('faraz_lines_shape',JSON.stringify({rows:rows.length,recognized:lines.length,shapes:rows.slice(0,5).map(item=>({type:item===null?'null':typeof item,fields:known.filter(field=>field in record(item)).map(field=>({field,type:typeof record(item)[field]}))}))}));
        if(!lines.length)throw new Error('شماره خطی در پاسخ فراز قابل تشخیص نیست؛ ساختار پاسخ نیازمند بررسی است.');
      }
      return [...new Map(lines.map(line=>[line.number,line])).values()];
    },
    async send(text:string,sender:string,recipients:string[]):Promise<AnnouncementSendResult>{
      try {
        const response=await request('/sms/simple',{text,line_number:sender,recipients,number_format:'english'});
        const json:unknown=await response.json().catch(()=>null),parsed=envelope.safeParse(json);
        if(response.ok&&parsed.success)return {status:'accepted',id:String(parsed.data.data)};
        if([400,401,403,404,405,422,429].includes(response.status)||record(json).status==='error')
          return {status:'rejected',reason:`فراز درخواست را رد کرد (HTTP ${response.status}). خط، متن، اعتبار و مجوز حساب را در پنل بررسی کنید.`};
        return {status:'unknown',reason:`پاسخ ارسال قابل تأیید نیست (HTTP ${response.status})؛ پیش از هر ارسال جدید پنل فراز را بررسی کنید.`};
      }catch{return {status:'unknown',reason:'ارتباط ارسال قطع شد؛ درخواست خودکار تکرار نمی‌شود. پنل فراز را بررسی کنید.'};}
    },
    async report(id:string){
      if(!/^[1-9]\d{0,19}$/.test(id))throw new Error('شناسه گزارش معتبر نیست.');
      // GET-only: refreshing a report can never create another send.
      const detail=await request('/send_request/'+id);
      const detailJson=record(await detail.json().catch(()=>null));
      if(!detail.ok||detailJson.status!=='success')throw new Error('گزارش فراز در دسترس نیست؛ بعداً دوباره بررسی کنید.');
      const data=record(detailJson.data);
      const allowedRequestStatuses=['pending','pending-approval','waiting-for-approval','approved','rejected',...deliveryStatuses];
      const status=typeof data.status==='string'&&allowedRequestStatuses.includes(data.status)?data.status:null;
      // The official OpenAPI wrongly references a phonebook schema for reports.
      // Unknown shapes stay unknown. Only fixed statuses and normalized phones
      // are returned; raw descriptions or unrelated response fields never escape.
      const recipients:{phone:string;status:string}[]=[];
      for(let page=1;page<=2;page++){
        const response=await request('/send_request/'+id+'/items?page='+page+'&limit=100');
        const json=record(await response.json().catch(()=>null));
        if(!response.ok||json.status!=='success')throw new Error('گزارش گیرندگان فراز در دسترس نیست؛ دوباره بررسی کنید.');
        const paged=record(json.data),rows=Array.isArray(paged.items)?paged.items:[];
        for(const item of rows){
          const row=record(item),phone=typeof row.recipient==='string'?normalizePhone(row.recipient):null;
          if(phone&&typeof row.status==='string'&&(deliveryStatuses as readonly string[]).includes(row.status))recipients.push({phone,status:row.status});
        }
        if(rows.length<100||(typeof paged.totalPages==='number'&&page>=paged.totalPages))break;
      }
      return {status,recipients,recognized:status!==null||recipients.length>0};
    },
  };
}
