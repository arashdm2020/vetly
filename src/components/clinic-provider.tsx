'use client';
import { createContext, useContext, useRef, useState } from 'react';
import type { Patient, RecordEntry } from '@/lib/clinic';
import type { ClinicSnapshot } from '@/features/clinic/service';
import type { ClinicSettings } from '@/features/settings/schema';
import { registerPatient, registerRecord, finishReminder, updateSettings, editPatientPhone } from '@/features/clinic/actions';

import type { ChangePatientPhoneInput } from '@/features/patients/schema';
import type { PhoneChangeResult } from '@/features/patients/change-phone';

type Context = ClinicSnapshot & {
  busy:boolean; error:string;
  editPhone:(input:ChangePatientPhoneInput)=>Promise<PhoneChangeResult|null>;
  addPatient:(patient:Patient)=>Promise<boolean>; addRecord:(record:RecordEntry)=>Promise<boolean>;
  completeReminder:(id:string)=>Promise<boolean>; saveSettings:(settings:ClinicSettings,key:string)=>Promise<boolean>;
};
const ClinicContext=createContext<Context|null>(null);
export function ClinicProvider({children,initial}:{children:React.ReactNode;initial:ClinicSnapshot}) {
  const [snapshot,setSnapshot]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  async function mutate(action:()=>ReturnType<typeof registerPatient>) {
    if(lock.current)return false;
    lock.current=true;setBusy(true);setError('');
    try { const result=await action();if(!result.ok){setError(result.error);return false;}setSnapshot(result.snapshot);return true; }
    catch {setError('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.');return false;}
    finally {lock.current=false;setBusy(false);}
  }
  return <ClinicContext.Provider value={{...snapshot,busy,error,
    editPhone:async input=>{
      if(lock.current)return null;
      lock.current=true;setBusy(true);setError('');
      try {const response=await editPatientPhone(input);if(!response.ok){setError(response.error);return null;}setSnapshot(response.snapshot);return response.result;}
      catch {setError('نتیجه ذخیره مشخص نیست؛ صفحه و پنل پیامکی را بررسی کنید.');return null;}
      finally {lock.current=false;setBusy(false);}
    },
    addPatient:({id: _id,...patient})=>{void _id;return mutate(()=>registerPatient(patient));},
    addRecord:record=>mutate(()=>registerRecord(record)),
    completeReminder:id=>mutate(()=>finishReminder(id)),
    saveSettings:(settings,key)=>mutate(()=>updateSettings(settings,key)),
  }}>{children}</ClinicContext.Provider>;
}
export function useClinic(){const value=useContext(ClinicContext);if(!value)throw new Error('ClinicProvider required');return value;}
