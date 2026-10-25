'use client';
import { useRef, useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import { useClinic } from './clinic-provider';
import { normalizePhone, type Patient } from '@/lib/clinic';
import type { PhoneChangeResult } from '@/features/patients/change-phone';
import { ConfirmationDialog } from './workspace/confirm-dialog';

export function PatientPhoneEditor({patient}:{patient:Patient}) {
  const {editPhone,busy}=useClinic();
  const [editing,setEditing]=useState(false),[phone,setPhone]=useState(patient.phone);
  const [confirm,setConfirm]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<PhoneChangeResult|null>(null);
  const lock=useRef(false),request=useRef<{signature:string;id:string}|null>(null);
  const normalized=normalizePhone(phone);
  async function save(){
    setConfirm(false);if(lock.current||busy||!normalized)return;
    lock.current=true;setError('');setResult(null);
    const signature=patient.id+':'+patient.phone+':'+normalized;
    if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
    try {
      const response=await editPhone({petId:patient.id,expectedPhone:patient.phone,phone:normalized,requestId:request.current.id});
      if(response){setResult(response);setEditing(false);}
      else setError('نتیجه ذخیره تأیید نشد؛ پیام بالای صفحه و شماره پرونده را بررسی کنید.');
    } finally {lock.current=false;}
  }
  return <section className="panel registration" aria-label="ویرایش شماره موبایل"><div className="section-heading"><div><h2>شماره موبایل صاحب حیوان</h2><p className="muted"><bdi>{patient.phone}</bdi></p></div><button type="button" disabled={busy} onClick={()=>{setPhone(patient.phone);setEditing(!editing);setError('');}}><Pencil size={16}/>{editing?'بستن ویرایش':'ویرایش شماره'}</button></div>
    {editing&&<form noValidate onSubmit={event=>{event.preventDefault();setError('');if(!normalized){setError('شماره موبایل معتبر وارد کنید.');return;}if(normalized===patient.phone){setResult({changed:false,sms:null});return;}setConfirm(true);}}>
      <label>شماره موبایل جدید<input type="tel" dir="ltr" autoComplete="tel" maxLength={30} value={phone} disabled={busy} onChange={event=>setPhone(event.target.value)} aria-invalid={Boolean(error)} autoFocus/></label>
      <p className="form-hint">پس از ذخیره، یک پیامک ثبت پرونده برای همین حیوان به شماره جدید ارسال می‌شود. شماره صاحب در پرونده‌های دیگر او نیز به‌روز می‌شود. ارسال، به فعال بودن سرویس و قالب ثبت پرونده بستگی دارد.</p>
      <div className="form-actions"><button type="submit" className="primary" disabled={busy||normalized===patient.phone}><Save size={16}/>{busy?'در حال ذخیره و ارسال…':'ذخیره شماره و ارسال پیامک'}</button></div>
    </form>}
    {error&&<p className="error" role="alert">{error}</p>}
    {result&&<div className="inline-notice" role="status"><p>{!result.changed?'شماره تغییری نکرد؛ پیامکی ارسال نشد.':<>شماره ذخیره شد. {result.sms?.status==='accepted'?<>درخواست پیامک پذیرفته شد؛ شناسه پیام: <bdi>{result.sms.messageId}</bdi>. پذیرش به معنی تحویل نیست.</>:result.sms?.status==='rejected'?<>پیامک رد شد: {result.sms.reason}</>:<>نتیجه پیامک نامشخص است؛ پنل پیامکی را بررسی کنید. ارسال خودکار تکرار نمی‌شود.</>}</>}</p></div>}
    {confirm&&<ConfirmationDialog title="تغییر شماره و ارسال پیامک؟" description={`شماره صاحب «${patient.name}» به ${normalized} تغییر می‌کند و یک پیامک ثبت پرونده به آن ارسال می‌شود. این ارسال هزینه دارد.`} confirmLabel="تأیید تغییر و ارسال" onCancel={()=>setConfirm(false)} onConfirm={()=>void save()}/>}
  </section>;
}
