// Simulated clock for the Kasper GPS prototype.
// All time must come from here. Date.now() and new Date() without args are banned elsewhere.
// Architecture rule 9.

import { startOfDay, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
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
  const d = new Date(iso);
  const anchorDate = fromZonedTime(d, DUBAI_TZ);
  setAnchor(anchorDate.getTime());
  _offsetMs = 0;
}

export function dubaiMsToDate(ms: number): Date {
  return toZonedTime(new Date(ms), DUBAI_TZ);
}

// toZonedTime already moves the wall clock to Dubai, so these read the shifted
// Date's local fields — passing `timeZone: DUBAI_TZ` as well would shift twice (+4h).
export function formatDubaiTime(ms: number): string {
  const d = toZonedTime(new Date(ms), DUBAI_TZ);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDubaiDate(ms: number): string {
  const d = toZonedTime(new Date(ms), DUBAI_TZ);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDubaiDateTime(ms: number): string {
  return `${formatDubaiDate(ms)} ${formatDubaiTime(ms)}`;
}

export function dubaiToIso(ms: number): string {
  return toZonedTime(new Date(ms), DUBAI_TZ).toISOString();
}

export function isoFromDubai(iso: string): number {
  return fromZonedTime(new Date(iso), DUBAI_TZ).getTime();
}

export function startOfDubaiMonth(ms: number): number {
  const d = toZonedTime(new Date(ms), DUBAI_TZ);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return fromZonedTime(d, DUBAI_TZ).getTime();
}

export function startOfDubaiDay(ms: number): number {
  return fromZonedTime(startOfDay(toZonedTime(new Date(ms), DUBAI_TZ)), DUBAI_TZ).getTime();
}

/** The Dubai hour (0-23) of a moment — used for schedule times. */
export function toDubaiHour(ms: number): number {
  return toZonedTime(new Date(ms), DUBAI_TZ).getHours();
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
