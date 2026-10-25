import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { PageHeader, EmptyState, StatusBadge } from '@/components/workspace/primitives';
export default function Appointments() {
  return <><PageHeader eyebrow="برنامه کلینیک" title="نوبت‌ها" description="دسترسی به برنامه مراجعه و پیگیری بیماران." action={<StatusBadge>هنوز فعال نشده</StatusBadge>}/><section className="panel coming-soon"><EmptyState icon={CalendarDays} title="نوبت‌دهی هنوز فعال نشده است" description="فعلاً می‌توانید زمان پیگیری یک اقدام را در پرونده بیمار ثبت کنید." action={<Link className="primary" href="/patients">پرونده‌های بیماران <ArrowLeft size={15}/></Link>}/></section></>;
}
