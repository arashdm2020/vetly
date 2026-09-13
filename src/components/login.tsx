'use client';
import { useState } from 'react';
import { login } from '@/features/auth/actions';
export function Login() {
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  return <main className="login-page"><section className="panel registration"><h1>ورود به وتلی</h1><p className="muted">ورود کارکنان کلینیک</p><form onSubmit={async event=>{event.preventDefault();const password=String(new FormData(event.currentTarget).get('password')||'');setBusy(true);try{const result=await login(password);setError(result.error);}catch{setError('ارتباط برقرار نشد.');}finally{setBusy(false);}}}><label>رمز ورود<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>{error&&<p role="alert" className="error">{error}</p>}<button disabled={busy} className="primary">{busy?'در حال ورود…':'ورود'}</button></form></section></main>;
}
