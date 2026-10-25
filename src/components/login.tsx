'use client';
import { useState } from 'react';
import { HeartPulse, LockKeyhole } from 'lucide-react';
import { SavingLabel } from './workspace/primitives';
import { login } from '@/features/auth/actions';
export function Login() {
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  return <main className="login-page"><section className="panel registration"><div className="login-brand"><span className="brand-mark"><HeartPulse size={24}/></span><div><p className="eyebrow">همراه روزهای کلینیک</p><h1>ورود به وتلی</h1></div></div><p className="muted">ورود کارکنان کلینیک</p><form onSubmit={async event=>{event.preventDefault();const password=String(new FormData(event.currentTarget).get('password')||'');setBusy(true);try{const result=await login(password);setError(result.error);}catch{setError('ارتباط برقرار نشد.');}finally{setBusy(false);}}}><label>رمز ورود<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>{error&&<p role="alert" className="error">{error}</p>}<button disabled={busy} className="primary"><LockKeyhole size={17}/><SavingLabel busy={busy} label="ورود به فضای کاری" pending="در حال ورود…"/></button></form></section></main>;
}
