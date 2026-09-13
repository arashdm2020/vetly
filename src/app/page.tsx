import { ClinicDashboard } from '@/components/clinic-dashboard';
import { todayISO } from '@/lib/clinic';
export const dynamic = 'force-dynamic';
export default function Home() { return <ClinicDashboard today={todayISO()} />; }
