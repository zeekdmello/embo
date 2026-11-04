import type { BrandProcess, CalendarRule, ISODate, Weekday } from './types';

// All date math is done on plain 'YYYY-MM-DD' strings in UTC to avoid timezone drift.

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

export function weekday(d: ISODate): Weekday {
  return parseISO(d).getUTCDay() as Weekday;
}

export function daysInMonth(month: string): ISODate[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: ISODate[] = [];
  for (let i = 1; i <= count; i++) out.push(`${month}-${String(i).padStart(2, '0')}`);
  return out;
}

export function monthOf(d: ISODate): string {
  return d.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toISO(d).slice(0, 7);
}

export function isBetween(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to;
}

/** Monday of the week containing `d` (weeks run Mon–Sun). */
export function weekStart(d: ISODate): ISODate {
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

/** Splits a month's dates into Mon–Sun weeks (first/last may be partial). */
export function monthWeeks(month: string): ISODate[][] {
  const weeks: ISODate[][] = [];
  let current: ISODate[] = [];
  let currentStart = '';
  for (const d of daysInMonth(month)) {
    const ws = weekStart(d);
    if (ws !== currentStart && current.length) {
      weeks.push(current);
      current = [];
    }
    currentStart = ws;
    current.push(d);
  }
  if (current.length) weeks.push(current);
  return weeks;
}

/** Does a brand-process operate on this date? (the brand's calendar, not any employee's) */
export function operates(rule: CalendarRule, d: ISODate, isHoliday: boolean): boolean {
  const wd = weekday(d);
  switch (rule.mode) {
    case 'ALL_DAYS':
      return true;
    case 'NO_PH':
      return !isHoliday;
    case 'NO_SUN_NO_PH':
      return wd !== 0 && !isHoliday;
    case 'CUSTOM':
      return (rule.weekdays ?? []).includes(wd) && !(rule.holidaysOff && isHoliday);
  }
}

/** People required for a brand-process on a date (0 = closed). */
export function requiredStaff(bp: BrandProcess, d: ISODate, isHoliday: boolean): number {
  if (!operates(bp.rule, d, isHoliday)) return 0;
  const byDate = bp.dateMin?.[d];
  if (byDate !== undefined) return byDate;
  const byWeekday = bp.weekdayMin?.[weekday(d)];
  if (byWeekday !== undefined) return byWeekday;
  return bp.minStaff;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ruleLabel(rule: CalendarRule): string {
  switch (rule.mode) {
    case 'ALL_DAYS':
      return '365 days (incl. Sundays & holidays)';
    case 'NO_PH':
      return 'Every day except public holidays';
    case 'NO_SUN_NO_PH':
      return 'Mon–Sat, closed on public holidays';
    case 'CUSTOM':
      return `${(rule.weekdays ?? []).map((w) => WEEKDAY_SHORT[w]).join(', ') || 'No days'}${
        rule.holidaysOff ? ', closed on holidays' : ', open on holidays'
      }`;
  }
}

export function ruleShort(rule: CalendarRule): string {
  switch (rule.mode) {
    case 'ALL_DAYS':
      return '365';
    case 'NO_PH':
      return 'No PH';
    case 'NO_SUN_NO_PH':
      return 'Mon–Sat';
    case 'CUSTOM':
      return 'Custom';
  }
}

export function formatDate(d: ISODate): string {
  const x = parseISO(d);
  return `${WEEKDAY_SHORT[x.getUTCDay()]} ${x.getUTCDate()} ${x.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

export function formatMonth(month: string): string {
  return parseISO(`${month}-01`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
