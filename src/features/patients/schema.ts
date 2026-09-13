import { z } from 'zod';
import { normalizePhone } from '@/lib/clinic';

export const createPatientSchema = z.object({
  name: z.string().trim().min(1, 'نام حیوان را وارد کنید.').max(80),
  species: z.enum(['dog', 'cat', 'bird', 'other']),
  owner: z.string().trim().min(2, 'نام صاحب حیوان را وارد کنید.').max(120),
  phone: z.string().max(30).transform(normalizePhone)
    .pipe(z.string({ error: 'شماره موبایل معتبر وارد کنید.' })),
}).strict();
