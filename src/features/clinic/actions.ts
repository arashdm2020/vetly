'use server';
import { z } from 'zod';
import { requireClinic } from '@/lib/auth';
import { clinicSnapshot, createRecord, completeTask } from './service';
import { createPatient } from '@/features/patients/service';
import { saveClinicSettings } from '@/features/settings/service';
import { revalidatePath } from 'next/cache';

async function mutation(operation:()=>Promise<unknown>) {
  try {
    await requireClinic(); await operation(); revalidatePath('/', 'layout');
    return {ok:true as const, snapshot:await clinicSnapshot()};
  } catch(error) {
    if(error instanceof z.ZodError) return {ok:false as const,error:'اطلاعات واردشده معتبر نیست. نام‌ها، شماره‌ها و تنظیمات پترن را بررسی کنید.'};
    const message=error instanceof Error?error.message:'';
    // Do not pass provider errors, queries, credentials or stacks to the browser.
    return {ok:false as const,error:/^[آ-ی]/.test(message)?message:'ذخیره انجام نشد. اتصال را بررسی کرده و دوباره تلاش کنید.'};
  }
}
export async function registerPatient(input: unknown) {return mutation(()=>createPatient(input));}
export async function registerRecord(input: unknown) {return mutation(()=>createRecord(input));}
export async function finishReminder(id: string) {return mutation(()=>completeTask(id));}
export async function updateSettings(input: unknown, apiKey: string) {
  return mutation(()=>saveClinicSettings(input,z.string().trim().max(512).regex(/^[a-zA-Z0-9._-]*$/).parse(apiKey)));
}
