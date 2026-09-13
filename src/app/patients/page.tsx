import { ClinicDashboard } from '@/components/clinic-dashboard';
import { todayISO } from '@/lib/clinic';
export const dynamic = 'force-dynamic';
export default function Patients() { return <ClinicDashboard today={todayISO()} patientsOnly />; }
