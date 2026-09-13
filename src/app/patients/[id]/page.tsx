import { PatientProfile } from '@/components/patient-profile';
import { todayISO } from '@/lib/clinic';
export const dynamic = 'force-dynamic';
export default async function PatientPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <PatientProfile id={id} today={todayISO()} />; }
