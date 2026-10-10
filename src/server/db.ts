// The demo database: one reactive, persisted store for every mutable entity.
//
// Rules (F1 of the fix prompt):
//  - Every module in src/server/** reads and writes through `db`. Nothing
//    assigns into `seed` after start-up — `seed` is only the initial value.
//  - The whole db is persisted to localStorage under `kasper.db.v1`. Stored
//    data carries a `version`; a different version rebuilds from the seed.
//  - Screens subscribe with `useDb(selector)`; any write re-renders them.
//  - Telemetry is never stored. It is generated on demand from the db.
//
// Writes are either immutable (`append`, `removeWhere`, `db.setState`) or an
// in-place edit of a row followed by `touch(...)`, which gives subscribers a
// new array reference and persists the change. The in-place style keeps the
// existing server modules, and the tests that hold row references, unchanged.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Tenant, Site, User, Asset, Tracker, Pairing, CanAdapter, AdapterFitting,
  Booking, TrackingLink, Label, AssetLabel, Geofence, GeofenceEvent, Alert,
  TrackerRequest, MaintenancePlan, ServiceRecord, Muc, Invoice, Payment,
  AssetCostProfile, ReportSchedule, ReportRun, AuditEntry, Notification,
  OwnershipPeriod, GrantOverride, MaintenanceTask,
} from '@/domain/types';
import * as seedData from '@/server/seed/data';

export const DB_VERSION = 1;
export const DB_STORAGE_KEY = 'kasper.db.v1';

/** Every mutable collection. Each one is an array so it can be exported as JSON. */
export interface DbState {
  tenants: Tenant[];
  sites: Site[];
  users: User[];
  assets: Asset[];
  ownershipPeriods: OwnershipPeriod[];
  trackers: Tracker[];
  pairings: Pairing[];
  adapters: CanAdapter[];
  adapterFittings: AdapterFitting[];
  bookings: Booking[];
  grantOverrides: GrantOverride[];
  trackingLinks: TrackingLink[];
  alerts: Alert[];
  auditEntries: AuditEntry[];
  labels: Label[];
  assetLabels: AssetLabel[];
  geofences: Geofence[];
  geofenceEvents: GeofenceEvent[];
  reportRuns: ReportRun[];
  reportSchedules: ReportSchedule[];
  maintenancePlans: MaintenancePlan[];
  maintenanceTasks: MaintenanceTask[];
  serviceRecords: ServiceRecord[];
  mucs: Muc[];
  invoices: Invoice[];
  payments: Payment[];
  costProfiles: AssetCostProfile[];
  trackerRequests: TrackerRequest[];
  notifications: Notification[];
  onboardingDrafts: typeof seedData.onboardingDrafts;
}

export type CollectionKey = {
  [K in keyof DbState]: DbState[K] extends unknown[] ? K : never;
}[keyof DbState];

/** The row type of one collection, e.g. `DbRow<'bookings'>`. */
export type DbRow<K extends CollectionKey> = DbState[K] extends (infer R)[] ? R : never;
type Row<K extends CollectionKey> = DbRow<K>;

/** The seed, copied. The db never holds a reference to the seed's own arrays. */
export function freshDbState(): DbState {
  const copy = <T>(value: T): T => structuredClone(value);
  return {
    tenants: copy(seedData.tenants),
    sites: copy(seedData.sites),
    users: copy(seedData.users),
    assets: copy(seedData.assets),
    ownershipPeriods: [],
    trackers: copy(seedData.trackers),
    pairings: copy(seedData.pairings),
    adapters: copy(seedData.adapters),
    adapterFittings: copy(seedData.adapterFittings),
    bookings: copy(seedData.bookings),
    grantOverrides: copy(seedData.grantOverrides),
    trackingLinks: copy(seedData.trackingLinks),
    alerts: copy(seedData.alerts),
    auditEntries: copy(seedData.auditEntries),
    labels: copy(seedData.labels),
    assetLabels: copy(seedData.assetLabels),
    geofences: copy(seedData.geofences),
    geofenceEvents: copy(seedData.geofenceEvents),
    reportRuns: copy(seedData.reportRuns),
    reportSchedules: copy(seedData.reportSchedules),
    maintenancePlans: copy(seedData.maintenancePlans),
    maintenanceTasks: [],
    serviceRecords: copy(seedData.serviceRecords),
    mucs: copy(seedData.mucs),
    invoices: copy(seedData.invoices),
    payments: copy(seedData.payments),
    costProfiles: copy(seedData.costProfiles),
    trackerRequests: copy(seedData.trackerRequests),
    notifications: copy(seedData.notifications),
    onboardingDrafts: copy(seedData.onboardingDrafts),
  };
}

/** The collection names an export file must contain, in order. */
export const DB_COLLECTION_KEYS = Object.keys(freshDbState()) as CollectionKey[];

// Server-side rendering has no localStorage. The storage adapter is then
// undefined and persist simply keeps the in-memory state.
export const db = create<DbState>()(
  persist(() => freshDbState(), {
    name: DB_STORAGE_KEY,
    version: DB_VERSION,
    storage: createJSONStorage(() => localStorage),
    // A stored db from another version is discarded and rebuilt from the seed.
    migrate: () => freshDbState(),
    // The client rehydrates after mount (see DbProvider), so the first client
    // render matches the server HTML and there is no hydration mismatch.
    skipHydration: true,
  })
);

/** React hook: re-renders the caller whenever the selected slice changes. */
export function useDb<T>(selector: (state: DbState) => T): T {
  return db(selector);
}

/** Load the stored db (client only). Safe to call more than once. */
export function hydrateDb(): Promise<void> {
  return db.persist.rehydrate() ?? Promise.resolve();
}

/** Replace the whole db with a fresh seed. Persists immediately. */
export function resetDb(): void {
  db.setState(freshDbState(), true);
}

/** Replace the whole db with a validated snapshot (used by Import). */
export function replaceDb(next: DbState): void {
  db.setState(next, true);
}

/** Add a row to a collection. */
export function append<K extends CollectionKey>(key: K, row: Row<K>): void {
  db.setState((s) => ({ [key]: [...(s[key] as unknown[]), row] }) as Partial<DbState>);
}

/** Remove the rows that match. Returns how many were removed. */
export function removeWhere<K extends CollectionKey>(key: K, match: (row: Row<K>) => boolean): number {
  const before = (db.getState()[key] as unknown[]).length;
  db.setState((s) => ({
    [key]: (s[key] as unknown[]).filter((row) => !match(row as Row<K>)),
  }) as Partial<DbState>);
  return before - (db.getState()[key] as unknown[]).length;
}

/**
 * Announce in-place edits to one or more collections. Call this after changing
 * a row's fields directly. It hands subscribers a new array reference and
 * persists the change.
 */
export function touch(...keys: CollectionKey[]): void {
  db.setState((s) => {
    const patch: Record<string, unknown[]> = {};
    for (const k of keys) patch[k] = [...(s[k] as unknown[])];
    return patch as Partial<DbState>;
  });
}

/**
 * The next number for an id like `tr-new-7`. It is one above the largest
 * number already used with that prefix, and never below `floor`. Using the
 * stored rows means ids stay unique after a reload, when in-memory counters
 * would start again at zero.
 */
/**
 * The next id number for `prefix` in a live collection, read from the db at
 * call time. Import handlers use it so an id is never reused after a reload.
 */
export function nextRowNumber(key: CollectionKey, prefix: string, floor = 0): number {
  return nextNumber(prefix, db.getState()[key] as readonly { id: string }[], floor);
}

export function nextNumber(prefix: string, rows: readonly { id: string }[], floor = 0): number {
  let max = floor;
  for (const row of rows) {
    if (!row.id.startsWith(prefix)) continue;
    const tail = row.id.slice(prefix.length);
    if (!/^\d+$/.test(tail)) continue;
    max = Math.max(max, Number(tail));
  }
  return max + 1;
}
