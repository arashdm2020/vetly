'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { useClinic } from './clinic-provider';
import { ConfirmationDialog } from './workspace/confirm-dialog';
import { speciesLabels, type Patient } from '@/lib/clinic';
import { createPatientSchema } from '@/features/patients/schema';

export function PatientDetailsEditor({patient}:{patient:Patient}) {
  const {updatePatient,deletePatient,settings,busy,error}=useClinic(),router=useRouter();
  const [editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[validation,setValidation]=useState('');
  const [name,setName]=useState(patient.name),[owner,setOwner]=useState(patient.owner);
  const [species,setSpecies]=useState(patient.customSpecies?'custom:'+patient.customSpecies:patient.species);
  const [expected,setExpected]=useState({name:patient.name,owner:patient.owner,species:patient.species,...(patient.customSpecies?{customSpecies:patient.customSpecies}:{})});
  const options=[...new Set([...settings.customSpecies,...(patient.customSpecies?[patient.customSpecies]:[])])];
  return <section className="panel registration" aria-label="مدیریت اطلاعات بیمار"><div className="section-heading"><h2>اطلاعات بیمار و صاحب حیوان</h2><div className="form-actions"><button type="button" disabled={busy} onClick={()=>{
    if(!editing){setName(patient.name);setOwner(patient.owner);setSpecies(patient.customSpecies?'custom:'+patient.customSpecies:patient.species);setExpected({name:patient.name,owner:patient.owner,species:patient.species,...(patient.customSpecies?{customSpecies:patient.customSpecies}:{})});}
    setEditing(!editing);setValidation('');
  }}><Pencil size={16}/>{editing?'بستن ویرایش':'ویرایش اطلاعات بیمار'}</button><button type="button" className="danger-button" disabled={busy} onClick={()=>setDeleting(true)}><Trash2 size={16}/>حذف بیمار</button></div></div>
  {editing&&<form noValidate onSubmit={async event=>{event.preventDefault();if(busy)return;setValidation('');
    const customSpecies=species.startsWith('custom:')?species.slice(7):undefined;
    const parsed=createPatientSchema.omit({phone:true}).safeParse({name,owner,species:customSpecies?'other':species,...(customSpecies?{customSpecies}:{})});
    if(!parsed.success){setValidation('نام حیوان، نام صاحب و نوع حیوان را کامل و معتبر وارد کنید.');return;}
    if(await updatePatient({id:patient.id,expected,patient:parsed.data}))setEditing(false);
  }}><fieldset disabled={busy} className="plain-fieldset"><div className="form-grid"><label>نام حیوان *<input value={name} onChange={event=>setName(event.target.value)} maxLength={80} autoFocus/></label><label>نوع حیوان *<select value={species} onChange={event=>setSpecies(event.target.value)}>{Object.entries(speciesLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}{options.map(value=><option key={value} value={'custom:'+value}>{value}</option>)}</select></label><label>نام و نام خانوادگی صاحب *<input value={owner} onChange={event=>setOwner(event.target.value)} maxLength={120}/></label></div><p className="form-hint">شماره موبایل از بخش «ویرایش شماره» در پایین همین صفحه تغییر می‌کند و پس از تغییر، پیامک ثبت پرونده ارسال می‌شود. تغییر نام صاحب برای سایر حیوان‌های متعلق به همین صاحب نیز اعمال می‌شود.</p>{validation&&<p className="error" role="alert">{validation}</p>}<div className="form-actions"><button type="submit" className="primary">{busy?'در حال ذخیره…':'ذخیره اطلاعات بیمار'}</button><button type="button" onClick={()=>setEditing(false)}>انصراف</button></div></fieldset></form>}
  {error&&<p className="error" role="alert">{error}</p>}
  {deleting&&<ConfirmationDialog danger title={`بیمار «${patient.name}» حذف شود؟`} description="پرونده بیمار، تمام مراجعه‌ها، واکسن‌ها، نوبت‌ها و یادآوری‌های آن برای همیشه حذف می‌شوند. پیامک‌های آینده این پرونده لغو می‌شوند. این کار قابل بازگشت نیست." confirmLabel="تأیید حذف بیمار و سوابق" onCancel={()=>setDeleting(false)} onConfirm={async()=>{if(busy)return;setDeleting(false);if(await deletePatient(patient.id))router.replace('/patients');}}/>}
  </section>;
}
