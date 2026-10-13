// Simulated clock for the Kasper GPS prototype.
// All time must come from here. Date.now() and new Date() without args are banned elsewhere.
// Architecture rule 9.

import { startOfDay, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { ANCHOR_MS } from '@/server/seed/data';

const DUBAI_TZ = 'Asia/Dubai';

let _anchor: number | null = ANCHOR_MS;
let _offsetMs = 0;

export function setAnchor(ms: number): void {
  _anchor = ms;
  _offsetMs = 0;
}

export function getAnchor(): number {
  if (_anchor === null) {
    _anchor = Date.now();
  }
  return _anchor;
}

export function setOffsetMs(ms: number): void {
  _offsetMs = ms;
}

export function getOffsetMs(): number {
  return _offsetMs;
}

export function now(): number {
  const a = getAnchor();
  return a + _offsetMs;
}

export function dubaiNow(): Date {
  return toZonedTime(new Date(now()), DUBAI_TZ);
}

export function jump(ms: number): void {
  _offsetMs += ms;
}

export function jumpBackHours(h: number): void {
  _offsetMs -= h * 3600 * 1000;
}

export function jumpBackDays(d: number): void {
  _offsetMs -= d * 24 * 3600 * 1000;
}

export function jumpBackWeeks(w: number): void {
  _offsetMs -= w * 7 * 24 * 3600 * 1000;
}

export function jumpForwardHours(h: number): void {
  _offsetMs += h * 3600 * 1000;
}

export function jumpForwardDays(d: number): void {
  _offsetMs += d * 24 * 3600 * 1000;
}

export function resetOffset(): void {
  _offsetMs = 0;
}

export function setDubaiTime(iso: string): void {
  setAnchor(isoFromDubai(iso));
}

export function dubaiMsToDate(ms: number): Date {
  return toZonedTime(new Date(ms), DUBAI_TZ);
}

// formatInTimeZone formats the instant in Dubai directly. Converting to a
// "Dubai-shaped" Date first and then formatting with a Dubai zone would shift the
// time twice on any machine outside Dubai.
export function formatDubaiTime(ms: number): string {
  return formatInTimeZone(new Date(ms), DUBAI_TZ, 'HH:mm');
}

export function formatDubaiDate(ms: number): string {
  return formatInTimeZone(new Date(ms), DUBAI_TZ, 'd MMM');
}

/** Machine-readable Dubai calendar day (YYYY-MM-DD) — use this for keys, never formatDubaiDate. */
export function dubaiDateKey(ms: number): string {
  const d = toZonedTime(new Date(ms), DUBAI_TZ);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDubaiDateTime(ms: number): string {
  return `${formatDubaiDate(ms)} ${formatDubaiTime(ms)}`;
}

/** Dubai wall-clock time with its offset, e.g. 2026-10-09T19:00:00+04:00. Correct on any machine time zone. */
export function dubaiToIso(ms: number): string {
  return formatInTimeZone(new Date(ms), DUBAI_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * The instant for a Dubai wall-clock string. Dubai has no daylight saving, so a
 * string without an offset is read at +04:00; one with an offset is taken as written.
 * Parsing the offset ourselves keeps this the same on every machine time zone.
 */
export function isoFromDubai(iso: string): number {
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return Date.parse(hasOffset ? iso : `${iso}+04:00`);
}

export function startOfDubaiDay(ms: number): number {
  return fromZonedTime(startOfDay(toZonedTime(new Date(ms), DUBAI_TZ)), DUBAI_TZ).getTime();
}



export function startOfDubaiMonth(ms: number): number {
  const d = toZonedTime(new Date(ms), DUBAI_TZ);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return fromZonedTime(start, DUBAI_TZ).getTime();
}
export function hoursSinceDubai(ms: number): number {
  return differenceInHours(now(), ms);
}

export function minutesSinceDubai(ms: number): number {
  return differenceInMinutes(now(), ms);
}

export function differenceInDubaiHours(a: number, b: number): number {
  return differenceInHours(new Date(a), new Date(b));
}

export function differenceInDubaiDays(a: number, b: number): number {
  return differenceInDays(new Date(a), new Date(b));
}

export { DUBAI_TZ };
