'use client';
import { useRef, useState } from 'react';
import { useClinic } from './clinic-provider';
import { renderTemplate, variableNames, type ClinicSettings } from '@/features/settings/schema';
import type { SmsResult } from '@/features/sms/providers';
const labels = {pet:'نام حیوان',date:'تاریخ',clinic:'نام کلینیک',phone:'تلفن کلینیک',action:'عنوان پیگیری'};

export function SettingsForm() {
  const {settings,keys,saveSettings,busy}=useClinic();
  const [form,setForm]=useState<ClinicSettings>(settings);
  const [apiKey,setApiKey]=useState(''),[saved,setSaved]=useState(false);
  const [speciesName,setSpeciesName]=useState(''),[speciesError,setSpeciesError]=useState('');
  const testLock=useRef(false);
  const [testBusy,setTestBusy]=useState(false),[recipient,setRecipient]=useState('');
  const [testPattern,setTestPattern]=useState<'registrationPattern'|'vaccinePattern'|'taskPattern'>('vaccinePattern');
  const [testValues,setTestValues]=useState({pet:'آزمایش',date:'۱۴۰۵/۰۸/۰۲',clinic:settings.clinicName,phone:settings.clinicPhone||'02100000000',action:'آزمایش'});
  const [testResult,setTestResult]=useState<SmsResult>();
  const update=(patch:Partial<ClinicSettings>)=>{setForm({...form,...patch});setSaved(false);};
  const sample={pet:'میلو',date:'۲۲ شهریور ۱۴۰۵',clinic:form.clinicName,phone:form.clinicPhone||'شماره کلینیک',action:'بررسی مجدد'};
  return <><div className="page-heading"><div><p className="eyebrow">فضای کاری شما</p><h1>تنظیمات کلینیک</h1><p className="muted">مشخصات، پیامک‌ها و زمان‌بندی پیگیری‌ها</p></div></div>
  <form className="settings-form" onSubmit={async event=>{event.preventDefault();setSaved(false);if(await saveSettings(form,apiKey)){setSaved(true);setApiKey('');}}}>
    <fieldset disabled={busy}><section className="panel"><h2>مشخصات کلینیک</h2><div className="form-grid">
      <label>نام کلینیک<input value={form.clinicName} onChange={e=>update({clinicName:e.target.value})} required maxLength={100}/></label>
      <label>شماره تماس<input type="tel" dir="ltr" value={form.clinicPhone} onChange={e=>update({clinicPhone:e.target.value})} maxLength={20}/></label>
    </div><p className="muted">زمان‌بندی بر اساس ساعت تهران و تاریخ شمسی است.</p></section>
    <section className="panel"><h2>نوع‌های دلخواه حیوان</h2><p className="muted">سگ، گربه، پرنده و سایر از قبل موجودند. نوع‌های دیگری مثل گاو، گوسفند یا جوجه را اضافه کنید.</p>
      <div className="species-editor"><label>نام نوع حیوان<input value={speciesName} maxLength={60} onChange={e=>{setSpeciesName(e.target.value);setSpeciesError('');}} placeholder="مثلاً گوسفند"/></label>
      <button type="button" onClick={()=>{const name=speciesName.trim();if(!name||form.customSpecies.includes(name)||['سگ','گربه','پرنده','سایر'].includes(name)){setSpeciesError('نام جدید و غیرتکراری وارد کنید.');return;}if(form.customSpecies.length>=100){setSpeciesError('حداکثر ۱۰۰ نوع دلخواه مجاز است.');return;}update({customSpecies:[...form.customSpecies,name]});setSpeciesName('');setSpeciesError('');}}>+ افزودن نوع حیوان</button></div>
      {speciesError&&<p role="alert" className="error">{speciesError}</p>}
      <ul className="species-options">{form.customSpecies.map(name=><li key={name}>{name} <button type="button" aria-label={'حذف '+name+' از گزینه‌ها'} onClick={()=>update({customSpecies:form.customSpecies.filter(item=>item!==name)})}>حذف از گزینه‌ها</button></li>)}</ul>
      <p className="muted">در پایان «ذخیره تنظیمات» را بزنید. حذف گزینه، نوع حیوان را در پرونده‌های قبلی تغییر نمی‌دهد.</p>
    </section>
    <section className="panel"><h2>سرویس پیامکی</h2><div className="form-grid">
      <label>ارائه‌دهنده<select value={form.smsProvider} onChange={e=>{update({smsProvider:e.target.value as ClinicSettings['smsProvider'],smsEnabled:false});setApiKey('');}}>
        <option value="mock">بدون ارسال واقعی</option><option value="kavenegar">کاوه‌نگار</option><option value="smsir">SMS.ir</option><option value="faraz">فراز اس‌ام‌اس</option>
      </select></label>
      {form.smsProvider==='faraz'&&<label>شماره خط فرستنده فراز<input dir="ltr" inputMode="numeric" maxLength={20} value={form.farazSender} onChange={e=>update({farazSender:e.target.value})} placeholder="اختیاری؛ پیش‌فرض 90008361"/></label>}<label>کلید API جدید<input type="password" autoComplete="new-password" dir="ltr" value={apiKey} disabled={form.smsProvider==='mock'} onChange={e=>{setApiKey(e.target.value);setSaved(false);}} maxLength={512} placeholder={keys[form.smsProvider]?'کلید ذخیره شده؛ برای تغییر وارد کنید':'کلید پنل پیامکی'}/></label>
    </div><p className="muted">{keys[form.smsProvider]?'کلید این سرویس ذخیره شده است. خالی گذاشتن فیلد، کلید قبلی را حفظ می‌کند.':'کلید هر سرویس جداگانه و رمزگذاری‌شده ذخیره می‌شود.'}</p>
    {form.smsProvider==='faraz'&&<p className="muted">کلید دسترسی API جدید فراز (ایران‌پیامک)، کد پترن تأییدشده را وارد کنید. اگر شماره خط فرستنده خالی باشد، خط خدماتی اشتراکی 90008361 (طبق پاسخ پشتیبانی فراز) استفاده می‌شود. برای استفاده از خط اختصاصی، شماره مجاز حساب را وارد کنید. نام پارامترها باید دقیقاً مطابق قالب پنل، بدون علامت‌های اطرافشان باشد.</p>}<label className="check-row"><input type="checkbox" checked={form.smsEnabled} onChange={e=>update({smsEnabled:e.target.checked})}/> فعال‌سازی ارسال پیامک‌های کلینیک</label>
    <p className="muted">پترن‌ها باید در پنل سرویس تأیید شده باشند. ذخیره تنظیمات، پیامک ارسال نمی‌کند.</p></section>
    {(['registrationPattern','vaccinePattern','taskPattern'] as const).map(key=><section className="panel" key={key}><h2>{key==='registrationPattern'?'پیامک ثبت پرونده':key==='vaccinePattern'?'پیامک واکسیناسیون':'پیامک سایر پیگیری‌ها'}</h2>
      {key==='registrationPattern'&&<p className="muted">پس از تنظیم قالب تأییدشده و فعال‌سازی پیامک، برای همه بیماران جدید خودکار ارسال می‌شود. خالی بودن شناسه یعنی ارسال ثبت پرونده آماده نیست. پرونده‌های قبلی پیامک نمی‌گیرند.</p>}<div className="form-grid"><label>شناسه پترن در پنل<input value={form[key].code} dir="ltr" maxLength={80} onChange={e=>update({[key]:{...form[key],code:e.target.value}})} placeholder={form.smsProvider==='smsir'?'مثلاً 123456':'نام پترن تأییدشده'}/></label></div>
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
    {form.smsProvider==='faraz'&&<section className="panel"><h2>ارسال پیامک آزمایشی</h2>
      <p className="muted">ارسال واقعی و دارای هزینه، فقط با تنظیمات ذخیره‌شده انجام می‌شود. اگر شماره فرستنده خالی باشد، خط اشتراکی 90008361 استفاده می‌شود. پذیرش به معنی تحویل نیست. در نتیجه نامشخص، پنل فراز را پیش از تلاش جدید بررسی کنید.</p>
      <label>شماره موبایل خودتان<input type="tel" dir="ltr" value={recipient} maxLength={30} onChange={e=>setRecipient(e.target.value)}/></label>
      <label>پترن ذخیره‌شده<select value={testPattern} onChange={e=>setTestPattern(e.target.value as typeof testPattern)}>
        {(['registrationPattern','vaccinePattern','taskPattern'] as const).filter(key=>settings[key].code).map(key=><option key={key} value={key}>{key==='registrationPattern'?'ثبت پرونده':key==='vaccinePattern'?'واکسن':'پیگیری'} — {settings[key].code}</option>)}
      </select></label>
      {variableNames.map(name=><label key={name}>{labels[name]} (مقدار آزمایش)<input value={testValues[name]} maxLength={name==='phone'?30:name==='date'?40:name==='pet'?80:100} onChange={e=>setTestValues({...testValues,[name]:e.target.value})}/></label>)}
      <button type="button" disabled={testBusy||!settings.smsEnabled||settings.smsProvider!=='faraz'||!settings[testPattern].code} onClick={async()=>{
        if(testLock.current)return;testLock.current=true;setTestBusy(true);setTestResult(undefined);
        try {
          const response=await fetch('/api/settings/sms-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),recipient,pattern:testPattern,values:testValues})});
          setTestResult(await response.json());
        } catch {setTestResult({status:'unknown',reason:'ارتباط قطع شد؛ پیش از تلاش جدید پنل فراز را بررسی کنید.'});}
        finally {testLock.current=false;setTestBusy(false);}
      }}>{testBusy?'در حال ارسال…':'ارسال پیامک آزمایشی'}</button>
      {testResult&&<p role="status">{testResult.status==='accepted'?'پذیرفته شد — شناسه پیام: '+testResult.messageId:testResult.status==='rejected'?'رد شد — '+testResult.reason:'نامشخص — '+testResult.reason}</p>}
    </section>}
    <section className="panel"><h2>قاعده ارسال پیامک</h2><p>برای رکورد جدید دارای موعد، یک پیام هنگام ثبت و یک پیام نزدیک موعد ارسال می‌شود.</p><ul><li>بیش از ۲۴ ساعت تا موعد: پیام دوم ۲۴ ساعت قبل.</li><li>از بیش از ۳ تا ۲۴ ساعت: پیام دوم ۳ ساعت قبل.</li><li>۳ ساعت یا کمتر: پیام دوم در خود موعد.</li></ul><p className="muted">زمان‌ها به وقت تهران هستند. ساعت خالی، ساعت ثبت را مبنای تاریخ موعد قرار می‌دهد. مراجعه بدون موعد بعدی فقط پیام ثبت دارد. این قاعده برای رکوردهای جدید است؛ پیام‌های قبلی دوباره زمان‌بندی نمی‌شوند. ارسال دوم نیازمند زمان‌بند فعال سرور است. ذخیره این تنظیمات پیامک ارسال نمی‌کند.</p></section>
    <div className="form-actions"><button disabled={busy} className="primary">{busy?'در حال ذخیره…':'ذخیره تنظیمات'}</button>{saved&&<p role="status" className="accent">تنظیمات ذخیره شد.</p>}</div></fieldset>
  </form></>;
}
