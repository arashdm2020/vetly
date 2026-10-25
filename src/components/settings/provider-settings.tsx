'use client';
import { useRef, useState } from 'react';
import { Check, Info, KeyRound, Send, ShieldCheck } from 'lucide-react';
import type { ClinicSettings } from '@/features/settings/schema';
import type { SmsResult } from '@/features/sms/providers';
import { normalizePhone, formatDate, todayISO } from '@/lib/clinic';
import { FormSection, StatusBadge, SavingLabel } from '@/components/workspace/primitives';
import { ConfirmationDialog } from '@/components/workspace/confirm-dialog';
import { patternKeys, patternTitles, variableLabels, type PatternKey } from './template-editor';
import { variableNames } from '@/features/settings/schema';

export function SMSProviderSettings({form,savedSettings,keys,apiKey,setApiKey,update,dirty}:{form:ClinicSettings;savedSettings:ClinicSettings;keys:Record<string,boolean>;apiKey:string;setApiKey:(key:string)=>void;update:(patch:Partial<ClinicSettings>)=>void;dirty:boolean}) {
  return <div className="provider-details"><FormSection title="ارائه‌دهنده پیامک" description="سرویس، خط فرستنده و دسترسی API کلینیک را مدیریت کنید." action={<ShieldCheck size={19} aria-hidden="true"/>}>
    <div className="provider-status"><StatusBadge tone={keys[form.smsProvider]?'success':'neutral'}><KeyRound size={12}/>{keys[form.smsProvider]?'کلید ذخیره شده':'کلید ذخیره نشده'}</StatusBadge><StatusBadge tone={form.smsEnabled?'success':'neutral'}>{form.smsEnabled?'ارسال در پیش‌نویس فعال است':'ارسال در پیش‌نویس غیرفعال است'}</StatusBadge></div>
    <p className="form-hint">ذخیره بودن کلید، به معنی تأیید اتصال یا تحویل پیامک نیست.</p>
    <div className="form-grid"><label>ارائه‌دهنده<select value={form.smsProvider} onChange={event=>{update({smsProvider:event.target.value as ClinicSettings['smsProvider'],smsEnabled:false});setApiKey('');}}><option value="mock">بدون ارسال واقعی</option><option value="kavenegar">کاوه‌نگار</option><option value="smsir">SMS.ir</option><option value="faraz">فراز اس‌ام‌اس</option></select></label>
    {form.smsProvider==='faraz'&&<label>شماره خط فرستنده (اختیاری)<input dir="ltr" inputMode="numeric" maxLength={20} value={form.farazSender} onChange={event=>update({farazSender:event.target.value})} placeholder="پیش‌فرض: 90008361"/></label>}
    <label className="full-field">کلید API جدید<input type="password" autoComplete="new-password" dir="ltr" maxLength={512} disabled={form.smsProvider==='mock'} value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder={keys[form.smsProvider]?'برای حفظ کلید قبلی، خالی بگذارید':'کلید پنل سرویس پیامکی'}/></label></div>
    <p className="form-hint">کلید هر سرویس جداگانه و رمزگذاری‌شده ذخیره می‌شود. مقدار کلید ذخیره‌شده در این صفحه نمایش داده نمی‌شود.</p>
    {form.smsProvider==='faraz'&&<div className="inline-notice"><Info size={17}/><p>با خالی بودن شماره، خط خدماتی اشتراکی <bdi>90008361</bdi> طبق پاسخ پشتیبانی فراز استفاده می‌شود. برای خط اختصاصی، شماره مجاز حساب را وارد کنید. نام پارامترها باید دقیقاً مطابق پنل باشند.</p></div>}
    <label className="check-row check-card"><input type="checkbox" checked={form.smsEnabled} onChange={event=>update({smsEnabled:event.target.checked})}/>فعال‌سازی ارسال پیامک‌های کلینیک</label>
    <p className="form-hint">پترن‌ها باید تأیید شده باشند. تغییر سرویس، ارسال را تا فعال‌سازی مجدد غیرفعال می‌کند. ذخیره تنظیمات پیامک نمی‌فرستد.</p>
  </FormSection>
  {form.smsProvider==='faraz'&&<SMSTest savedSettings={savedSettings} dirty={dirty}/>}
  </div>;
}
function SMSTest({savedSettings,dirty}:{savedSettings:ClinicSettings;dirty:boolean}) {
  const options=patternKeys.filter(key=>savedSettings[key].code);
  const [recipient,setRecipient]=useState(''),[pattern,setPattern]=useState<PatternKey>(options.includes('vaccinePattern')?'vaccinePattern':options[0]||'vaccinePattern');
  const [values,setValues]=useState({pet:'آزمایش',date:formatDate(todayISO()),clinic:savedSettings.clinicName,phone:savedSettings.clinicPhone,action:'آزمایش'});
  const [busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[result,setResult]=useState<SmsResult>(),[error,setError]=useState('');
  const lock=useRef(false);
  const ready=!dirty&&savedSettings.smsProvider==='faraz'&&savedSettings.smsEnabled&&Boolean(savedSettings[pattern].code);
  async function send() {
    setConfirm(false);if(lock.current)return;lock.current=true;setBusy(true);setResult(undefined);setError('');
    try {const response=await fetch('/api/settings/sms-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),recipient,pattern,values})});setResult(await response.json());}
    catch {setResult({status:'unknown',reason:'ارتباط قطع شد؛ پیش از تلاش جدید پنل فراز را بررسی کنید.'});}
    finally {lock.current=false;setBusy(false);}
  }
  return <FormSection title="ارسال پیامک آزمایشی" description="یک ارسال واقعی با تنظیمات ذخیره‌شده؛ فقط به شماره خودتان." className="sms-test" action={<Send size={18} aria-hidden="true"/>}>
    {dirty&&<div className="inline-notice notice-warning"><Info size={17}/><p>قبل از تست، تغییرات تنظیمات را ذخیره کنید.</p></div>}
    {!savedSettings.smsEnabled&&<p className="form-hint">برای تست، ارسال پیامک را فعال و تنظیمات را ذخیره کنید.</p>}
    <fieldset disabled={busy}><div className="form-grid"><label>شماره موبایل خودتان<input type="tel" dir="ltr" value={recipient} onChange={event=>setRecipient(event.target.value)} maxLength={30} autoComplete="tel" placeholder="0912…"/></label><label>پترن ذخیره‌شده<select value={pattern} onChange={event=>setPattern(event.target.value as PatternKey)}>{options.length?options.map(key=><option key={key} value={key}>{patternTitles[key]} — {savedSettings[key].code}</option>):<option value="vaccinePattern">پترنی ذخیره نشده است</option>}</select></label></div>
    <details className="test-values"><summary>مقادیر آزمایشی پارامترها</summary><div className="form-grid">{variableNames.map(name=><label key={name}>{variableLabels[name]}<input dir={name==='phone'?'ltr':undefined} value={values[name]} onChange={event=>setValues({...values,[name]:event.target.value})} maxLength={name==='phone'?30:name==='date'?40:name==='pet'?80:100}/></label>)}</div></details>
    <div className="form-actions"><button type="button" disabled={busy||!ready} onClick={()=>{setError('');if(!normalizePhone(recipient)){setError('شماره موبایل معتبر وارد کنید.');return;}if(Object.values(values).some(value=>!value.trim())){setError('تمام مقادیر آزمایشی را وارد کنید.');return;}setConfirm(true);}}><Send size={16}/><SavingLabel busy={busy} label="ارسال پیامک آزمایشی" pending="در حال ارسال…"/></button></div></fieldset>
    <p className="form-hint">این ارسال هزینه دارد. پذیرش سرویس به معنی تحویل نیست؛ در نتیجه نامشخص، پیش از تلاش جدید پنل فراز را بررسی کنید. درخواست خودکار تکرار نمی‌شود.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {result&&<div className="test-result" role="status"><StatusBadge tone={result.status==='accepted'?'success':result.status==='rejected'?'error':'warning'}>{result.status==='accepted'?<><Check size={12}/>پذیرفته شد</>:result.status==='rejected'?'رد شد':'نامشخص'}</StatusBadge><p>{result.status==='accepted'?<>شناسه پیام: <bdi>{result.messageId}</bdi></>:result.reason}</p></div>}
    {confirm&&<ConfirmationDialog title="ارسال واقعی پیامک؟" description={`یک پیامک با قالب ذخیره‌شده «${patternTitles[pattern]}» به ${recipient} ارسال می‌شود و هزینه دارد.`} confirmLabel="تأیید و ارسال" onCancel={()=>setConfirm(false)} onConfirm={()=>void send()}/>}
  </FormSection>;
}
