import * as clock from '@/lib/clock';
import { startOfMonth, endOfMonth } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/** Get the start of the current Dubai month (local helper for reports). */
export function startOfDubaiMonthLocal(ms: number): number {
  const DUBAI_TZ = 'Asia/Dubai';
  const d = toZonedTime(new Date(ms), DUBAI_TZ);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return clock.isoFromDubai(start.toISOString().replace('Z', '+04:00'));
}
