import 'server-only';
import { cookies } from 'next/headers';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export function authConfigured() { return (process.env.CLINIC_PASSWORD?.length ?? 0) >= 16 && (process.env.SESSION_SECRET?.length ?? 0) >= 32; }
export function localDevelopment() { return process.env.NODE_ENV === 'development' && !process.env.VERCEL && !process.env.CLINIC_PASSWORD; }
export function equalSecret(a: string, b: string) { return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()); }
function signature(value: string) { return createHmac('sha256', process.env.SESSION_SECRET!).update(`${value}:${process.env.CLINIC_PASSWORD}`).digest('hex'); }
export async function authenticated() {
  if (localDevelopment()) return true;
  if (!authConfigured()) return false;
  const value = (await cookies()).get('vetly-session')?.value ?? '';
  const [expires, mac] = value.split('.');
  return /^\d{13}$/.test(expires ?? '') && Number(expires) > Date.now() && Number(expires) <= Date.now() + 8*3600000 && equalSecret(mac ?? '', signature(expires));
}
export async function requireClinic() { if (!await authenticated()) throw new Error('برای ادامه، وارد حساب کلینیک شوید.'); }
export async function startSession() {
  const expires = String(Date.now() + 8*3600000);
  (await cookies()).set('vetly-session', `${expires}.${signature(expires)}`, {httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:8*3600});
}
