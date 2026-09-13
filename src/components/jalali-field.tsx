'use client';

import { useId, useRef, useState } from 'react';
import { formatDate, jalaliParts, toISO } from '@/lib/clinic';

const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export function JalaliField({ label, value, onChange, min, max }: {
  label: string; value: string; onChange: (value: string) => void;
  min?: string; max?: string;
}) {
  const id = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [view, setView] = useState(value);
  const [year, month] = jalaliParts(view);
  const first = toISO(year, month, 1);
  const start = (new Date(first + 'T12:00:00Z').getUTCDay() + 1) % 7;
  const count = month <= 6 ? 31 : month < 12 ? 30 : toISO(year, 12, 30) ? 30 : 29;
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
  function move(offset: number) {
    const target = month + offset;
    setView(toISO(target < 1 ? year - 1 : target > 12 ? year + 1 : year, target < 1 ? 12 : target > 12 ? 1 : target, 1));
  }
  function close() {
    if (details.current) details.current.open = false;
    trigger.current?.focus();
  }
  return <div className="calendar-field">
    <span id={id}>{label}</span>
    <details ref={details} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
      onToggle={event => { if (event.currentTarget.open) setView(value); }}>
      <summary ref={trigger} aria-labelledby={id}><span>{formatDate(value)}</span><span aria-hidden="true">▦</span></summary>
      <div className="calendar-popover" role="group" aria-label={'تقویم ' + label}>
        <div className="calendar-heading">
          <button type="button" aria-label="ماه قبل" onClick={() => move(-1)}>→</button>
          <strong aria-live="polite">{months[month - 1]} {year.toLocaleString('fa-IR', { useGrouping: false })}</strong>
          <button type="button" aria-label="ماه بعد" onClick={() => move(1)}>←</button>
        </div>
        <div className="calendar-days">
          {weekdays.map(day => <abbr key={day} title={day}>{day === 'پنجشنبه' ? 'پ' : day.slice(0, 1)}</abbr>)}
          {Array.from({ length: start }, (_, index) => <span key={'space' + index} />)}
          {Array.from({ length: count }, (_, index) => {
            const iso = new Date(Date.parse(first + 'T12:00:00Z') + index * 86400000).toISOString().slice(0, 10);
            return <button key={iso} type="button" disabled={!allowed(iso)} aria-label={formatDate(iso)}
              aria-pressed={iso === value} onClick={() => { onChange(iso); close(); }}>
              {(index + 1).toLocaleString('fa-IR')}
            </button>;
          })}
        </div>
        <button className="calendar-close" type="button" onClick={close}>بستن تقویم</button>
      </div>
    </details>
  </div>;
}
