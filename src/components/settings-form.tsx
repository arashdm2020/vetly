'use client';
import { useState } from 'react';
import { useClinic } from './clinic-provider';
import { renderTemplate, variableNames, type ClinicSettings } from '@/features/settings/schema';
const labels = {pet:'نام حیوان',date:'تاریخ',clinic:'نام کلینیک',phone:'تلفن کلینیک',action:'عنوان پیگیری'};

export function SettingsForm() {
  const {settings,keys,saveSettings,busy}=useClinic();
  const [form,setForm]=useState<ClinicSettings>(settings);
  const [apiKey,setApiKey]=useState(''),[saved,setSaved]=useState(false);
  const update=(patch:Partial<ClinicSettings>)=>{setForm({...form,...patch});setSaved(false);};
  const sample={pet:'میلو',date:'۲۲ شهریور ۱۴۰۵',clinic:form.clinicName,phone:form.clinicPhone||'شماره کلینیک',action:'بررسی مجدد'};
  return <><div className="page-heading"><div><p className="eyebrow">فضای کاری شما</p><h1>تنظیمات کلینیک</h1><p className="muted">مشخصات، پیامک‌ها و زمان‌بندی پیگیری‌ها</p></div></div>
  <form className="settings-form" onSubmit={async event=>{event.preventDefault();setSaved(false);if(await saveSettings(form,apiKey)){setSaved(true);setApiKey('');}}}>
    <fieldset disabled={busy}><section className="panel"><h2>مشخصات کلینیک</h2><div className="form-grid">
      <label>نام کلینیک<input value={form.clinicName} onChange={e=>update({clinicName:e.target.value})} required maxLength={100}/></label>
      <label>شماره تماس<input type="tel" dir="ltr" value={form.clinicPhone} onChange={e=>update({clinicPhone:e.target.value})} maxLength={20}/></label>
    </div><p className="muted">زمان‌بندی بر اساس ساعت تهران و تاریخ شمسی است.</p></section>
    <section className="panel"><h2>سرویس پیامکی</h2><div className="form-grid">
      <label>ارائه‌دهنده<select value={form.smsProvider} onChange={e=>{update({smsProvider:e.target.value as ClinicSettings['smsProvider'],smsEnabled:false});setApiKey('');}}>
        <option value="mock">بدون ارسال واقعی</option><option value="kavenegar">کاوه‌نگار</option><option value="smsir">SMS.ir</option>
      </select></label>
      <label>کلید API جدید<input type="password" autoComplete="new-password" dir="ltr" value={apiKey} disabled={form.smsProvider==='mock'} onChange={e=>{setApiKey(e.target.value);setSaved(false);}} maxLength={512} placeholder={keys[form.smsProvider]?'کلید ذخیره شده؛ برای تغییر وارد کنید':'کلید پنل پیامکی'}/></label>
    </div><p className="muted">{keys[form.smsProvider]?'کلید این سرویس ذخیره شده است. خالی گذاشتن فیلد، کلید قبلی را حفظ می‌کند.':'کلید هر سرویس جداگانه و رمزگذاری‌شده ذخیره می‌شود.'}</p>
    <label className="check-row"><input type="checkbox" checked={form.smsEnabled} onChange={e=>update({smsEnabled:e.target.checked})}/> فعال‌سازی ارسال پیامک یادآوری</label>
    <p className="muted">پترن‌ها باید در پنل سرویس تأیید شده باشند. ذخیره تنظیمات، پیامک ارسال نمی‌کند.</p></section>
    {(['vaccinePattern','taskPattern'] as const).map(key=><section className="panel" key={key}><h2>{key==='vaccinePattern'?'پیامک واکسیناسیون':'پیامک سایر پیگیری‌ها'}</h2>
      <div className="form-grid"><label>شناسه پترن در پنل<input value={form[key].code} dir="ltr" maxLength={80} onChange={e=>update({[key]:{...form[key],code:e.target.value}})} placeholder={form.smsProvider==='smsir'?'مثلاً 123456':'نام پترن تأییدشده'}/></label></div>
      <label>متن مرجع پترن<textarea rows={3} maxLength={500} value={form[key].text} onChange={e=>update({[key]:{...form[key],text:e.target.value}})}/></label>
      <p className="muted">متن واقعی از پترن تأییدشده پنل ارسال می‌شود؛ این متن را مطابق آن نگه دارید.</p>
      <div className="template-variables">{variableNames.map(v=><span className="pill" key={v}>{labels[v]}: <bdi>{'{'+v+'}'}</bdi></span>)}</div>
      <h3>پارامترهای پترن</h3><p className="muted">نام پارامترها را دقیقاً مطابق پنل وارد کنید؛ برای کاوه‌نگار: token، token2، token3، token10، token20.</p>
      {form[key].parameters.map((parameter,index)=><div className="parameter-row" key={index}>
        <label>نام پارامتر<input dir="ltr" value={parameter.name} maxLength={30} onChange={e=>update({[key]:{...form[key],parameters:form[key].parameters.map((p,i)=>i===index?{...p,name:e.target.value}:p)}})}/></label>
        <label>مقدار<select value={parameter.variable} onChange={e=>update({[key]:{...form[key],parameters:form[key].parameters.map((p,i)=>i===index?{...p,variable:e.target.value as typeof variableNames[number]}:p)}})}>{variableNames.map(v=><option key={v} value={v}>{labels[v]}</option>)}</select></label>
        <button type="button" aria-label={'حذف پارامتر '+(index+1)} disabled={form[key].parameters.length===1} onClick={()=>update({[key]:{...form[key],parameters:form[key].parameters.filter((_,i)=>i!==index)}})}>حذف</button>
      </div>)}
      <button type="button" disabled={form[key].parameters.length>=5} onClick={()=>update({[key]:{...form[key],parameters:[...form[key].parameters,{name:'',variable:'pet'}]}})}>+ پارامتر</button>
      <div className="message-sample"><span className="muted">نمونه متن پیامک</span><p>{renderTemplate(form[key].text,sample)}</p><small>{form[key].text.length.toLocaleString('fa-IR')} نویسه در متن مرجع</small></div>
    </section>)}
    <section className="panel"><h2>زمان یادآوری واکسن</h2><div className="offsets">{([7,1,0] as const).map(offset=><label className="check-row" key={offset}><input type="checkbox" checked={form.reminderOffsets.includes(offset)} onChange={e=>update({reminderOffsets:e.target.checked?[...form.reminderOffsets,offset]:form.reminderOffsets.filter(v=>v!==offset)})}/>{offset===0?'روز موعد':offset===1?'یک روز قبل':'هفت روز قبل'}</label>)}</div><p className="muted">تغییر زمان‌ها برای واکسن‌های جدید اعمال می‌شود. غیرفعال‌کردن ارسال، تمام ارسال‌های بعدی را متوقف می‌کند.</p></section>
    <div className="form-actions"><button disabled={busy} className="primary">{busy?'در حال ذخیره…':'ذخیره تنظیمات'}</button>{saved&&<p role="status" className="accent">تنظیمات ذخیره شد.</p>}</div></fieldset>
  </form></>;
}
