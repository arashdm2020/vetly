'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { sql, and, like, lt } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { settings } from '@/db/schema';
import { authConfigured, equalSecret, startSession } from '@/lib/auth';
export async function login(password: string) {
  try {
    if (!authConfigured() || typeof password !== 'string' || password.length > 256) return {error:'ورود در دسترس نیست.'};
    const database = getDatabase();
    const key = `login-attempt:${Math.floor(Date.now()/900000)}`;
    const [attempt] = await database.insert(settings).values({key,value:'1'}).onConflictDoUpdate({target:settings.key,set:{value:sql`cast(cast(${settings.value} as integer) + 1 as text)`}}).returning({value:settings.value});
    await database.delete(settings).where(and(like(settings.key,'login-attempt:%'), lt(settings.createdAt,Date.now()-86400000)));
    if (Number(attempt.value) > 20) return {error:'تعداد تلاش‌ها زیاد است. پانزده دقیقه دیگر تلاش کنید.'};
    if (!equalSecret(password, process.env.CLINIC_PASSWORD!)) return {error:'رمز ورود صحیح نیست.'};
    await startSession();
    revalidatePath('/', 'layout');
    return {error:''};
  } catch { return {error:'ورود انجام نشد. دوباره تلاش کنید.'}; }
}
export async function logout() { (await cookies()).delete('vetly-session'); revalidatePath('/', 'layout'); }
