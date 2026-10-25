'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, BellRing, CalendarClock } from 'lucide-react';
import { useClinic } from './clinic-provider';
import { formatDate } from '@/lib/clinic';
import { PageHeader, EmptyState, StatusBadge } from './workspace/primitives';
import { ConfirmationDialog } from './workspace/confirm-dialog';
export function RemindersList({today}:{today:string}) {
  const {patients,records,completeReminder,busy}=useClinic();
  const [confirm,setConfirm]=useState<string|null>(null),[completing,setCompleting]=useState<string|null>(null);
  const due=useMemo(()=>records.filter(record=>((record.kind==='vaccine'||record.kind==='visit')&&record.nextDate&&!record.completed)||(record.kind==='reminder'&&!record.completed)).sort((a,b)=>(a.nextDate||a.date).localeCompare(b.nextDate||b.date)),[records]);
  const patientNames=useMemo(()=>new Map(patients.map(patient=>[patient.id,patient.name])),[patients]);
  return <><PageHeader eyebrow="برنامه مراقبت" title="یادآوری‌ها" description="موعد واکسن، مراجعه بعدی و اقدام‌های برنامه‌ریزی‌شده." action={<StatusBadge>{due.length.toLocaleString('fa-IR')} مورد</StatusBadge>}/><section className="panel">{due.length?due.map(record=><article className="reminder-card" key={record.id}><div><StatusBadge tone={(record.nextDate||record.date)<today?'warning':(record.nextDate||record.date)===today?'success':'neutral'}>{(record.nextDate||record.date)<today?'عقب‌افتاده':(record.nextDate||record.date)===today?'امروز':'پیش رو'}</StatusBadge><h2>{record.title}</h2><Link href={`/patients/${record.petId}`}>پرونده {patientNames.get(record.petId)} <ArrowLeft size={13} aria-hidden="true"/></Link><time dateTime={record.nextDate||record.date}><CalendarClock size={13} aria-hidden="true"/> {formatDate(record.nextDate||record.date)} {record.dueTime&&<bdi>{record.dueTime}</bdi>}</time></div>{record.kind==='reminder'&&<div className="form-actions"><button disabled={busy} onClick={()=>setConfirm(record.id)}>{completing===record.id?'در حال ثبت…':'انجام شد'}</button></div>}</article>):<EmptyState icon={BellRing} title="برنامه مراقبت هنوز خالی است" description="از پرونده بیمار، موعد واکسن یا یادآوری اقدام موردنظر را ثبت کنید." action={<Link className="primary" href="/patients">رفتن به بیماران <ArrowLeft size={15}/></Link>}/>}</section>{confirm&&<ConfirmationDialog title="تأیید انجام پیگیری" description="با علامت‌گذاری به‌عنوان انجام‌شده، پیامک آینده این پیگیری لغو می‌شود." confirmLabel="انجام شده است" onCancel={()=>setConfirm(null)} onConfirm={async()=>{const id=confirm;setConfirm(null);setCompleting(id);try{await completeReminder(id);}finally{setCompleting(null);}}}/>}</>;
}
