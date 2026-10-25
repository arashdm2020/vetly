const HOUR=3600000;
export function clinicClock(now:number) {
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
}
// Date-only appointments inherit the registration clock, rather than a fixed 09:00.
export function resolveDueAt(date:string,time:string,now:number) {
  return Date.parse(`${date}T${time?time+':00':clinicClock(now)}+03:30`)+(time?0:now%1000);
}
export function secondNotificationAt(dueAt:number,registeredAt:number) {
  const remaining=dueAt-registeredAt;
  if(remaining<=0)throw new Error('موعد باید در آینده باشد؛ برای موعد امروز ساعت را مشخص کنید.');
  if(remaining>24*HOUR)return dueAt-24*HOUR;
  if(remaining>3*HOUR)return dueAt-3*HOUR;
  return dueAt;
}
export function eventDateTime(at:number) {
  return new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'long',timeStyle:'short'}).format(at);
}
export function eventDate(at:number) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
}
