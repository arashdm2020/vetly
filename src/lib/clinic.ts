export const speciesLabels = { dog: 'سگ', cat: 'گربه', bird: 'پرنده', other: 'سایر' };
export const visitLabels = { examination: 'معاینه عمومی', followup: 'ویزیت مجدد', emergency: 'اورژانس', procedure: 'اقدام درمانی' };
export type Patient = { id: string; name: string; species: keyof typeof speciesLabels; owner: string; phone: string };
export type RecordEntry = { id: string; petId: string; kind: 'visit' | 'vaccine' | 'reminder'; title: string; date: string; nextDate: string; notes: string; diagnosis: string; treatment: string; medications: string; completed: boolean };
export function digits(value: string) { return value.replace(/[۰-۹٠-٩]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.includes(c) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c))); }
export function normalizePhone(value: string) { let phone = digits(value).replace(/[\s()-]/g, ''); phone = phone.replace(/^(\+98|0098|98)/, '0'); if (/^9\d{9}$/.test(phone)) phone = '0' + phone; return /^09\d{9}$/.test(phone) ? phone : null; }
export function formatDate(value: string) { return value ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(new Date(value + 'T12:00:00Z')) : 'ثبت نشده'; }
export function todayISO() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()); }
export function jalaliParts(iso: string) { const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {year:'numeric', month:'numeric', day:'numeric', timeZone:'UTC'}).formatToParts(new Date(iso+'T12:00:00Z')); return ['year','month','day'].map(type => Number(parts.find(p=>p.type===type)?.value)); }
export function toISO(year: number, month: number, day: number) { const start = Date.UTC(year+621,2,19); for(let offset=0;offset<370;offset++){ const iso=new Date(start+offset*86400000).toISOString().slice(0,10); const [y,m,d]=jalaliParts(iso); if(y===year&&m===month&&d===day)return iso; } return ''; }
