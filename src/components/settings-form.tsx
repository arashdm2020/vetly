'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Building2, Check, FileText, Info, MessageSquare, PawPrint, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useClinic } from './clinic-provider';
import { clinicSettingsSchema, type ClinicSettings } from '@/features/settings/schema';
import { PageHeader, FormSection, StatusBadge, SavingLabel } from './workspace/primitives';
import { SectionNavigation } from './workspace/section-navigation';
import { ConfirmationDialog } from './workspace/confirm-dialog';
import { SMSTemplateEditor, patternKeys, type PatternKey } from './settings/template-editor';
import { SMSProviderSettings } from './settings/provider-settings';
const sections=[
  {id:'profile',title:'مشخصات کلینیک',detail:'نام و اطلاعات تماس',icon:Building2,scope:'عمومی'},
  {id:'animals',title:'نوع‌های حیوان',detail:'گزینه‌های ثبت بیمار',icon:PawPrint,scope:'عمومی'},
  {id:'provider',title:'سرویس پیامک',detail:'اتصال، دسترسی و تست',icon:MessageSquare,scope:'مدیریتی'},
  {id:'templates',title:'قالب‌های پیامک',detail:'متن و نگاشت پارامترها',icon:FileText,scope:'مدیریتی'},
  {id:'schedule',title:'زمان‌بندی یادآوری',detail:'قاعده ارسال پیام‌ها',icon:BellRing,scope:'عمومی'},
] as const;
type Section=typeof sections[number]['id'];

export function SettingsForm() {
  const {settings,keys,saveSettings,busy,error}=useClinic();
  const router=useRouter();
  const [form,setForm]=useState<ClinicSettings>(settings),[baseline,setBaseline]=useState(settings);
  const [apiKey,setApiKey]=useState(''),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[syncAfterSave,setSyncAfterSave]=useState(false);
  const [section,setSection]=useState<Section>('profile'),[pattern,setPattern]=useState<PatternKey>('registrationPattern');
  const [attempted,setAttempted]=useState(false),[validation,setValidation]=useState('');
  const [leaving,setLeaving]=useState<string|null>(null),[discard,setDiscard]=useState(false);
  const dirty=JSON.stringify(form)!==JSON.stringify(baseline)||Boolean(apiKey);
  const remoteChanged=JSON.stringify(settings)!==JSON.stringify(baseline);
  // One complete draft preserves the existing whole-object save contract. Never silently
  // overwrite dirty edits with a new context snapshot. Normalize only after confirmed save.
  if(syncAfterSave||(!dirty&&remoteChanged)) {
    setForm(settings);setBaseline(settings);if(syncAfterSave)setSyncAfterSave(false);
  }
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    const navigate=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const anchor=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
      if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
      const url=new URL(anchor.href,location.href);
      if(url.origin!==location.origin||url.pathname===location.pathname)return;
      event.preventDefault();event.stopPropagation();setLeaving(url.pathname+url.search+url.hash);
    };
    window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
    return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true);};
  },[dirty]);
  const update=(patch:Partial<ClinicSettings>)=>{setForm(current=>({...current,...patch}));setSaved(false);setValidation('');};
  const current=sections.find(item=>item.id===section)!;const Icon=current.icon;
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(remoteChanged||busy)return;
    setAttempted(true);setSaved(false);setValidation('');
    const parsed=clinicSettingsSchema.safeParse(form);
    if(!parsed.success) {
      const issue=parsed.error.issues[0],field=String(issue.path[0]??'');
      let target:Section=field==='customSpecies'?'animals':field==='clinicName'||field==='clinicPhone'?'profile':field.endsWith('Pattern')?'templates':'provider';
      if(form.smsEnabled&&(!form.vaccinePattern.code||!form.taskPattern.code)){target='templates';setPattern(!form.vaccinePattern.code?'vaccinePattern':'taskPattern');}
      else if(patternKeys.includes(field as PatternKey))setPattern(field as PatternKey);
      setSection(target);setValidation(/^[آ-ی]/.test(issue.message)?issue.message:'اطلاعات این بخش معتبر نیست؛ نام پارامترها و مقادیر را بررسی کنید.');
      window.setTimeout(()=>document.querySelector<HTMLElement>(`[data-settings-section="${target}"] [aria-invalid="true"], [data-settings-section="${target}"] input`)?.focus(),0);return;
    }
    setSaving(true);
    try {if(await saveSettings(form,apiKey)){setApiKey('');setSaved(true);setAttempted(false);setSyncAfterSave(true);}}
    finally {setSaving(false);}
  }
  return <div className="settings-page"><PageHeader eyebrow="مدیریت فضای کاری" title="تنظیمات کلینیک" description="هر بخش، یک جای مشخص؛ تغییرات همه دسته‌ها با هم ذخیره می‌شوند." action={<StatusBadge><ShieldCheck size={13}/> تنظیمات کلینیک</StatusBadge>}/>
    <form className="settings-form" onSubmit={submit} noValidate>
      {remoteChanged&&dirty&&<div className="inline-notice notice-warning" role="alert"><Info size={18}/><div><p>تنظیمات ذخیره‌شده تغییر کرده است. برای جلوگیری از بازنویسی نسخه جدید، ابتدا آن را بارگذاری کنید.</p><button type="button" onClick={()=>setDiscard(true)}>بارگذاری تنظیمات جدید</button></div></div>}
      <div className="settings-layout"><aside className="settings-navigation"><p className="settings-nav-caption">دسته‌های تنظیمات</p><SectionNavigation items={sections} value={section} onChange={setSection} label="دسته‌بندی تنظیمات"/><div className="settings-navigation-note"><ShieldCheck size={16}/><p>سرویس و قالب‌های پیامک، تنظیمات مدیریتی‌اند. این دسته‌بندی سطح دسترسی جدیدی ایجاد نمی‌کند.</p></div></aside>
      <div className="settings-content"><div className="settings-section-heading"><span className="section-icon"><Icon size={21}/></span><div><h2>{current.title}</h2><p>{current.detail}</p></div><StatusBadge>{current.scope}</StatusBadge></div>
        {(validation||(attempted&&!saving&&error))&&<p className="error" role="alert">{validation||error}</p>}
        <fieldset disabled={busy}>
          <div data-settings-section="profile" hidden={section!=='profile'}><FormSection title="هویت کلینیک" description="این اطلاعات در فضای کاری و پیامک‌های شما استفاده می‌شوند."><div className="form-grid"><label>نام کلینیک<input value={form.clinicName} onChange={event=>update({clinicName:event.target.value})} maxLength={100} autoComplete="organization" aria-invalid={attempted&&form.clinicName.trim().length<2}/></label><label>شماره تماس کلینیک<input type="tel" dir="ltr" maxLength={20} value={form.clinicPhone} onChange={event=>update({clinicPhone:event.target.value})} autoComplete="tel"/></label></div><div className="inline-notice"><Info size={17}/><p>زمان محلی کلینیک: تهران · تاریخ‌های نمایشی: شمسی. قالب ذخیره‌سازی تاریخ تغییر نمی‌کند.</p></div></FormSection></div>
          <div data-settings-section="animals" hidden={section!=='animals'}><AnimalTypes form={form} update={update}/></div>
          <div data-settings-section="provider" hidden={section!=='provider'}><SMSProviderSettings form={form} savedSettings={settings} keys={keys} apiKey={apiKey} setApiKey={value=>{setApiKey(value);setSaved(false);}} update={update} dirty={dirty}/></div>
          <div data-settings-section="templates" hidden={section!=='templates'}><SMSTemplateEditor form={form} update={update} selected={pattern} onSelect={setPattern} showErrors={attempted}/></div>
          <div data-settings-section="schedule" hidden={section!=='schedule'}><ReminderPolicy/></div>
        </fieldset>
        <div className="settings-help"><Info size={16}/><p>تغییر دسته، ویرایش‌های شما را نگه می‌دارد. «ذخیره همه تغییرات» کل پیش‌نویس را ذخیره می‌کند و پیامکی ارسال نمی‌کند.</p></div>
      </div></div>
      <div className="settings-savebar"><div className="save-status" role="status">{saved&&!dirty?<Check size={18}/>:<span className={'save-indicator'+(dirty?' is-dirty':'')}/>}<span><strong>{saving?'در حال ذخیره تنظیمات':saved&&!dirty?'تنظیمات ذخیره شد':dirty?'تغییرات ذخیره‌نشده دارید':'تنظیمات به‌روز است'}</strong><small>{dirty?'ویرایش‌های تمام دسته‌ها با هم ذخیره می‌شوند.':'برای ویرایش، یک دسته را انتخاب کنید.'}</small></span></div><button className="primary" type="submit" disabled={busy||!dirty||remoteChanged}><Save size={17}/><SavingLabel busy={saving} label="ذخیره همه تغییرات"/></button></div>
    </form>
    {leaving&&<ConfirmationDialog title="خروج بدون ذخیره؟" description="تغییرات تنظیمات هنوز ذخیره نشده‌اند. با خروج از صفحه، این پیش‌نویس از دست می‌رود." confirmLabel="خروج بدون ذخیره" onCancel={()=>setLeaving(null)} onConfirm={()=>{const destination=leaving;setLeaving(null);router.push(destination);}}/>}
    {discard&&<ConfirmationDialog title="بارگذاری نسخه جدید؟" description="ویرایش‌های ذخیره‌نشده و کلید جدید واردشده کنار گذاشته می‌شوند و تنظیمات ذخیره‌شده بارگذاری می‌شود." confirmLabel="بارگذاری نسخه جدید" onCancel={()=>setDiscard(false)} onConfirm={()=>{setForm(settings);setBaseline(settings);setApiKey('');setValidation('');setAttempted(false);setSaved(false);setDiscard(false);}}/>}
  </div>;
}
function AnimalTypes({form,update}:{form:ClinicSettings;update:(patch:Partial<ClinicSettings>)=>void}) {
  const [name,setName]=useState(''),[error,setError]=useState(''),[remove,setRemove]=useState<string|null>(null);
  function add(){const value=name.trim();if(!value||form.customSpecies.includes(value)||['سگ','گربه','پرنده','سایر'].includes(value)){setError('نام جدید و غیرتکراری وارد کنید.');return;}if(form.customSpecies.length>=100){setError('حداکثر ۱۰۰ نوع دلخواه مجاز است.');return;}update({customSpecies:[...form.customSpecies,value]});setName('');setError('');}
  return <FormSection title="گزینه‌های ثبت بیمار" description="نوع‌های دلخواه را به فهرست موجود اضافه کنید؛ سوابق بیماران تغییر نمی‌کنند."><div className="built-in-species">{['سگ','گربه','پرنده','سایر'].map(item=><StatusBadge key={item}>{item}</StatusBadge>)}</div><div className="species-editor"><label>نوع حیوان جدید<input maxLength={60} value={name} onChange={event=>{setName(event.target.value);setError('');}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}} placeholder="مثلاً خرگوش"/></label><button type="button" onClick={add}><Plus size={17}/>افزودن به فهرست</button></div>{error&&<p role="alert" className="error">{error}</p>}<ul className="species-options">{form.customSpecies.map(item=><li key={item}>{item}<button type="button" aria-label={'حذف '+item+' از گزینه‌ها'} onClick={()=>setRemove(item)}><Trash2 size={15}/></button></li>)}</ul>{!form.customSpecies.length&&<p className="form-hint">هنوز نوع دلخواهی اضافه نشده است.</p>}<p className="form-hint">حذف گزینه، نوع حیوان را در پرونده‌های قبلی تغییر نمی‌دهد. برای اعمال تغییرات، دکمه ذخیره را بزنید.</p>{remove&&<ConfirmationDialog title="حذف از گزینه‌ها؟" description={`«${remove}» از گزینه‌های ثبت بیمار حذف می‌شود؛ سوابق قبلی حفظ می‌شوند.`} confirmLabel="حذف از پیش‌نویس" danger onCancel={()=>setRemove(null)} onConfirm={()=>{update({customSpecies:form.customSpecies.filter(item=>item!==remove)});setRemove(null);}}/>}</FormSection>;
}
function ReminderPolicy() {
  return <FormSection title="قاعده فعلی ارسال" description="این قاعده در سرور ثابت است؛ کنترل زمان‌بندی جدیدی به تنظیمات اضافه نشده است." action={<StatusBadge>فقط خواندنی</StatusBadge>}><div className="policy-grid"><div className="policy-step"><span>۱</span><div><strong>پیام اول، هنگام ثبت</strong><p>پس از ذخیره موفق رکورد جدید، با فعال بودن پیامک.</p></div></div><div className="policy-step"><span>۲</span><div><strong>پیام دوم، نزدیک موعد</strong><p>بیش از ۲۴ ساعت تا موعد: ۲۴ ساعت قبل. بیش از ۳ تا ۲۴ ساعت: ۳ ساعت قبل. ۳ ساعت یا کمتر: در خود موعد.</p></div></div></div><div className="inline-notice"><Info size={17}/><p>همه زمان‌ها به وقت تهران‌اند. ساعت خالی، ساعت ثبت را مبنای تاریخ موعد قرار می‌دهد. مراجعه بدون موعد بعدی فقط پیام ثبت دارد. پیام‌های قبلی دوباره زمان‌بندی نمی‌شوند.</p></div><p className="form-hint">ارسال دوم نیازمند اجرای زمان‌بند سرور است. تأخیر اجرا یا پاسخ نامشخص به‌معنی تحویل نیست. غیرفعال‌کردن پیامک، ارسال‌های بعدی را متوقف می‌کند.</p></FormSection>;
}
