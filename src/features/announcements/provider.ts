import { z } from 'zod';
import { normalizePhone } from '@/lib/clinic';
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
