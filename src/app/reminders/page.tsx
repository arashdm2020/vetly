import { RemindersList } from '@/components/reminders-list';
import { todayISO } from '@/lib/clinic';
export const dynamic='force-dynamic';
export default function Reminders(){return <RemindersList today={todayISO()}/>}
