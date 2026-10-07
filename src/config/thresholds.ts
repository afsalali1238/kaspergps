// Status rules and thresholds for the Kasper GPS prototype.
// These are placeholders refined in Task 13.
// All values in seconds/minutes as appropriate.

export const STALE_AFTER_SEC = 600; // 10 min
export const OFFLINE_AFTER_SEC = 1800; // 30 min
export const IDLE_SPEED_KMH = 3;
export const WORKING_LOAD_PCT = 25;
export const FUEL_DROP_PCT = 10; // drop within 15 min with ignition off
export const LOW_BATTERY_V = 3.6;
export const OVERSPEED_KMH = 90; // trucks
export const GEOFENCE_CONFIRM_READINGS = 2;
export const ETA_ROAD_FACTOR = 1.3;
export const ETA_ARRIVED_M = 200;
export const MUC_MAX_GAP_H = 24;
export const MUC_GAP_RULE = 'delta_disclosed';
export const MAINT_DUE_SOON_PCT = 10;
export const MAINT_DUE_SOON_DAYS = 14;
export const INVOICE_DUE_DAYS = 14;
export const VAT_PCT = 5;
export const PLAYBACK_DOWNSAMPLE_MAX = 5000;
export const PLAYBACK_INTERPOLATE_MAX_SEC = 120;

// Status thresholds in ms for use with the clock
export function staleAfterMs(nowMs: number): number {
  return nowMs - STALE_AFTER_SEC * 1000;
}

export function offlineAfterMs(nowMs: number): number {
  return nowMs - OFFLINE_AFTER_SEC * 1000;
}

export function isStale(lastReadingMs: number, nowMs: number): boolean {
  return lastReadingMs < staleAfterMs(nowMs) && lastReadingMs >= offlineAfterMs(nowMs);
}

export function isOffline(lastReadingMs: number, nowMs: number): boolean {
  return lastReadingMs < offlineAfterMs(nowMs);
}

export function isIdle(speedKmh: number): boolean {
  return speedKmh < IDLE_SPEED_KMH;
}
