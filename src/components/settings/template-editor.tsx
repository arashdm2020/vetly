'use client';
import { useId, useState } from 'react';
import { Eye, FileText, Plus, Trash2, MessageSquareText } from 'lucide-react';
import { renderTemplate, variableNames, type ClinicSettings } from '@/features/settings/schema';
import { ConfirmationDialog } from '@/components/workspace/confirm-dialog';
import { FormSection, StatusBadge } from '@/components/workspace/primitives';
export const patternKeys=['registrationPattern','vaccinePattern','taskPattern'] as const;
export type PatternKey=typeof patternKeys[number];
export const patternTitles={registrationPattern:'ثبت پرونده',vaccinePattern:'واکسیناسیون',taskPattern:'پیگیری و یادآوری'};
export const variableLabels={pet:'نام حیوان',date:'تاریخ',clinic:'نام کلینیک',phone:'تلفن کلینیک',action:'عنوان پیگیری'};

export function SMSTemplateEditor({form,update,selected,onSelect,showErrors}:{form:ClinicSettings;update:(patch:Partial<ClinicSettings>)=>void;selected:PatternKey;onSelect:(key:PatternKey)=>void;showErrors:boolean}) {
  const id=useId(),[preview,setPreview]=useState(false),[removing,setRemoving]=useState<number|null>(null);
  const pattern=form[selected];
  const setPattern=(patch:Partial<typeof pattern>)=>update({[selected]:{...pattern,...patch}});
  const sample={pet:'نام حیوان',date:'تاریخ موعد',clinic:form.clinicName,phone:form.clinicPhone||'تلفن کلینیک',action:'عنوان پیگیری'};
  return <><div className="pattern-tabs" role="tablist" aria-label="دسته قالب پیامک" onKeyDown={event=>{
    const index=patternKeys.indexOf(selected);let next=index;
    if(event.key==='ArrowLeft')next=(index+1)%3;else if(event.key==='ArrowRight')next=(index+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
    event.preventDefault();onSelect(patternKeys[next]);document.getElementById(`${id}-${patternKeys[next]}`)?.focus();
  }}>{patternKeys.map(key=><button type="button" role="tab" id={`${id}-${key}`} aria-selected={selected===key} aria-controls={`${id}-panel`} tabIndex={selected===key?0:-1} key={key} onClick={()=>onSelect(key)}>{patternTitles[key]}{form[key].code&&<span className="configured-dot" aria-label="شناسه وارد شده"/>}</button>)}</div>
  <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${selected}`} tabIndex={0}>
    <div className="template-layout"><FormSection title={'قالب '+patternTitles[selected]} description="شناسه و نام پارامترها باید دقیقاً مطابق پنل سرویس باشند." className="template-editor" action={<FileText size={18} aria-hidden="true"/>}>
      {selected==='registrationPattern'&&<p className="form-hint">شناسه خالی، پیامک ثبت پرونده را غیرفعال نگه می‌دارد. برای پرونده‌های قبلی پیامکی ارسال نمی‌شود.</p>}
      <div className="form-grid"><label className="full-field">شناسه پترن<input dir="ltr" maxLength={80} value={pattern.code} onChange={event=>setPattern({code:event.target.value})} aria-invalid={showErrors&&form.smsEnabled&&selected!=='registrationPattern'&&!pattern.code} placeholder={form.smsProvider==='smsir'?'مثلاً 123456':'شناسه پترن تأییدشده'}/></label></div>
      <label>متن مرجع پیامک<textarea rows={4} maxLength={500} value={pattern.text} onChange={event=>setPattern({text:event.target.value})}/></label>
      <p className="form-hint">این متن برای پیش‌نمایش است؛ متن واقعی از پترن تأییدشده سرویس ارسال می‌شود.</p>
      <div className="template-variables" aria-label="متغیرهای قابل استفاده">{variableNames.map(name=><span className="pill" key={name}>{variableLabels[name]} <bdi>{'{'+name+'}'}</bdi></span>)}</div>
      <div className="parameter-heading"><h3>نگاشت پارامترها</h3><button type="button" disabled={pattern.parameters.length>=5} onClick={()=>setPattern({parameters:[...pattern.parameters,{name:'',variable:'pet'}]})}><Plus size={16}/> افزودن</button></div>
      <p className="form-hint">نام سمت راست برای سرویس ارسال می‌شود؛ مقدار از اطلاعات پرونده جایگزین می‌شود. نام‌ها خودکار تغییر نمی‌کنند.</p>
      <div className="parameter-list">{pattern.parameters.map((parameter,index)=><div className="parameter-row" key={`${selected}-${index}`}>
        <label>نام پارامتر<input dir="ltr" maxLength={30} value={parameter.name} onChange={event=>setPattern({parameters:pattern.parameters.map((item,i)=>i===index?{...item,name:event.target.value}:item)})} aria-invalid={showErrors&&!/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/.test(parameter.name)} placeholder="مطابق پنل سرویس"/></label>
        <label>مقدار متناظر<select value={parameter.variable} onChange={event=>setPattern({parameters:pattern.parameters.map((item,i)=>i===index?{...item,variable:event.target.value as typeof variableNames[number]}:item)})}>{variableNames.map(name=><option key={name} value={name}>{variableLabels[name]}</option>)}</select></label>
        <button type="button" className="icon-button" disabled={pattern.parameters.length===1} aria-label={'حذف پارامتر '+(parameter.name||index+1)} onClick={()=>setRemoving(index)}><Trash2 size={16}/></button>
      </div>)}</div>
      {form.smsProvider==='kavenegar'&&<p className="form-hint">کاوه‌نگار: token الزامی است؛ token2، token3، token10 و token20 نیز پشتیبانی می‌شوند.</p>}
      <button type="button" className="preview-toggle" aria-expanded={preview} aria-controls={`${id}-preview`} onClick={()=>setPreview(!preview)}><Eye size={17}/>{preview?'بستن پیش‌نمایش':'مشاهده پیش‌نمایش پیامک'}</button>
    </FormSection>
    <aside id={`${id}-preview`} className={'template-preview'+(preview?'':' preview-closed')} aria-label="پیش‌نمایش پیامک"><div className="preview-topline"><span><MessageSquareText size={16} aria-hidden="true"/> پیش‌نمایش پیام</span><StatusBadge>نمونه</StatusBadge></div><div className="message-bubble">{renderTemplate(pattern.text,sample)}</div><small>{pattern.text.length.toLocaleString('fa-IR')} نویسه در متن مرجع</small><p className="form-hint">مقادیر نمونه‌اند؛ پیش‌نمایش، پیامکی ارسال نمی‌کند و تأیید پترن یا تحویل را نشان نمی‌دهد.</p></aside>
    </div>
  </div>
  {removing!==null&&<ConfirmationDialog title="حذف نگاشت پارامتر؟" description={`پارامتر «${pattern.parameters[removing]?.name||'بدون نام'}» از پیش‌نویس حذف می‌شود. پترن سرویس ممکن است به این پارامتر نیاز داشته باشد.`} confirmLabel="حذف از پیش‌نویس" danger onCancel={()=>setRemoving(null)} onConfirm={()=>{setPattern({parameters:pattern.parameters.filter((_,i)=>i!==removing)});setRemoving(null);}}/>}
  </>;
}
