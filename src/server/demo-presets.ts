// Demo-only lookups: the clock "Jump to" presets, the scenario clock settings
// and the outside hirer's tracking path. They are computed from the live db,
// so a booking made in the demo moves the presets with it.

import { db } from '@/server/db';
import * as clock from '@/lib/clock';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { resolveEtaForLink } from '@/server/links';
import { OFFLINE_AFTER_SEC } from '@/config/thresholds';

export interface ClockPreset {
  label: string;
  hint: string;
  at: number;
}

function toMs(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'number' ? v : new Date(v).getTime();
}

function bookingFor(code: string, status: string) {
  const state = db.getState();
  const asset = state.assets.find(a => a.code === code);
  if (!asset) return null;
  return state.bookings.find(b => b.assetId === asset.id && b.status === status) ?? null;
}

function startOfThisMonthDubai(): number {
  const d = clock.dubaiMsToDate(clock.now());
  return clock.isoFromDubai(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00`);
}

function startOfLastMonthDubai(): number {
  const d = clock.dubaiMsToDate(clock.now());
  const m = d.getMonth() === 0 ? 12 : d.getMonth();
  const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  return clock.isoFromDubai(`${y}-${String(m).padStart(2, '0')}-01T00:00:00`);
}

/** Dubai wall-clock time yesterday at the given hour, as ms. */
export function dubaiYesterdayAt(hour: number): number {
  const nowDubai = clock.dubaiMsToDate(clock.now());
  const yesterday = new Date(nowDubai.getTime() - 86400000);
  const iso = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`;
  return clock.isoFromDubai(iso);
}

/** Every "Jump to" preset that applies to the current data, in menu order. */
export function clockPresets(): ClockPreset[] {
  const state = db.getState();
  const out: ClockPreset[] = [];
  const now = clock.now();

  const add = (label: string, at: number | null | undefined) => {
    if (at === null || at === undefined || !Number.isFinite(at)) return;
    out.push({ label, hint: clock.formatDubaiTime(at), at });
  };

  const ex07Start = bookingFor('EX-07', 'scheduled')?.start;
  const ex07Ms = ex07Start ? new Date(ex07Start).getTime() : null;
  add('EX-07 rental starts', ex07Ms);
  add('1 min before EX-07 rental starts', ex07Ms === null ? null : ex07Ms - 60000);

  const ex04 = bookingFor('EX-04', 'active');
  add('EX-04 rental ends', ex04 ? new Date(ex04.end).getTime() : null);

  const fb12Asset = state.assets.find(a => a.code === 'FB-12');
  const fb12Link = state.trackingLinks.find(l => l.assetId === fb12Asset?.id && l.revokedAt === undefined);
  if (fb12Link) add('FB-12 link expires', toMs(fb12Link.expiresAt));

  const tp22Asset = state.assets.find(a => a.code === 'TP-22');
  const tp22Link = state.trackingLinks.find(l => l.assetId === tp22Asset?.id);
  if (tp22Link) add('TP-22 24-hour link expires', toMs(tp22Link.expiresAt));

  const wt08 = state.assets.find(a => a.code === 'WT-08');
  if (wt08) {
    const readings = getReadingsForAsset(wt08, now - 3600000, now);
    const last = readings.length > 0 ? new Date(readings[readings.length - 1].deviceTime).getTime() : null;
    add('WT-08 goes offline', last === null ? null : last + OFFLINE_AFTER_SEC * 1000);
  }

  if (fb12Asset && fb12Link) {
    const booking = state.bookings.find(b => b.id === fb12Link.bookingId);
    const readings = getReadingsForAsset(fb12Asset, now - 3600000, now);
    const last = readings.length > 0 ? readings[readings.length - 1] : null;
    if (booking?.destination && last) {
      const eta = resolveEtaForLink(
        fb12Link, fb12Asset,
        { lat: last.lat, lng: last.lng, deviceTime: last.deviceTime },
        booking.destination.name, booking.destination, now
      );
      add('FB-12 arrives at Al Habtoor site', eta.state === 'arrived' ? now : eta.etaAt);
    }
  }

  add('Start of last month', startOfLastMonthDubai());
  add('End of last month', startOfThisMonthDubai() - 60000);

  const overdueInvoice = state.invoices.find(i => i.status === 'unpaid' || i.status === 'part_paid' || i.status === 'overdue');
  if (overdueInvoice) add(`${overdueInvoice.number} becomes overdue`, toMs(overdueInvoice.dueAt));

  return out;
}

/** The clock time of a preset, by its label, or null when it does not apply. */
export function presetAt(label: string): number | null {
  const preset = clockPresets().find(p => p.label === label);
  return preset ? preset.at : null;
}

/** The outside hirer's public path for FB-12, or null when it has no live link. */
export function fb12PublicPath(): string | null {
  const state = db.getState();
  const asset = state.assets.find(a => a.code === 'FB-12');
  const link = state.trackingLinks.find(l => l.assetId === asset?.id && l.revokedAt === undefined);
  return link ? `/t/${link.token}` : null;
}
