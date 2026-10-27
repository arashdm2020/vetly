'use client';
import { useEffect, useRef, useState } from 'react';
import { Megaphone, RefreshCw, Send, X } from 'lucide-react';
import { useClinic } from './clinic-provider';
import { normalizePhone } from '@/lib/clinic';
import { recipientLimit, statusLabels, type AnnouncementInput } from '@/features/announcements/schema';
import type { announcementReport, listAnnouncements } from '@/features/announcements/service';
import { PageHeader, EmptyState } from './workspace/primitives';
import { ConfirmationDialog } from './workspace/confirm-dialog';
type Campaign=Awaited<ReturnType<typeof listAnnouncements>>[number];
type Report=Awaited<ReturnType<typeof announcementReport>>;
type Preview={recipients:{phone:string;name:string}[];hash:string;input:AnnouncementInput};
async function api<T>(body?:unknown,id?:string,page=1):Promise<T>{
  const response=await fetch('/api/announcements'+(id?'?id='+encodeURIComponent(id):'?page='+page),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'ارتباط برقرار نشد.');return data;
}
const time=(value:number)=>new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'short'}).format(value);
export function Announcements(){
  const {patients,settings}=useClinic();
  const [title,setTitle]=useState(''),[text,setText]=useState(''),[sender,setSender]=useState('');
  const [audience,setAudience]=useState<AnnouncementInput['audience']>('none'),[selected,setSelected]=useState<string[]>([]);
  const [manual,setManual]=useState(''),[consent,setConsent]=useState(false),[history,setHistory]=useState<Campaign[]>([]),[report,setReport]=useState<Report|null>(null);
  const [page,setPage]=useState(1);
  const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const lock=useRef(false),operation=useRef<{signature:string;id:string}|null>(null);
  async function historyLoad(target=page){setHistory(await api<Campaign[]>(undefined,undefined,target));setPage(target);}
  useEffect(()=>{let active=true;api<Campaign[]>().then(rows=>{if(active)setHistory(rows);}).catch(()=>{if(active)setError('تاریخچه بارگذاری نشد؛ اتصال و اجرای مهاجرت دیتابیس را بررسی کنید.');});return()=>{active=false;};},[]);
  async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'نتیجه مشخص نیست؛ تاریخچه و پنل فراز را بررسی کنید.');}finally{lock.current=false;setBusy(false);}}
  async function prepare(){await run(async()=>{
    const entries=manual.split(/\n/).map(row=>row.trim()).filter(Boolean).map(row=>{const parts=row.split(/[,،]/);const phone=normalizePhone(parts.at(-1)!.trim());if(!phone)throw new Error('شماره دستی نامعتبر است؛ هر خط را بررسی کنید.');return {name:parts.length>1?parts.slice(0,-1).join('،').trim():'',phone};});
    const body={title,text,sender,audience,petIds:selected,manual:entries,consent};
    const signature=JSON.stringify(body);if(operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
    const input={...body,requestId:operation.current.id} as AnnouncementInput;
    const resolved=await api<Omit<Preview,'input'>>({operation:'preview',input});setPreview({...resolved,input});
  });}
  async function queue(){if(!preview)return;const saved=preview;setPreview(null);await run(async()=>{
    const {id}=await api<{id:string}>({operation:'queue',input:saved.input,hash:saved.hash});
    setNotice('درخواست در صف نرم‌افزار ثبت شد؛ زمان‌بند سرور آن را برای بررسی متن به فراز می‌فرستد.');
    setReport(await api<Report>(undefined,id));await historyLoad(1);
  });}
  async function detail(id:string){await run(async()=>setReport(await api<Report>(undefined,id)));}
  return <div className="announcements-page"><PageHeader title="اطلاع‌رسانی" description="متن دلخواه برای مشتریان، همکاران و شماره‌های دستی؛ مستقل از پیامک‌های پرونده و یادآوری."/>
    <div className="inline-notice"><p>متن آزاد در فراز نیازمند بررسی است. ثبت درخواست و پذیرش سرویس به معنی تأیید متن یا تحویل نیست. فقط از خط عمومی یا اختصاصی مجاز حساب استفاده کنید؛ خط پترن خودکار انتخاب نمی‌شود.</p></div>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="inline-notice" role="status">{notice}</p>}
    <form className="panel" noValidate onSubmit={event=>{event.preventDefault();void prepare();}}><fieldset className="plain-fieldset" disabled={busy}>
      <h2><Megaphone size={18}/> اطلاع‌رسانی جدید</h2><div className="form-grid"><label>عنوان داخلی<input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label><label>خط مجاز ارسال متن آزاد<input type="tel" dir="ltr" value={sender} maxLength={20} onChange={e=>setSender(e.target.value)} placeholder="شماره خط موجود در پنل فراز"/></label></div>
      <label>متن پیامک<textarea value={text} rows={5} maxLength={1600} onChange={e=>setText(e.target.value)}/></label><p className="form-hint">{text.length.toLocaleString('fa-IR')} از ۱۶۰۰ نویسه · عنوان داخلی ارسال نمی‌شود. هزینه و تعداد قطعات پیامک را فراز تعیین می‌کند.</p>
      <div className="form-grid"><label>گیرندگان از پرونده‌ها<select value={audience} onChange={e=>setAudience(e.target.value as AnnouncementInput['audience'])}><option value="none">فقط شماره‌های دستی</option><option value="all">همه صاحبان پت</option><option value="dog">صاحبان سگ</option><option value="cat">صاحبان گربه</option><option value="selected">بیماران انتخاب‌شده</option></select></label><label>شماره‌های دستی؛ هر خط یک نفر<textarea rows={5} value={manual} onChange={e=>setManual(e.target.value)} placeholder={'نام همکار، 09123456789\n09123456789'}/></label></div>
      {audience==='selected'&&<div className="announcement-patients">{patients.length?patients.map(p=><label className="check-row" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>{p.name} · {p.owner} · <bdi>{p.phone}</bdi></label>):<p>پرونده‌ای ثبت نشده است.</p>}</div>}
      <p className="form-hint">شماره‌های تکراری یک‌بار دریافت می‌کنند. حداکثر هر درخواست {recipientLimit.toLocaleString('fa-IR')} گیرنده یکتا است. شماره‌های دستی در همین گزارش ذخیره می‌شوند.</p>
      <label className="check-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>مجوز ارسال این اطلاع‌رسانی به گیرندگان انتخاب‌شده را دارم.</label>
      {!settings.smsEnabled||settings.smsProvider!=='faraz'?<p className="error">برای ارسال، سرویس فراز باید در تنظیمات پیامک فعال باشد.</p>:null}
      <div className="form-actions"><button className="primary" disabled={busy||!consent||!title.trim()||!text.trim()||!sender.trim()}><Send size={17}/>{busy?'در حال بررسی…':'بررسی گیرندگان و تأیید ارسال'}</button></div>
    </fieldset></form>
    <section className="panel"><div className="section-heading"><h2>گزارش اطلاع‌رسانی‌ها</h2><button type="button" disabled={busy} onClick={()=>void run(()=>historyLoad())}><RefreshCw size={16}/>به‌روزرسانی فهرست</button></div>
      {history.length?history.map(c=><article className="due-row" key={c.id}><button type="button" disabled={busy} onClick={()=>void detail(c.id)}>{c.title}</button><p>{time(c.createdAt)} · {statusLabels[c.status]}{c.providerStatus&&<> · وضعیت گزارش فراز: {statusLabels[c.providerStatus]||'نامشخص'}</>}{c.providerId&&<> · شناسه فراز: <bdi>{c.providerId}</bdi></>}</p>{c.lastError&&<p>{c.lastError}</p>}</article>):<EmptyState icon={Megaphone} title="اطلاع‌رسانی ثبت نشده" description="ارسال‌های شما و نتیجه بررسی آن‌ها اینجا نمایش داده می‌شوند."/>}<div className="form-actions"><button type="button" disabled={busy||page===1} onClick={()=>void run(()=>historyLoad(page-1))}>صفحه قبل</button><span>صفحه {page.toLocaleString('fa-IR')}</span><button type="button" disabled={busy||history.length<20} onClick={()=>void run(()=>historyLoad(page+1))}>صفحه بعد</button></div>
    </section>
    {report&&<section className="panel"><div className="section-heading"><h2>{report.campaign.title}</h2><button type="button" className="icon-button" onClick={()=>setReport(null)} aria-label="بستن گزارش"><X size={18}/></button></div>
      <p className="record-text">{report.campaign.text}</p><p>خط فرستنده: <bdi>{report.campaign.sender}</bdi></p><p>{statusLabels[report.campaign.status]}</p>
      {report.campaign.providerId&&<p>شناسه فراز: <bdi>{report.campaign.providerId}</bdi></p>}{report.campaign.providerStatus&&<p>آخرین وضعیت فراز: {statusLabels[report.campaign.providerStatus]||'نامشخص'}</p>}
      {report.campaign.lastError&&<p className="error">{report.campaign.lastError}</p>}
      <p className="form-hint">{report.campaign.reportAt?'آخرین تلاش برای دریافت گزارش: '+time(report.campaign.reportAt):'هنوز گزارش تحویل از فراز دریافت نشده است.'}</p>
      <div className="form-actions"><button type="button" disabled={busy||!report.campaign.providerId} onClick={()=>void run(async()=>{setReport(await api<Report>({operation:'refresh',id:report.campaign.id}));await historyLoad();})}><RefreshCw size={16}/>دریافت گزارش فراز</button>
      {report.campaign.status==='queued'&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{setReport(await api<Report>({operation:'cancel',id:report.campaign.id}));await historyLoad();})}>لغو پیش از ارسال</button>}</div>
      <p>{report.recipients.length.toLocaleString('fa-IR')} گیرنده · تحویل تأییدشده: {report.recipients.filter(r=>r.status==='delivered').length.toLocaleString('fa-IR')}</p>
      <div className="announcement-recipient-list">{report.recipients.map(r=><div className="due-row" key={r.id}><strong>{r.name||'شماره دستی'}</strong> · <bdi>{r.phone}</bdi><p>{statusLabels[r.status]||'نامشخص'}</p></div>)}</div>
    </section>}
    {preview&&<ConfirmationDialog title="ثبت ارسال واقعی؟" description={`متن «${preview.input.title}» با خط ${preview.input.sender} برای ${preview.recipients.length} شماره یکتا ثبت می‌شود و هزینه دارد. پذیرش فراز به معنی تحویل نیست.`} confirmLabel="تأیید و ثبت در صف" onCancel={()=>setPreview(null)} onConfirm={()=>void queue()}>
      <p className="record-text announcement-preview-text">{preview.input.text}</p><h3>گیرندگان نهایی</h3><div className="announcement-recipient-list">{preview.recipients.map(row=><p key={row.phone}>{row.name} · <bdi>{row.phone}</bdi></p>)}</div>
    </ConfirmationDialog>}
  </div>;
}
