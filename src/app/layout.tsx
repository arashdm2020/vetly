import type { Metadata } from "next";
import "./globals.css";
import { Vazirmatn } from 'next/font/google';
import { ClinicProvider } from '@/components/clinic-provider';
import { Shell } from '@/components/shell';
import { authenticated, authConfigured, localDevelopment } from '@/lib/auth';
import { clinicSnapshot } from '@/features/clinic/service';
import { Login } from '@/components/login';

const vazirmatn = Vazirmatn({ subsets: ['arabic', 'latin'], display: 'swap', variable: '--font-vazirmatn' });

export const metadata: Metadata = { title: "Vetly | مدیریت کلینیک", description: "مدیریت ساده کلینیک دامپزشکی" };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let content: React.ReactNode;
  if (!localDevelopment() && !authConfigured()) {
    content = <main><section className="panel registration"><h1>راه‌اندازی کلینیک</h1><p>دسترسی کلینیک هنوز تنظیم نشده است. با مسئول راه‌اندازی تماس بگیرید.</p></section></main>;
  } else if (!await authenticated()) {
    content = <Login />;
  } else {
    let initial: Awaited<ReturnType<typeof clinicSnapshot>> | null = null;
    try {
      initial = await clinicSnapshot();
    } catch { /* Display a safe setup state without exposing database errors. */ }
    content = initial
      ? <ClinicProvider initial={initial}><Shell>{children}</Shell></ClinicProvider>
      : <main><section className="panel registration"><h1>ارتباط با اطلاعات کلینیک برقرار نشد</h1><p>لطفاً اتصال پایگاه داده و راه‌اندازی اولیه را بررسی کنید.</p></section></main>;
  }
  // Browser extensions can inject root attributes (for example data-kantu).
  // This escape hatch is root-only; descendant hydration checks remain enabled.
  return <html lang="fa" dir="rtl" className={vazirmatn.variable} suppressHydrationWarning><body>{content}</body></html>;
}
