'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, PawPrint, CalendarDays, BellRing, Settings2, HeartPulse, LogOut, ChevronLeft, ShieldCheck } from 'lucide-react';
import { useClinic } from './clinic-provider';
import { logout } from '@/features/auth/actions';
const links = [
  {href:'/',title:'نمای کلی',icon:House}, {href:'/patients',title:'بیماران',icon:PawPrint},
  {href:'/appointments',title:'نوبت‌ها',icon:CalendarDays}, {href:'/reminders',title:'یادآوری‌ها',icon:BellRing},
  {href:'/settings',title:'تنظیمات',icon:Settings2},
];
export function Shell({children}:{children:React.ReactNode}) {
  const path=usePathname();
  const {settings,error}=useClinic();
  const current=links.find(link=>link.href==='/'?path==='/':path.startsWith(link.href));
  return <div className="app-shell">
    <a className="skip-link" href="#main">رفتن به محتوای اصلی</a>
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="وتلی، صفحه اصلی"><span className="brand-mark"><HeartPulse size={25} strokeWidth={1.8}/></span><span>وتلی<small>همراه روزهای کلینیک</small></span><b className="brand-en">vetly</b></Link>
      <div className="sidebar-clinic"><span className="clinic-monogram"><PawPrint size={20}/></span><div><strong>{settings.clinicName}</strong><small>فضای مدیریت کلینیک</small></div></div>
      <p className="nav-heading">مدیریت روزانه</p>
      <nav aria-label="منوی اصلی">{links.map(({href,title,icon:Icon})=><Link key={href} href={href} aria-current={(href==='/'?path==='/':path.startsWith(href))?'page':undefined}><Icon size={20} strokeWidth={1.7} aria-hidden="true"/><span>{title}</span><ChevronLeft size={14} className="nav-chevron" aria-hidden="true"/></Link>)}</nav>
      <div className="sidebar-note"><div className="sidebar-care"><HeartPulse size={21}/><strong>فرصتی بیشتر برای مراقبت</strong></div><p>نظم در کارهای روزانه؛ تمرکز بیشتر روی سلامت حیوانات.</p></div>
      <div className="sidebar-account"><span className="admin-avatar">م</span><div><strong>مدیریت کلینیک</strong><small><ShieldCheck size={12}/> فضای کاری کلینیک</small></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="workspace-breadcrumb"><span className="muted">فضای کاری</span><ChevronLeft size={14}/><strong>{current?.title||'پرونده بیمار'}</strong></div><div className="topbar-actions"><span className="topbar-clinic">{settings.clinicName}</span><span className="topbar-divider"/><button className="logout-button" onClick={()=>logout()}><LogOut size={17}/><span>خروج</span></button></div></header>
      {error&&<div role="alert" className="error">{error}</div>}<main id="main">{children}</main><footer>وتلی · فرصتی بیشتر برای مراقبت</footer>
    </div>
  </div>;
}
