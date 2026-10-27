import { z } from 'zod';
import { digits, normalizePhone } from '@/lib/clinic';
export const recipientLimit=200; // Application limit, not a claimed provider quota.
export const announcementInput=z.object({
  requestId:z.uuid(),title:z.string().trim().min(1).max(100),text:z.string().trim().min(1).max(1600),
  sender:z.string().trim().transform(digits).pipe(z.string().regex(/^\d{1,20}$/,'شماره خط فرستنده معتبر وارد کنید.')),
  audience:z.enum(['none','all','dog','cat','selected']),petIds:z.array(z.uuid()).max(200).default([]),
  manual:z.array(z.object({name:z.string().trim().max(120),phone:z.string().max(30).transform(normalizePhone).pipe(z.string())}).strict()).max(200),
  consent:z.literal(true),
}).strict();
export type AnnouncementInput=z.input<typeof announcementInput>;
export const statusLabels:Record<string,string>={queued:'در صف نرم‌افزار',submitting:'ارسال در حال بررسی',accepted:'پذیرفته‌شده توسط فراز؛ تحویل تأیید نشده',rejected:'درخواست رد شد',unknown:'نتیجه نامشخص؛ پنل را بررسی کنید',cancelled:'لغوشده',
  unreported:'گزارش گیرنده دریافت نشده','not-started':'شروع نشده','in-queue':'در صف فراز',sent:'ارسال‌شده؛ تحویل تأیید نشده',delivered:'تحویل‌شده','send-failure':'ارسال ناموفق','delivery-failure':'تحویل ناموفق','delivery-undetermined':'تحویل نامشخص','system-error':'خطای سرویس',blacklist:'مسدودکننده تبلیغات',pending:'در انتظار بررسی','pending-approval':'در انتظار تأیید متن','waiting-for-approval':'در انتظار تأیید متن',approved:'تأییدشده'};
