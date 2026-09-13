import { z } from 'zod';
import { digits } from '@/lib/clinic';
export const variableNames = ['pet', 'date', 'clinic', 'phone', 'action'] as const;
const template = z.string().trim().min(1, 'متن پیامک را وارد کنید.').max(500, 'متن پیامک حداکثر ۵۰۰ نویسه است.')
  .refine(value => [...value.matchAll(/\{([^{}]+)\}/g)].every(match => variableNames.includes(match[1] as typeof variableNames[number])), 'متغیر ناشناخته در متن پیامک وجود دارد.');
const pattern = z.object({
  text: template, code: z.string().trim().max(80).regex(/^[a-zA-Z0-9_-]*$/, 'شناسه پترن معتبر نیست.'),
  parameters: z.array(z.object({ name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/), variable: z.enum(variableNames) }).strict()).min(1).max(5)
    .refine(items => new Set(items.map(item => item.name)).size === items.length, 'نام پارامترها نباید تکراری باشد.'),
}).strict();
export const clinicSettingsSchema = z.object({
  clinicName: z.string().trim().min(2, 'نام کلینیک را وارد کنید.').max(100),
  clinicPhone: z.string().transform(value => digits(value).replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(/^(0\d{10})?$/, 'شماره تماس را همراه کد وارد کنید.')),
  timeZone: z.literal('Asia/Tehran'),
  reminderOffsets: z.array(z.union([z.literal(7), z.literal(1), z.literal(0)])).max(3)
    .refine(values => new Set(values).size === values.length, 'زمان‌های تکراری را حذف کنید.'),
  smsEnabled: z.boolean(), smsProvider: z.enum(['mock', 'kavenegar', 'smsir']),
  vaccinePattern: pattern, taskPattern: pattern,
}).strict().superRefine((value, context) => {
  if (!value.smsEnabled) return;
  if (value.smsProvider === 'mock') context.addIssue({code:'custom', message:'برای ارسال، سرویس پیامکی را انتخاب کنید.'});
  for (const item of [value.vaccinePattern, value.taskPattern]) {
    if (!item.code) context.addIssue({code:'custom', message:'شناسه پترن واکسن و پیگیری را وارد کنید.'});
    if (value.smsProvider === 'smsir' && !/^[1-9]\d*$/.test(item.code)) context.addIssue({code:'custom', message:'شناسه پترن SMS.ir باید عدد باشد.'});
    if (value.smsProvider === 'kavenegar' && (item.parameters.some(p => !['token','token2','token3','token10','token20'].includes(p.name)) || !item.parameters.some(p => p.name === 'token'))) context.addIssue({code:'custom', message:'پارامترهای کاوه‌نگار باید شامل token و فقط token، token2، token3، token10 یا token20 باشند.'});
  }
});
export type ClinicSettings = z.infer<typeof clinicSettingsSchema>;
export const defaultSettings: ClinicSettings = {
  clinicName: 'کلینیک دامپزشکی', clinicPhone: '', timeZone: 'Asia/Tehran', reminderOffsets: [7, 1], smsEnabled: false, smsProvider: 'mock',
  vaccinePattern: { text: 'یادآوری {clinic}\nموعد واکسیناسیون {pet}: {date}\nبرای هماهنگی: {phone}', code: '', parameters: [{name:'token',variable:'pet'}, {name:'token2',variable:'date'}] },
  taskPattern: { text: 'یادآوری {clinic}\n{action} برای {pet} در تاریخ {date}\nتماس: {phone}', code: '', parameters: [{name:'token',variable:'pet'}, {name:'token2',variable:'date'}, {name:'token10',variable:'action'}] },
};
export function renderTemplate(text: string, values: Record<typeof variableNames[number], string>) {
  return text.replace(/\{(pet|date|clinic|phone|action)\}/g, (_, name: typeof variableNames[number]) => values[name]);
}
