// Deterministic seed data for the Kasper GPS prototype.
// Uses mulberry32 PRNG (seed 20261005) for any pseudo-random values.
// All times are relative to the clock's anchor.
// Architecture rule 8: the public link resolver returns only { assetName, lat, lng, at } + optional eta.

import type {
  Tenant, Site, User, Asset, Tracker, Pairing, Booking, TrackingLink,
  Alert, AuditEntry, Label, AssetLabel, Geofence, GeofenceEvent,
  MaintenancePlan, ServiceRecord, Muc, Invoice, Payment, ReportSchedule,
  ReportRun, Role, AssetClass, CanProfile, SimBehaviour
} from '@/domain/types';

// ── PRNG ────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const prng = mulberry32(20261005);
const rand = (min: number, max: number) => min + prng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// ── Clock anchor ───────────────────────────────────────────────────────────────

// Anchor = 6 Oct 2026 10:00 GST (Dubai time)
// Previous month = September 2026
const ANCHOR_ISO = '2026-10-06T10:00:00+04:00';
export const ANCHOR_MS = new Date(ANCHOR_ISO).getTime();

export function daysAgo(n: number): number {
  return ANCHOR_MS - n * 86400000;
}
export function hoursAgo(n: number): number {
  return ANCHOR_MS - n * 3600000;
}
export function minsAgo(n: number): number {
  return ANCHOR_MS - n * 60000;
}
export function daysFromNow(n: number): number {
  return ANCHOR_MS + n * 86400000;
}

// ── Tenants ────────────────────────────────────────────────────────────────────

export const tenants: Tenant[] = [
  { id: 't-alnoor', name: 'Al Noor Transport', type: 'vendor', status: 'active', createdAt: '2024-03-12T09:00:00Z' },
  { id: 't-emirates', name: 'Emirates Earthmovers', type: 'vendor', status: 'active', createdAt: '2023-08-04T10:00:00Z' },
  { id: 't-gulflift', name: 'Gulf Lift Rentals', type: 'both', status: 'active', createdAt: '2024-01-15T08:00:00Z' },
  { id: 't-marina', name: 'Marina Builders', type: 'both', status: 'active', createdAt: '2025-02-20T11:00:00Z' },
  { id: 't-palm', name: 'Palm Contracting', type: 'client', status: 'active', createdAt: new Date(daysAgo(12)).toISOString() },
];

// ── Sites ──────────────────────────────────────────────────────────────────────

export const sites: Site[] = [
  // Al Noor
  { id: 's-alnoor-ja', tenantId: 't-alnoor', name: 'Jebel Ali Yard', center: { lat: 25.0118, lng: 55.1132 }, radiusM: 500 },
  { id: 's-alnoor-dip', tenantId: 't-alnoor', name: 'DIP Yard', center: { lat: 24.9840, lng: 55.1735 }, radiusM: 500 },
  // Emirates
  { id: 's-emirates-alq', tenantId: 't-emirates', name: 'Al Quoz Yard', center: { lat: 25.1366, lng: 55.2311 }, radiusM: 500 },
  { id: 's-emirates-rak', tenantId: 't-emirates', name: 'Ras Al Khor Yard', center: { lat: 25.1890, lng: 55.3460 }, radiusM: 500 },
  // Gulf Lift
  { id: 's-gulflift-aq', tenantId: 't-gulflift', name: 'Al Qusais Yard', center: { lat: 25.2860, lng: 55.3820 }, radiusM: 500 },
  // Marina
  { id: 's-marina-dh', tenantId: 't-marina', name: 'Dubai Hills Project', center: { lat: 25.1045, lng: 55.2486 }, radiusM: 300 },
  { id: 's-marina-bb', tenantId: 't-marina', name: 'Business Bay Tower', center: { lat: 25.1865, lng: 55.2721 }, radiusM: 300 },
  { id: 's-marina-jvc', tenantId: 't-marina', name: 'JVC Villas', center: { lat: 25.0600, lng: 55.2100 }, radiusM: 300 },
  // Palm
  { id: 's-palm-pc', tenantId: 't-palm', name: 'Palm Crescent Works', center: { lat: 25.1124, lng: 55.1390 }, radiusM: 300 },
  { id: 's-palm-ds', tenantId: 't-palm', name: 'Dubai South Hub', center: { lat: 24.8960, lng: 55.1600 }, radiusM: 300 },
];

// ── Users ─────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string; name: string; email: string; role: string; tenantId: string | null;
  siteIds: string[]; status: 'active' | 'invited' | 'deactivated'; title?: string;
};

const userRows: UserRow[] = [
  { id: 'u-sara', name: 'Sara Haddad', email: 'sara@kasper.ae', role: 'kasper_admin', tenantId: null, siteIds: [], status: 'active' },
  { id: 'u-ravi', name: 'Ravi Menon', email: 'ravi@kasper.ae', role: 'kasper_ops', tenantId: null, siteIds: [], status: 'active' },
  { id: 'u-omar', name: 'Omar Saleh', email: 'omar@alnoor.ae', role: 'tenant_admin', tenantId: 't-alnoor', siteIds: [], status: 'active' },
  { id: 'u-hessa', name: 'Hessa Al Mansoori', email: 'hessa@alnoor.ae', role: 'tenant_admin', tenantId: 't-alnoor', siteIds: [], status: 'active' },
  { id: 'u-khalid', name: 'Khalid Rahman', email: 'khalid@emiratesearth.ae', role: 'tenant_admin', tenantId: 't-emirates', siteIds: [], status: 'active' },
  { id: 'u-priya', name: 'Priya Nair', email: 'priya@gulflift.ae', role: 'tenant_admin', tenantId: 't-gulflift', siteIds: [], status: 'active' },
  { id: 'u-mark', name: "Mark D'Souza", email: 'mark@gulflift.ae', role: 'site_user', tenantId: 't-gulflift', siteIds: ['s-gulflift-aq'], status: 'active', title: 'Site Supervisor' },
  { id: 'u-lina', name: 'Lina Aziz', email: 'lina@marina.ae', role: 'tenant_admin', tenantId: 't-marina', siteIds: [], status: 'active' },
  { id: 'u-ahmed', name: 'Ahmed Yousef', email: 'ahmed@marina.ae', role: 'site_user', tenantId: 't-marina', siteIds: ['s-marina-dh'], status: 'active', title: 'Foreman' },
  { id: 'u-john', name: 'John Mathew', email: 'john@marina.ae', role: 'site_user', tenantId: 't-marina', siteIds: ['s-marina-bb', 's-marina-jvc'], status: 'active', title: 'Site Manager' },
  { id: 'u-anil', name: 'Anil Kumar', email: 'anil@marina.ae', role: 'site_user', tenantId: 't-marina', siteIds: ['s-marina-jvc'], status: 'active', title: 'Operator' },
  { id: 'u-karim', name: 'Karim Old', email: 'karim@marina.ae', role: 'site_user', tenantId: 't-marina', siteIds: ['s-marina-dh'], status: 'deactivated' },
  { id: 'u-sam', name: 'Sam Invite', email: 'sam@marina.ae', role: 'site_user', tenantId: 't-marina', siteIds: ['s-marina-bb'], status: 'invited' },
  { id: 'u-fatima', name: 'Fatima Noor', email: 'fatima@palmcontracting.ae', role: 'tenant_admin', tenantId: 't-palm', siteIds: [], status: 'active' },
  { id: 'u-rashid', name: 'Rashid Ali', email: 'rashid@palmcontracting.ae', role: 'site_user', tenantId: 't-palm', siteIds: ['s-palm-pc'], status: 'active', title: 'Site Foreman' },
  { id: 'u-deepa', name: 'Deepa Shah', email: 'deepa@palmcontracting.ae', role: 'site_user', tenantId: 't-palm', siteIds: ['s-palm-ds', 's-palm-pc'], status: 'active', title: 'Logistics Coordinator' },
];

export const users: User[] = userRows.map(u => ({
  id: u.id, name: u.name, email: u.email, role: u.role as unknown as Role, tenantId: u.tenantId,
  siteIds: u.siteIds, status: u.status as unknown as 'active' | 'invited' | 'deactivated', title: u.title,
}));

// ── CAN adapters ───────────────────────────────────────────────────────────────

export const adapters: { id: string; serial: string; model: 'LVCAN200' | 'ALL-CAN300'; status: 'in_stock' | 'fitted' | 'faulty' | 'retired'; assetId: string | null; fittedAt?: string; registeredAt: string }[] = [
  // Fitted — one per CAN asset (fitted at various dates)
  { id: 'a-ex04', serial: 'AC3-004123', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-ex04', fittedAt: '2026-01-15T09:00:00Z', registeredAt: '2026-01-15T09:00:00Z' },
  { id: 'a-ex07', serial: 'AC3-004124', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-ex07', fittedAt: '2026-01-20T10:00:00Z', registeredAt: '2026-01-20T10:00:00Z' },
  { id: 'a-ex11', serial: 'AC3-004125', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-ex11', fittedAt: '2026-02-01T09:00:00Z', registeredAt: '2026-02-01T09:00:00Z' },
  { id: 'a-wl03', serial: 'AC3-004126', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-wl03', fittedAt: '2026-02-10T10:00:00Z', registeredAt: '2026-02-10T10:00:00Z' },
  { id: 'a-wl06', serial: 'AC3-004127', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-wl06', fittedAt: '2026-02-15T09:00:00Z', registeredAt: '2026-02-15T09:00:00Z' },
  { id: 'a-bd02', serial: 'AC3-004128', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-bd02', fittedAt: '2026-03-01T09:00:00Z', registeredAt: '2026-03-01T09:00:00Z' },
  { id: 'a-bh05', serial: 'AC3-004129', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-bh05', fittedAt: '2026-03-10T10:00:00Z', registeredAt: '2026-03-10T10:00:00Z' },
  { id: 'a-gr01', serial: 'AC3-004130', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-gr01', fittedAt: '2026-03-15T09:00:00Z', registeredAt: '2026-03-15T09:00:00Z' },
  { id: 'a-gn01', serial: 'AC3-004131', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-gn01', fittedAt: '2026-04-01T09:00:00Z', registeredAt: '2026-04-01T09:00:00Z' },
  { id: 'a-cr02', serial: 'AC3-004132', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-cr02', fittedAt: '2026-04-15T10:00:00Z', registeredAt: '2026-04-15T10:00:00Z' },
  { id: 'a-cr05', serial: 'AC3-004133', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-cr05', fittedAt: '2026-05-01T09:00:00Z', registeredAt: '2026-05-01T09:00:00Z' },
  { id: 'a-th01', serial: 'AC3-004134', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-th01', fittedAt: '2026-05-10T10:00:00Z', registeredAt: '2026-05-10T10:00:00Z' },
  { id: 'a-th04', serial: 'AC3-004135', model: 'ALL-CAN300', status: 'fitted', assetId: 'a-th04', fittedAt: '2026-05-20T09:00:00Z', registeredAt: '2026-05-20T09:00:00Z' },
  { id: 'a-pu51', serial: 'LV2-002101', model: 'LVCAN200', status: 'fitted', assetId: 'a-pu51', fittedAt: '2026-06-01T09:00:00Z', registeredAt: '2026-06-01T09:00:00Z' },
  { id: 'a-pu52', serial: 'LV2-002102', model: 'LVCAN200', status: 'fitted', assetId: 'a-pu52', fittedAt: '2026-06-10T10:00:00Z', registeredAt: '2026-06-10T10:00:00Z' },
  { id: 'a-vn01', serial: 'LV2-002103', model: 'LVCAN200', status: 'fitted', assetId: 'a-vn01', fittedAt: '2026-06-20T09:00:00Z', registeredAt: '2026-06-20T09:00:00Z' },
  { id: 'a-pu41', serial: 'LV2-002104', model: 'LVCAN200', status: 'fitted', assetId: 'a-pu41', fittedAt: '2026-07-01T09:00:00Z', registeredAt: '2026-07-01T09:00:00Z' },
  // Stock
  { id: 'a-stock-1', serial: 'AC3-006101', model: 'ALL-CAN300', status: 'in_stock', assetId: null, registeredAt: '2026-09-01T09:00:00Z' },
  { id: 'a-stock-2', serial: 'AC3-006102', model: 'ALL-CAN300', status: 'in_stock', assetId: null, registeredAt: '2026-09-05T10:00:00Z' },
  { id: 'a-stock-3', serial: 'LV2-002201', model: 'LVCAN200', status: 'in_stock', assetId: null, registeredAt: '2026-09-01T09:00:00Z' },
  { id: 'a-stock-4', serial: 'LV2-002202', model: 'LVCAN200', status: 'in_stock', assetId: null, registeredAt: '2026-09-10T10:00:00Z' },
  // Faulty
  { id: 'a-faulty-1', serial: 'AC3-005501', model: 'ALL-CAN300', status: 'faulty', assetId: null, registeredAt: '2026-08-15T10:00:00Z' },
];

// ── Trackers ───────────────────────────────────────────────────────────────────

// IMEI = 35209310 + 6 digits + Luhn check digit
function makeImei(last6: string): string {
  const base = '35209310' + last6;
  const digits = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

function makeSim(): string {
  const n = Array.from({ length: 14 }, () => randInt(0, 9)).join('');
  return '89971' + n;
}

const trackerRows = [
  // Al Noor assets
  ['tr-fb12', 'FB-12', 't-alnoor', 's-alnoor-ja', '35209310000001', false],
  ['tr-fb14', 'FB-14', 't-alnoor', 's-alnoor-ja', '35209310000002', false],
  ['tr-lb02', 'LB-02', 't-alnoor', 's-alnoor-dip', '35209310000003', false],
  ['tr-lb05', 'LB-05', 't-alnoor', 's-alnoor-dip', '35209310000004', false],
  ['tr-tp21', 'TP-21', 't-alnoor', 's-alnoor-ja', '35209310000005', false],
  ['tr-tp22', 'TP-22', 't-alnoor', 's-alnoor-ja', '35209310000006', false],
  ['tr-tp23', 'TP-23', 't-alnoor', 's-alnoor-dip', '35209310000007', false],
  ['tr-wt07', 'WT-07', 't-alnoor', 's-alnoor-dip', '35209310000008', false],
  ['tr-wt08', 'WT-08', 't-alnoor', 's-alnoor-ja', '35209310000009', false],
  ['tr-pu31', 'PU-31', 't-alnoor', 's-alnoor-ja', '35209310000010', false],
  // Emirates assets
  ['tr-ex04', 'EX-04', 't-emirates', 's-emirates-alq', '35209310000011', false],
  ['tr-ex07', 'EX-07', 't-emirates', 's-emirates-alq', '35209310000012', false],
  ['tr-ex11', 'EX-11', 't-emirates', 's-emirates-rak', '35209310000013', false],
  ['tr-wl03', 'WL-03', 't-emirates', 's-emirates-alq', '35209310000014', false],
  ['tr-wl06', 'WL-06', 't-emirates', 's-emirates-rak', '35209310000015', false],
  ['tr-bd02', 'BD-02', 't-emirates', 's-emirates-alq', '35209310000016', false],
  ['tr-bh05', 'BH-05', 't-emirates', 's-emirates-rak', '35209310000017', false],
  ['tr-gr01', 'GR-01', 't-emirates', 's-emirates-alq', '35209310000018', false],
  ['tr-cp03', 'CP-03', 't-emirates', 's-emirates-rak', '35209310000019', false],
  ['tr-gn01', 'GN-01', 't-emirates', 's-emirates-alq', '35209310000020', false],
  ['tr-gn02', 'GN-02', 't-emirates', 's-emirates-rak', '35209310000021', false],
  // Gulf Lift assets
  ['tr-cr02', 'CR-02', 't-gulflift', 's-gulflift-aq', '35209310000022', false],
  ['tr-cr05', 'CR-05', 't-gulflift', 's-gulflift-aq', '35209310000023', false],
  ['tr-cr08', 'CR-08', 't-gulflift', 's-gulflift-aq', '35209310000024', false],
  ['tr-th01', 'TH-01', 't-gulflift', 's-gulflift-aq', '35209310000025', false],
  ['tr-th04', 'TH-04', 't-gulflift', 's-gulflift-aq', '35209310000026', false],
  ['tr-fl09', 'FL-09', 't-gulflift', 's-gulflift-aq', '35209310000027', false],
  ['tr-fl10', 'FL-10', 't-gulflift', 's-gulflift-aq', '35209310000028', false],
  ['tr-bl01', 'BL-01', 't-gulflift', 's-gulflift-aq', '35209310000029', false],
  ['tr-sl02', 'SL-02', 't-gulflift', 's-gulflift-aq', '35209310000030', false],
  ['tr-pu41', 'PU-41', 't-gulflift', 's-gulflift-aq', '35209310000031', false],
  // Marina assets
  ['tr-pu51', 'PU-51', 't-marina', 's-marina-dh', '35209310000032', false],
  ['tr-pu52', 'PU-52', 't-marina', 's-marina-bb', '35209310000033', false],
  ['tr-vn01', 'VN-01', 't-marina', 's-marina-jvc', '35209310000034', false],
  // Spare (3)
  ['tr-spare-1', null, null, null, '35209310000061', true],
  ['tr-spare-2', null, null, null, '35209310000062', true],
  ['tr-spare-3', null, null, null, '35209310000063', true], // CR-08's old tracker
];

export const trackers: Tracker[] = trackerRows.map(row => {
  const id = row[0] as string;
  const assetCode = row[1] as string | null;
  const _tenantId = row[2] as string | null;
  const _siteId = row[3] as string | null;
  const imei = row[4] as string;
  const isSpare = row[5] as boolean;
  const _assetLookupId = assetCode ? assetIds[assetCode] : null;
  const trackerId = id;
  return {
    id: trackerId,
    imei: makeImei(imei.slice(-6)),
    model: 'FMC130',
    simIccid: makeSim(),
    firmware: '03.29.00.Rev.03',
    pingIntervalSec: 30,
    sleepMode: 'off',
    stockStatus: isSpare ? 'in_stock' : 'paired',
    registeredAt: new Date(daysAgo(randInt(50, 500))).toISOString(),
    registeredBy: 'u-sara',
    flaggedForSupport: trackerId === 'tr-spare-3' ? { by: 'u-ravi', at: new Date(daysAgo(20)).toISOString(), note: 'Returned for repair — intermittent GSM' } : undefined,
  };
});

// ── Pairings ──────────────────────────────────────────────────────────────────

export const pairings: Pairing[] = [
  // LD-09 tracker was moved to PU-41 10 days ago
  { id: 'p-ld09-pu41', trackerId: 'tr-pu41', assetId: 'a-pu41', from: 'a-ld09', to: null },
  // CR-08 tracker swapped 20 days ago
  { id: 'p-cr08-old', trackerId: 'tr-spare-3', assetId: 'a-cr08', from: 'a-cr08', to: 'a-cr08' },
  // FL-09 paired this morning
  { id: 'p-fl09', trackerId: 'tr-fl09', assetId: 'a-fl09', from: new Date(daysAgo(0.5)).toISOString(), to: null },
];

// Asset IDs reference
const assetIds: Record<string, string> = {
  'FB-12': 'a-fb12', 'FB-14': 'a-fb14', 'LB-02': 'a-lb02', 'LB-05': 'a-lb05',
  'TP-21': 'a-tp21', 'TP-22': 'a-tp22', 'TP-23': 'a-tp23', 'WT-07': 'a-wt07',
  'WT-08': 'a-wt08', 'PU-31': 'a-pu31',
  'EX-04': 'a-ex04', 'EX-07': 'a-ex07', 'EX-11': 'a-ex11', 'WL-03': 'a-wl03',
  'WL-06': 'a-wl06', 'BD-02': 'a-bd02', 'BH-05': 'a-bh05', 'GR-01': 'a-gr01',
  'CP-03': 'a-cp03', 'GN-01': 'a-gn01', 'GN-02': 'a-gn02', 'LD-09': 'a-ld09',
  'CR-02': 'a-cr02', 'CR-05': 'a-cr05', 'CR-08': 'a-cr08',
  'TH-01': 'a-th01', 'TH-04': 'a-th04', 'FL-09': 'a-fl09', 'FL-10': 'a-fl10',
  'BL-01': 'a-bl01', 'SL-02': 'a-sl02', 'MW-01': 'a-mw01',
  'PU-41': 'a-pu41', 'PU-51': 'a-pu51', 'PU-52': 'a-pu52', 'VN-01': 'a-vn01',
};

// ── Assets ─────────────────────────────────────────────────────────────────────

type AssetRow = {
  id: string; code: string; name: string; type: string; assetClass: string;
  make: string; model: string; year: number; plateOrSerial: string;
  ownerTenantId: string; homeSiteId: string; tankLitres?: number;
  canProfile: { adapter: string; supported: string[]; checkedAt?: string; notes?: string };
  behaviour: string; createdBy: string;
};

function allParamsExcept(...exclude: string[]): string[] {
  const all: string[] = ['gnss', 'speed', 'ignition', 'movement', 'extVoltage', 'intBattery', 'gsm', 'gnssOdometer', 'accelEvents'];
  return all.filter(p => !exclude.includes(p));
}

const assetRows: AssetRow[] = [
  // Tier 1 — Al Noor Transport (no CAN adapters)
  { id: 'a-fb12', code: 'FB-12', name: 'Flatbed trailer truck', type: 'Truck', assetClass: 'truck', make: 'Mercedes', model: 'Actros', year: 2017, plateOrSerial: 'AK-1234', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-ja', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-fb14', code: 'FB-14', name: 'Flatbed truck', type: 'Truck', assetClass: 'truck', make: 'Volvo', model: 'FH', year: 2019, plateOrSerial: 'AK-5678', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-ja', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-lb02', code: 'LB-02', name: 'Lowbed', type: 'Truck', assetClass: 'truck', make: 'MAN', model: 'TGS', year: 2018, plateOrSerial: 'AK-9012', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-dip', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-lb05', code: 'LB-05', name: 'Lowbed', type: 'Truck', assetClass: 'truck', make: 'Scania', model: 'R500', year: 2020, plateOrSerial: 'AK-3456', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-dip', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-tp21', code: 'TP-21', name: 'Tipper', type: 'Truck', assetClass: 'truck', make: 'Volvo', model: 'FMX', year: 2016, plateOrSerial: 'AK-7890', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-ja', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-tp22', code: 'TP-22', name: 'Tipper', type: 'Truck', assetClass: 'truck', make: 'Volvo', model: 'FMX', year: 2016, plateOrSerial: 'AK-1111', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-ja', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-tp23', code: 'TP-23', name: 'Tipper', type: 'Truck', assetClass: 'truck', make: 'Hino', model: '700', year: 2015, plateOrSerial: 'AK-2222', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-dip', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-omar' },
  { id: 'a-wt07', code: 'WT-07', name: 'Water tanker', type: 'Truck', assetClass: 'truck', make: 'Isuzu', model: 'FVZ', year: 2018, plateOrSerial: 'AK-3333', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-dip', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'drives_between_sites', createdBy: 'u-omar' },
  { id: 'a-wt08', code: 'WT-08', name: 'Water tanker', type: 'Truck', assetClass: 'truck', make: 'Isuzu', model: 'FVZ', year: 2018, plateOrSerial: 'AK-4444', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-ja', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-omar' },
  { id: 'a-pu31', code: 'PU-31', name: 'Pickup', type: 'Pickup', assetClass: 'light_vehicle', make: 'Toyota', model: 'Hilux', year: 2021, plateOrSerial: 'AK-5555', ownerTenantId: 't-alnoor', homeSiteId: 's-alnoor-ja', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'light_vehicle_day', createdBy: 'u-omar' },
  // Tier 3 — Emirates Earthmovers (mostly ALL-CAN300)
  { id: 'a-ex04', code: 'EX-04', name: 'Excavator', type: 'Excavator', assetClass: 'plant', make: 'CAT', model: '320', year: 2020, plateOrSerial: 'EM-001', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', tankLitres: 400, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept('adBlue'), checkedAt: new Date(daysAgo(60)).toISOString(), notes: 'adBlue sensor faulty — not supported' }, behaviour: 'works_at_site', createdBy: 'u-khalid' },
  { id: 'a-ex07', code: 'EX-07', name: 'Excavator', type: 'Excavator', assetClass: 'plant', make: 'Komatsu', model: 'PC210', year: 2019, plateOrSerial: 'EM-002', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', tankLitres: 400, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(60)).toISOString() }, behaviour: 'parked', createdBy: 'u-khalid' },
  { id: 'a-ex11', code: 'EX-11', name: 'Excavator', type: 'Excavator', assetClass: 'plant', make: 'Hyundai', model: 'HX220', year: 2021, plateOrSerial: 'EM-003', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-rak', tankLitres: 400, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept('faultCodes'), checkedAt: new Date(daysAgo(60)).toISOString(), notes: 'faultCodes not available on this model' }, behaviour: 'drives_between_sites', createdBy: 'u-khalid' },
  { id: 'a-wl03', code: 'WL-03', name: 'Wheel loader', type: 'Wheel loader', assetClass: 'plant', make: 'CAT', model: '950', year: 2018, plateOrSerial: 'EM-004', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', tankLitres: 300, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(60)).toISOString() }, behaviour: 'works_at_site', createdBy: 'u-khalid' },
  { id: 'a-wl06', code: 'WL-06', name: 'Wheel loader', type: 'Wheel loader', assetClass: 'plant', make: 'Volvo', model: 'L120', year: 2020, plateOrSerial: 'EM-005', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-rak', tankLitres: 300, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(60)).toISOString() }, behaviour: 'works_at_site', createdBy: 'u-khalid' },
  { id: 'a-bd02', code: 'BD-02', name: 'Bulldozer', type: 'Bulldozer', assetClass: 'plant', make: 'CAT', model: 'D6', year: 2017, plateOrSerial: 'EM-006', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', tankLitres: 450, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(60)).toISOString() }, behaviour: 'works_at_site', createdBy: 'u-khalid' },
  { id: 'a-bh05', code: 'BH-05', name: 'Backhoe loader', type: 'Backhoe loader', assetClass: 'plant', make: 'JCB', model: '3CX', year: 2019, plateOrSerial: 'EM-007', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-rak', tankLitres: 160, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept('fuelLevel'), checkedAt: new Date(daysAgo(60)).toISOString(), notes: 'fuelLevel sensor not installed on this model' }, behaviour: 'drives_between_sites', createdBy: 'u-khalid' },
  { id: 'a-gr01', code: 'GR-01', name: 'Motor grader', type: 'Motor grader', assetClass: 'plant', make: 'CAT', model: '140K', year: 2016, plateOrSerial: 'EM-008', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', tankLitres: 350, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept('fuelLevel', 'coolantTemp'), checkedAt: new Date(daysAgo(60)).toISOString(), notes: 'fuelLevel and coolantTemp sensors absent' }, behaviour: 'works_at_site', createdBy: 'u-khalid' },
  { id: 'a-cp03', code: 'CP-03', name: 'Soil compactor', type: 'Compactor', assetClass: 'plant', make: 'Bomag', model: 'BW213', year: 2012, plateOrSerial: 'EM-009', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-rak', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'works_at_site', createdBy: 'u-khalid' },
  { id: 'a-gn01', code: 'GN-01', name: 'Generator 250 kVA', type: 'Generator', assetClass: 'power', make: 'Cummins', model: '250 kVA', year: 2020, plateOrSerial: 'EM-010', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', tankLitres: 500, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(60)).toISOString() }, behaviour: 'stationary_24h', createdBy: 'u-khalid' },
  { id: 'a-gn02', code: 'GN-02', name: 'Generator 60 kVA', type: 'Generator', assetClass: 'power', make: 'Perkins', model: '60 kVA', year: 2014, plateOrSerial: 'EM-011', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-rak', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'stationary_24h', createdBy: 'u-khalid' },
  { id: 'a-ld09', code: 'LD-09', name: 'Skid steer loader', type: 'Skid steer loader', assetClass: 'plant', make: 'Bobcat', model: 'S650', year: 2018, plateOrSerial: 'EM-012', ownerTenantId: 't-emirates', homeSiteId: 's-emirates-alq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-khalid' },
  // Tier 3 & mixed — Gulf Lift Rentals
  { id: 'a-cr02', code: 'CR-02', name: 'Mobile crane 50 t', type: 'Mobile crane', assetClass: 'lifting', make: 'Liebherr', model: 'LTM 1050', year: 2018, plateOrSerial: 'GL-001', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', tankLitres: 400, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(90)).toISOString() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-cr05', code: 'CR-05', name: 'Mobile crane 30 t', type: 'Mobile crane', assetClass: 'lifting', make: 'Tadano', model: 'GR-300', year: 2016, plateOrSerial: 'GL-002', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', tankLitres: 400, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept('faultCodes'), checkedAt: new Date(daysAgo(90)).toISOString(), notes: 'faultCodes not exposed by this crane' }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-cr08', code: 'CR-08', name: 'Crawler crane', type: 'Crawler crane', assetClass: 'lifting', make: 'Sany', model: 'SCC550', year: 2015, plateOrSerial: 'GL-003', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-th01', code: 'TH-01', name: 'Telehandler', type: 'Telehandler', assetClass: 'lifting', make: 'JCB', model: '540-170', year: 2021, plateOrSerial: 'GL-004', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', tankLitres: 140, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept(), checkedAt: new Date(daysAgo(90)).toISOString() }, behaviour: 'works_at_site', createdBy: 'u-priya' },
  { id: 'a-th04', code: 'TH-04', name: 'Telehandler', type: 'Telehandler', assetClass: 'lifting', make: 'Manitou', model: 'MT1840', year: 2019, plateOrSerial: 'GL-005', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', tankLitres: 140, canProfile: { adapter: 'ALL-CAN300', supported: allParamsExcept('adBlue'), checkedAt: new Date(daysAgo(90)).toISOString(), notes: 'adBlue not fitted on this model' }, behaviour: 'works_at_site', createdBy: 'u-priya' },
  { id: 'a-fl09', code: 'FL-09', name: 'Forklift 5 t', type: 'Forklift', assetClass: 'lifting', make: 'Toyota', model: '8FBN5', year: 2022, plateOrSerial: 'GL-006', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-fl10', code: 'FL-10', name: 'Forklift 3 t', type: 'Forklift', assetClass: 'lifting', make: 'Hyster', model: 'H30XL', year: 2017, plateOrSerial: 'GL-007', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-bl01', code: 'BL-01', name: 'Boom lift', type: 'Boom lift', assetClass: 'lifting', make: 'JLG', model: '600S', year: 2018, plateOrSerial: 'GL-008', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-sl02', code: 'SL-02', name: 'Scissor lift', type: 'Scissor lift', assetClass: 'lifting', make: 'Genie', model: 'GS-3246', year: 2020, plateOrSerial: 'GL-009', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-mw01', code: 'MW-01', name: 'Mobile welder trailer', type: 'Mobile welder', assetClass: 'power', make: 'Lincoln', model: 'Vantage', year: 2023, plateOrSerial: 'GL-010', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'none', supported: allParamsExcept() }, behaviour: 'parked', createdBy: 'u-priya' },
  { id: 'a-pu41', code: 'PU-41', name: 'Pickup', type: 'Pickup', assetClass: 'light_vehicle', make: 'Nissan', model: 'Navara', year: 2020, plateOrSerial: 'GL-011', ownerTenantId: 't-gulflift', homeSiteId: 's-gulflift-aq', canProfile: { adapter: 'LVCAN200', supported: allParamsExcept('coolantTemp', 'engineHours'), checkedAt: new Date(daysAgo(10)).toISOString(), notes: 'coolantTemp and engineHours not supported by this vehicle CAN bus' }, behaviour: 'light_vehicle_day', createdBy: 'u-priya' },
  // Tier 2 — Marina Builders
  { id: 'a-pu51', code: 'PU-51', name: 'Pickup', type: 'Pickup', assetClass: 'light_vehicle', make: 'Toyota', model: 'Hilux', year: 2022, plateOrSerial: 'MB-001', ownerTenantId: 't-marina', homeSiteId: 's-marina-dh', tankLitres: 80, canProfile: { adapter: 'LVCAN200', supported: allParamsExcept(), checkedAt: new Date(daysAgo(90)).toISOString(), notes: 'engineHours partial support — not billing-grade' }, behaviour: 'light_vehicle_day', createdBy: 'u-lina' },
  { id: 'a-pu52', code: 'PU-52', name: 'Pickup', type: 'Pickup', assetClass: 'light_vehicle', make: 'Ford', model: 'Ranger', year: 2021, plateOrSerial: 'MB-002', ownerTenantId: 't-marina', homeSiteId: 's-marina-bb', tankLitres: 80, canProfile: { adapter: 'LVCAN200', supported: allParamsExcept('engineHours'), checkedAt: new Date(daysAgo(90)).toISOString(), notes: 'engineHours not supported' }, behaviour: 'light_vehicle_day', createdBy: 'u-lina' },
  { id: 'a-vn01', code: 'VN-01', name: 'Van', type: 'Van', assetClass: 'light_vehicle', make: 'Toyota', model: 'Hiace', year: 2019, plateOrSerial: 'MB-003', ownerTenantId: 't-marina', homeSiteId: 's-marina-jvc', tankLitres: 70, canProfile: { adapter: 'LVCAN200', supported: allParamsExcept('coolantTemp', 'engineHours'), checkedAt: new Date(daysAgo(90)).toISOString(), notes: 'coolantTemp and engineHours not supported' }, behaviour: 'light_vehicle_day', createdBy: 'u-lina' },
];

export const assets: Asset[] = assetRows.map(a => ({
  id: a.id,
  code: a.code,
  name: a.name,
  type: a.type,
  assetClass: a.assetClass as unknown as AssetClass,
  make: a.make,
  model: a.model,
  year: a.year,
  plateOrSerial: a.plateOrSerial,
  ownerTenantId: a.ownerTenantId,
  homeSiteId: a.homeSiteId,
  tankLitres: a.tankLitres,
  canProfile: a.canProfile as unknown as CanProfile,
  status: 'unknown',
  behaviour: a.behaviour as unknown as SimBehaviour,
  createdAt: new Date(daysAgo(randInt(50, 500))).toISOString(),
  createdBy: a.createdBy,
}));

// ── Bookings ───────────────────────────────────────────────────────────────────

export const bookings: Booking[] = [
  // Current bookings
  { id: 'b-1001', assetId: 'a-ex04', ownerTenantId: 't-emirates', renterTenantId: 't-marina', renterName: 'Marina Builders', renterSiteId: 's-marina-dh', start: daysAgo(2) + 8*3600000, end: daysFromNow(5) + 18*3600000, status: 'active', reference: 'BK-1001', rateType: 'hourly', rateAed: 185, minHoursPerDay: 8, destination: undefined },
  { id: 'b-1002', assetId: 'a-cr02', ownerTenantId: 't-gulflift', renterTenantId: 't-marina', renterName: 'Marina Builders', renterSiteId: 's-marina-bb', start: daysAgo(6) + 7*3600000, end: daysFromNow(8) + 18*3600000, status: 'active', reference: 'BK-1002', rateType: 'daily', rateAed: 3500, destination: undefined },
  { id: 'b-1003', assetId: 'a-ex07', ownerTenantId: 't-emirates', renterTenantId: 't-marina', renterName: 'Marina Builders', renterSiteId: 's-marina-dh', start: daysFromNow(1) + 8*3600000, end: daysFromNow(9) + 18*3600000, status: 'scheduled', reference: 'BK-1003', rateType: 'hourly', rateAed: 200, minHoursPerDay: 8 },
  { id: 'b-1004', assetId: 'a-wl06', ownerTenantId: 't-emirates', renterTenantId: 't-palm', renterName: 'Palm Contracting', renterSiteId: 's-palm-pc', start: daysAgo(1) + 7*3600000, end: daysFromNow(10) + 18*3600000, status: 'active', reference: 'BK-1004', rateType: 'hourly', rateAed: 160, minHoursPerDay: 8 },
  { id: 'b-1005', assetId: 'a-th01', ownerTenantId: 't-gulflift', renterTenantId: 't-palm', renterName: 'Palm Contracting', renterSiteId: 's-palm-ds', start: daysAgo(4) + 7*3600000, end: daysFromNow(3) + 18*3600000, status: 'active', reference: 'BK-1005', rateType: 'daily', rateAed: 1200 },
  { id: 'b-1006', assetId: 'a-gn01', ownerTenantId: 't-emirates', renterTenantId: 't-palm', renterName: 'Palm Contracting', renterSiteId: 's-palm-ds', start: daysAgo(5) + 6*3600000, end: daysFromNow(9) + 22*3600000, status: 'active', reference: 'BK-1006', rateType: 'daily', rateAed: 800 },
  { id: 'b-1007', assetId: 'a-bd02', ownerTenantId: 't-emirates', renterTenantId: 't-gulflift', renterName: 'Gulf Lift Rentals', renterSiteId: 's-gulflift-aq', start: daysAgo(3) + 7*3600000, end: daysFromNow(4) + 18*3600000, status: 'active', reference: 'BK-1007', rateType: 'hourly', rateAed: 200, minHoursPerDay: 8 },
  { id: 'b-1008', assetId: 'a-tp21', ownerTenantId: 't-alnoor', renterTenantId: 't-marina', renterName: 'Marina Builders', renterSiteId: 's-marina-jvc', start: daysAgo(10) + 7*3600000, end: daysAgo(5) + 18*3600000, status: 'closed', closedAt: daysAgo(5) + 18*3600000, reference: 'BK-1008', rateType: 'daily', rateAed: 1100 },
  { id: 'b-1009', assetId: 'a-cr05', ownerTenantId: 't-gulflift', renterTenantId: 't-marina', renterName: 'Marina Builders', renterSiteId: 's-marina-bb', start: daysAgo(2) + 7*3600000, end: daysFromNow(6) + 18*3600000, status: 'cancelled', cancelledAt: daysAgo(3) + 7*3600000, reference: 'BK-1009', rateType: 'daily', rateAed: 2800 },
  { id: 'b-1010', assetId: 'a-ex11', ownerTenantId: 't-emirates', renterTenantId: 't-palm', renterName: 'Palm Contracting', renterSiteId: 's-palm-pc', start: daysAgo(6) + 7*3600000, end: daysFromNow(4) + 18*3600000, status: 'active', reference: 'BK-1010', rateType: 'hourly', rateAed: 175, minHoursPerDay: 8 },
  { id: 'b-1011', assetId: 'a-fb12', ownerTenantId: 't-alnoor', renterTenantId: null, renterName: 'Al Habtoor Logistics', renterSiteId: null, start: ANCHOR_MS, end: ANCHOR_MS + 14*3600000, status: 'active', reference: 'BK-1011', rateType: 'daily', rateAed: 1400, destination: { name: 'Al Habtoor site, Al Barsha', lat: 25.1130, lng: 55.2000 } },
  { id: 'b-1012', assetId: 'a-lb02', ownerTenantId: 't-alnoor', renterTenantId: null, renterName: 'Bin Saeed Haulage', renterSiteId: null, start: daysAgo(2) + 6*3600000, end: daysAgo(1) + 17*3600000, status: 'closed', closedAt: daysAgo(1) + 17*3600000, reference: 'BK-1012', rateType: 'daily', rateAed: 1200 },
  // Past month bookings
  { id: 'b-0981', assetId: 'a-ex04', ownerTenantId: 't-emirates', renterTenantId: 't-palm', renterName: 'Palm Contracting', renterSiteId: 's-palm-pc', start: daysAgo(35) + 7*3600000, end: daysAgo(16) + 18*3600000, status: 'closed', closedAt: daysAgo(16) + 18*3600000, reference: 'BK-0981', rateType: 'hourly', rateAed: 185, minHoursPerDay: 8 },
  { id: 'b-0982', assetId: 'a-wl03', ownerTenantId: 't-emirates', renterTenantId: 't-marina', renterName: 'Marina Builders', renterSiteId: 's-marina-dh', start: daysAgo(31) + 7*3600000, end: daysAgo(11) + 18*3600000, status: 'closed', closedAt: daysAgo(11) + 18*3600000, reference: 'BK-0982', rateType: 'hourly', rateAed: 160, minHoursPerDay: 8 },
  { id: 'b-0983', assetId: 'a-cr02', ownerTenantId: 't-gulflift', renterTenantId: 't-palm', renterName: 'Palm Contracting', renterSiteId: 's-palm-ds', start: daysAgo(27) + 7*3600000, end: daysAgo(8) + 18*3600000, status: 'closed', closedAt: daysAgo(8) + 18*3600000, reference: 'BK-0983', rateType: 'daily', rateAed: 3200 },
];

// Early override for BK-1010
export const grantOverrides: { bookingId: string; endedAt: string | number; endedBy: string; reason: string }[] = [
  { bookingId: 'b-1010', endedAt: daysAgo(1) + 16.33*3600000, endedBy: 'u-khalid', reason: 'Payment overdue for two weeks' },
];

// ── Tracking links ─────────────────────────────────────────────────────────────

export const trackingLinks: TrackingLink[] = [
  { id: 'lk-fb12', token: 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5', assetId: 'a-fb12', bookingId: 'b-1011', createdBy: 'u-omar', createdAt: ANCHOR_MS - 2*3600000, expiresAt: ANCHOR_MS + 14*3600000, showEta: true },
  { id: 'lk-tp22', token: 'dB8rXp2kN9wQ4mY7hT6vZ1AaCs', assetId: 'a-tp22', bookingId: null, createdBy: 'u-omar', createdAt: ANCHOR_MS - 4*3600000, expiresAt: ANCHOR_MS + 20*3600000, showEta: false },
  { id: 'lk-lb02', token: 'fH3jKp7wR9xT2nY4qM6vZ1AbCs', assetId: 'a-lb02', bookingId: 'b-1012', createdBy: 'u-omar', createdAt: daysAgo(2) + 6*3600000, expiresAt: daysAgo(1) + 17*3600000, revokedAt: daysAgo(1) + 17*3600000, revokedBy: 'u-omar', revokeReason: 'job_closed' as const, showEta: false },
  { id: 'lk-cr02', token: 'rT4kWp8nN3yU7mZ2hF5vX1AcDe', assetId: 'a-cr02', bookingId: 'b-1002', createdBy: 'u-priya', createdAt: daysAgo(5) + 7*3600000, expiresAt: daysFromNow(8) + 18*3600000, revokedAt: daysAgo(2) + 7*3600000, revokedBy: 'u-priya', revokeReason: 'manual' as const, showEta: false },
];

// ── Labels ─────────────────────────────────────────────────────────────────────

export const labels: Label[] = [
  { id: 'l-an-port', tenantId: 't-alnoor', name: 'Port runs', createdBy: 'u-omar', createdAt: new Date(daysAgo(60)).toISOString() },
  { id: 'l-an-night', tenantId: 't-alnoor', name: 'Night shift', createdBy: 'u-omar', createdAt: new Date(daysAgo(45)).toISOString() },
  { id: 'l-em-alpha', tenantId: 't-emirates', name: 'Project Alpha', createdBy: 'u-khalid', createdAt: new Date(daysAgo(90)).toISOString() },
  { id: 'l-em-lthire', tenantId: 't-emirates', name: 'Long-term hire', createdBy: 'u-khalid', createdAt: new Date(daysAgo(60)).toISOString() },
  { id: 'l-em-service', tenantId: 't-emirates', name: 'Needs service', createdBy: 'u-khalid', createdAt: new Date(daysAgo(30)).toISOString() },
  { id: 'l-gl-cert', tenantId: 't-gulflift', name: 'Cert due Q4', createdBy: 'u-priya', createdAt: new Date(daysAgo(40)).toISOString() },
  { id: 'l-mb-site', tenantId: 't-marina', name: 'Site vehicles', createdBy: 'u-lina', createdAt: new Date(daysAgo(50)).toISOString() },
];

export const assetLabels: AssetLabel[] = [
  { labelId: 'l-an-port', assetId: 'a-fb12', tenantId: 't-alnoor' },
  { labelId: 'l-an-port', assetId: 'a-fb14', tenantId: 't-alnoor' },
  { labelId: 'l-an-port', assetId: 'a-lb02', tenantId: 't-alnoor' },
  { labelId: 'l-an-night', assetId: 'a-wt07', tenantId: 't-alnoor' },
  { labelId: 'l-an-night', assetId: 'a-wt08', tenantId: 't-alnoor' },
  { labelId: 'l-em-alpha', assetId: 'a-ex04', tenantId: 't-emirates' },
  { labelId: 'l-em-alpha', assetId: 'a-wl03', tenantId: 't-emirates' },
  { labelId: 'l-em-alpha', assetId: 'a-bd02', tenantId: 't-emirates' },
  { labelId: 'l-em-lthire', assetId: 'a-wl06', tenantId: 't-emirates' },
  { labelId: 'l-em-lthire', assetId: 'a-gn01', tenantId: 't-emirates' },
  { labelId: 'l-em-service', assetId: 'a-bd02', tenantId: 't-emirates' },
  { labelId: 'l-gl-cert', assetId: 'a-cr02', tenantId: 't-gulflift' },
  { labelId: 'l-gl-cert', assetId: 'a-cr05', tenantId: 't-gulflift' },
  { labelId: 'l-gl-cert', assetId: 'a-cr08', tenantId: 't-gulflift' },
  { labelId: 'l-mb-site', assetId: 'a-pu51', tenantId: 't-marina' },
  { labelId: 'l-mb-site', assetId: 'a-pu52', tenantId: 't-marina' },
  { labelId: 'l-mb-site', assetId: 'a-vn01', tenantId: 't-marina' },
];

// ── Geofences ──────────────────────────────────────────────────────────────────

export const geofences: Geofence[] = [
  // Al Noor — job circle
  { id: 'g-an-port-gate', tenantId: 't-alnoor', name: 'Jebel Ali Port gate 4', kind: 'job', shape: { type: 'circle', center: { lat: 25.0130, lng: 55.1150 }, radiusM: 400 }, siteId: undefined, alertOnEnter: true, alertOnExit: true, assetIds: 'all', createdBy: 'u-omar', createdAt: new Date(daysAgo(30)).toISOString() },
  // Emirates — after-hours yard polygon
  { id: 'g-em-afterhours', tenantId: 't-emirates', name: 'Al Quoz Yard — after hours', kind: 'yard', shape: { type: 'polygon', points: [{ lat: 25.1370, lng: 55.2305 }, { lat: 25.1362, lng: 55.2318 }, { lat: 25.1358, lng: 55.2308 }, { lat: 25.1365, lng: 55.2300 }] }, siteId: undefined, alertOnEnter: false, alertOnExit: true, afterHoursOnly: { from: '19:00', to: '06:00' }, assetIds: 'all', createdBy: 'u-khalid', createdAt: new Date(daysAgo(60)).toISOString() },
  // Emirates — Hatta Quarry
  { id: 'g-em-hatta', tenantId: 't-emirates', name: 'Hatta Quarry', kind: 'job', shape: { type: 'circle', center: { lat: 24.8128, lng: 56.1175 }, radiusM: 600 }, siteId: undefined, alertOnEnter: false, alertOnExit: false, assetIds: 'all', createdBy: 'u-khalid', createdAt: new Date(daysAgo(20)).toISOString() },
  // Palm — job polygon (6 points)
  { id: 'g-palm-crescent', tenantId: 't-palm', name: 'Palm Crescent works', kind: 'job', shape: { type: 'polygon', points: [{ lat: 25.1120, lng: 55.1385 }, { lat: 25.1128, lng: 55.1395 }, { lat: 25.1135, lng: 55.1390 }, { lat: 25.1130, lng: 55.1400 }, { lat: 25.1122, lng: 55.1398 }, { lat: 25.1118, lng: 55.1390 }] }, siteId: undefined, alertOnEnter: false, alertOnExit: true, assetIds: 'all', createdBy: 'u-fatima', createdAt: new Date(daysAgo(40)).toISOString() },
  // Marina — restricted circle
  { id: 'g-mb-school', tenantId: 't-marina', name: 'Dubai Hills — no-go: school zone', kind: 'restricted', shape: { type: 'circle', center: { lat: 25.1050, lng: 55.2470 }, radiusM: 250 }, siteId: undefined, alertOnEnter: true, alertOnExit: false, assetIds: 'all', createdBy: 'u-lina', createdAt: new Date(daysAgo(30)).toISOString() },
];

// Geofence events
export const geofenceEvents: GeofenceEvent[] = [
  { id: 'ge-001', geofenceId: 'g-palm-crescent', assetId: 'a-wl06', type: 'exit', at: daysAgo(1) + 19.167*3600000 },
  { id: 'ge-002', geofenceId: 'g-palm-crescent', assetId: 'a-wl06', type: 'enter', at: daysAgo(1) + 19.917*3600000 },
  { id: 'ge-003', geofenceId: 'g-em-afterhours', assetId: 'a-lb05', type: 'exit', at: daysAgo(1) + 23.667*3600000 },
  { id: 'ge-004', geofenceId: 'g-em-hatta', assetId: 'a-bh05', type: 'enter', at: daysFromNow(1) + 10.5*3600000 },
];

// ── Alerts ─────────────────────────────────────────────────────────────────────

export const alerts: Alert[] = [
  // Day one alerts
  { id: 'al-ex07-offline', assetId: 'a-ex07', type: 'offline', openedAt: new Date(daysAgo(3)).toISOString(), detail: 'Offline since 07:42' },
  { id: 'al-tp23-offline', assetId: 'a-tp23', type: 'offline', openedAt: daysAgo(1) + 9.33*3600000, detail: 'Offline since 14:32' },
  { id: 'al-sl02-offline', assetId: 'a-sl02', type: 'offline', openedAt: new Date(daysAgo(2)).toISOString(), detail: 'Offline since 09:15' },
  // Phase 2 alerts
  { id: 'al-tp23-power', assetId: 'a-tp23', type: 'power_cut', openedAt: daysAgo(1) + 10.167*3600000, detail: 'Power cut at 12:10 — running on tracker battery' },
  { id: 'al-gn02-battery', assetId: 'a-gn02', type: 'low_battery', openedAt: new Date(daysAgo(3)).toISOString(), detail: 'Tracker battery low (3.5 V)' },
  { id: 'al-wt07-speed', assetId: 'a-wt07', type: 'overspeed', openedAt: daysAgo(1) + 15*3600000, closedAt: daysAgo(1) + 15.5*3600000, detail: 'Over speed: 104 km/h' },
  { id: 'al-tp21-harsh', assetId: 'a-tp21', type: 'harsh_driving', openedAt: new Date(daysAgo(2)).toISOString(), detail: 'Harsh driving — 3 events in last 2 days' },
  { id: 'al-gn01-drop', assetId: 'a-gn01', type: 'fuel_drop', openedAt: daysAgo(1) + 26.167*3600000, detail: 'Fuel dropped 18% at 02:10 with engine off' },
  { id: 'al-bd02-fault', assetId: 'a-bd02', type: 'fault_code', openedAt: daysAgo(0) + 5.667*3600000, detail: 'Fault code SPN 110 FMI 0 — Engine coolant temperature high' },
  { id: 'al-lb05-towing', assetId: 'a-lb05', type: 'towing', openedAt: daysAgo(1) + 23.667*3600000, closedAt: daysAgo(1) + 23.833*3600000, detail: 'Moved with ignition off — 400 m' },
  // Tenant-owned alerts
  { id: 'al-wl06-geo', assetId: 'a-wl06', tenantId: 't-palm', type: 'geofence_exit', openedAt: daysAgo(1) + 19.167*3600000, closedAt: daysAgo(1) + 19.917*3600000, detail: 'Left Palm Crescent works at 19:10' },
  { id: 'al-lb05-afterhours', assetId: 'a-lb05', tenantId: 't-emirates', type: 'after_hours_move', openedAt: daysAgo(1) + 23.667*3600000, closedAt: daysAgo(1) + 23.833*3600000, detail: 'Moved out of Al Quoz Yard after hours (23:40)' },
  { id: 'al-bd02-maint', assetId: 'a-bd02', tenantId: 't-emirates', type: 'maintenance_overdue', openedAt: daysAgo(0) + 5.667*3600000, detail: 'Maintenance overdue: BD-02 250 h service (30 h overdue)' },
  { id: 'al-cr08-maint', assetId: 'a-cr08', tenantId: 't-gulflift', type: 'maintenance_overdue', openedAt: new Date(daysAgo(5)).toISOString(), detail: 'Maintenance overdue: CR-08 annual crane inspection (5 days overdue)' },
  { id: 'al-ex04-maint', assetId: 'a-ex04', tenantId: 't-emirates', type: 'maintenance_due', openedAt: new Date(daysAgo(5)).toISOString(), detail: 'Maintenance due soon: EX-04 500 h service (80 h left)' },
  { id: 'al-fb14-maint', assetId: 'a-fb14', tenantId: 't-alnoor', type: 'maintenance_due', openedAt: new Date(daysAgo(5)).toISOString(), detail: 'Maintenance due soon: FB-14 10,000 km service (300 km left)' },
  { id: 'al-cr02-maint', assetId: 'a-cr02', tenantId: 't-gulflift', type: 'maintenance_due', openedAt: new Date(daysAgo(5)).toISOString(), detail: 'Maintenance due soon: CR-02 annual crane inspection (12 days left)' },
  { id: 'al-inv0415', assetId: undefined, tenantId: 't-emirates', type: 'invoice_overdue', openedAt: new Date(daysAgo(6)).toISOString(), detail: 'Invoice INV-EE-0415 is overdue (6 days)' },
];

// ── Tracker request ────────────────────────────────────────────────────────────

export const trackerRequests: { id: string; tenantId: string; assetId: string; requestedBy: string; at: string; note: string; status: 'open' | 'done' | 'declined'; handledBy?: string; handledAt?: string }[] = [
  { id: 'trreq-001', tenantId: 't-gulflift', assetId: 'a-mw01', requestedBy: 'u-priya', at: new Date(daysAgo(2)).toISOString(), note: 'New welder trailer added — needs a tracker for site safety monitoring', status: 'open' },
];

// ── Maintenance plans ──────────────────────────────────────────────────────────

export const maintenancePlans: MaintenancePlan[] = [
  { id: 'mp-ex04', tenantId: 't-emirates', assetId: 'a-ex04', name: '500 h service', basis: 'engine_hours', hoursSource: 'ecu', interval: 500, dueSoonAt: 8500, lastDoneAt: new Date(daysAgo(365)).toISOString(), lastDoneValue: 8000 },
  { id: 'mp-bd02', tenantId: 't-emirates', assetId: 'a-bd02', name: '250 h service', basis: 'engine_hours', hoursSource: 'ecu', interval: 250, dueSoonAt: 15250, lastDoneAt: new Date(daysAgo(365)).toISOString(), lastDoneValue: 14700 },
  { id: 'mp-gn01', tenantId: 't-emirates', assetId: 'a-gn01', name: 'Oil change 250 h', basis: 'engine_hours', hoursSource: 'ecu', interval: 250, dueSoonAt: 2500, lastDoneAt: new Date(daysAgo(180)).toISOString(), lastDoneValue: 2000 },
  { id: 'mp-fb14', tenantId: 't-alnoor', assetId: 'a-fb14', name: '10,000 km service', basis: 'km', kmSource: 'gps', interval: 10000, dueSoonAt: 10000, lastDoneAt: new Date(daysAgo(365)).toISOString(), lastDoneValue: 7000 },
  { id: 'mp-tp22', tenantId: 't-alnoor', assetId: 'a-tp22', name: '400 h service', basis: 'engine_hours', hoursSource: 'estimated', interval: 400, dueSoonAt: 2000, lastDoneAt: new Date(daysAgo(365)).toISOString(), lastDoneValue: 1200 },
  { id: 'mp-cr02', tenantId: 't-gulflift', assetId: 'a-cr02', name: 'Annual crane inspection', basis: 'days', interval: 365, dueSoonAt: 365, lastDoneAt: new Date(daysAgo(350)).toISOString(), lastDoneValue: 0 },
  { id: 'mp-cr08', tenantId: 't-gulflift', assetId: 'a-cr08', name: 'Annual crane inspection', basis: 'days', interval: 365, dueSoonAt: 365, lastDoneAt: new Date(daysAgo(370)).toISOString(), lastDoneValue: 0 },
  { id: 'mp-pu51', tenantId: 't-marina', assetId: 'a-pu51', name: '10,000 km service', basis: 'km', kmSource: 'can', interval: 10000, dueSoonAt: 10000, lastDoneAt: new Date(daysAgo(200)).toISOString(), lastDoneValue: 3000 },
];

// ── Service records ────────────────────────────────────────────────────────────

export const serviceRecords: ServiceRecord[] = [
  { id: 'sr-001', planId: 'mp-ex04', assetId: 'a-ex04', tenantId: 't-emirates', doneAt: new Date(daysAgo(365)).toISOString(), value: 8000, notes: 'Scheduled 500 h service at Al Quoz Yard', costAed: 6800, createdBy: 'u-khalid' },
  { id: 'sr-002', planId: 'mp-bd02', assetId: 'a-bd02', tenantId: 't-emirates', doneAt: new Date(daysAgo(365)).toISOString(), value: 14700, notes: '250 h service', costAed: 4500, createdBy: 'u-khalid' },
  { id: 'sr-003', planId: 'mp-fb14', assetId: 'a-fb14', tenantId: 't-alnoor', doneAt: new Date(daysAgo(365)).toISOString(), value: 7000, notes: 'Scheduled service', costAed: 2200, createdBy: 'u-omar' },
];

// ── MUCs ──────────────────────────────────────────────────────────────────────

export const mucs: Muc[] = [
  {
    id: 'muc-ex04-sep', number: 'MUC-2026-09-EX-04-01', assetId: 'a-ex04', ownerTenantId: 't-emirates', bookingId: 'b-0981',
    periodFrom: '2026-09-01T00:00:00+04:00', periodTo: '2026-09-30T23:59:00+04:00',
    payload: {
      version: 1,
      asset: { code: 'EX-04', name: 'Excavator', make: 'CAT', model: '320', serial: 'EM-001' },
      owner: { tenantId: 't-emirates', name: 'Emirates Earthmovers' },
      renter: { tenantId: 't-palm', name: 'Palm Contracting' },
      periodFrom: '2026-09-01T00:00:00+04:00',
      periodTo: '2026-09-30T23:59:00+04:00',
      openingHoursEcu: 7900.0,
      closingHoursEcu: 8350.0,
      billableHours: 450.0,
      days: [],
      gaps: [],
      gapRule: 'delta_disclosed',
      source: 'ECU',
    },
    sealSha256: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    issuedAt: new Date(daysAgo(10)).toISOString(),
    issuedBy: 'u-khalid',
    status: 'sealed',
  },
  {
    id: 'muc-wl03-01', number: 'MUC-2026-09-WL-03-01', assetId: 'a-wl03', ownerTenantId: 't-emirates', bookingId: 'b-0982',
    periodFrom: '2026-09-01T00:00:00+04:00', periodTo: '2026-09-30T23:59:00+04:00',
    payload: {
      version: 1,
      asset: { code: 'WL-03', name: 'Wheel loader', make: 'CAT', model: '950', serial: 'EM-004' },
      owner: { tenantId: 't-emirates', name: 'Emirates Earthmovers' },
      renter: { tenantId: 't-marina', name: 'Marina Builders' },
      periodFrom: '2026-09-01T00:00:00+04:00',
      periodTo: '2026-09-30T23:59:00+04:00',
      openingHoursEcu: 600.0,
      closingHoursEcu: 1200.0,
      billableHours: 600.0,
      days: [],
      gaps: [],
      gapRule: 'delta_disclosed',
      source: 'ECU',
    },
    sealSha256: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
    issuedAt: new Date(daysAgo(12)).toISOString(),
    issuedBy: 'u-khalid',
    status: 'voided',
    voidedAt: new Date(daysAgo(9)).toISOString(),
    voidedBy: 'u-khalid',
    voidReason: 'Wrong period — booking was extended by 2 days',
    replacesMucId: 'muc-wl03-02',
  },
  {
    id: 'muc-wl03-02', number: 'MUC-2026-09-WL-03-02', assetId: 'a-wl03', ownerTenantId: 't-emirates', bookingId: 'b-0982',
    periodFrom: '2026-09-01T00:00:00+04:00', periodTo: '2026-09-30T23:59:00+04:00',
    payload: {
      version: 1,
      asset: { code: 'WL-03', name: 'Wheel loader', make: 'CAT', model: '950', serial: 'EM-004' },
      owner: { tenantId: 't-emirates', name: 'Emirates Earthmovers' },
      renter: { tenantId: 't-marina', name: 'Marina Builders' },
      periodFrom: '2026-09-01T00:00:00+04:00',
      periodTo: '2026-09-30T23:59:00+04:00',
      openingHoursEcu: 600.0,
      closingHoursEcu: 1210.0,
      billableHours: 610.0,
      days: [],
      gaps: [],
      gapRule: 'delta_disclosed',
      source: 'ECU',
    },
    sealSha256: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    issuedAt: new Date(daysAgo(8)).toISOString(),
    issuedBy: 'u-khalid',
    status: 'sealed',
    replacesMucId: 'muc-wl03-01',
  },
  {
    id: 'muc-bd02-sep', number: 'MUC-2026-09-BD-02-01', assetId: 'a-bd02', ownerTenantId: 't-emirates',
    periodFrom: '2026-09-01T00:00:00+04:00', periodTo: '2026-09-30T23:59:00+04:00',
    payload: {
      version: 1,
      asset: { code: 'BD-02', name: 'Bulldozer', make: 'CAT', model: 'D6', serial: 'EM-006' },
      owner: { tenantId: 't-emirates', name: 'Emirates Earthmovers' },
      periodFrom: '2026-09-01T00:00:00+04:00',
      periodTo: '2026-09-30T23:59:00+04:00',
      openingHoursEcu: 14600.0,
      closingHoursEcu: 14980.0,
      billableHours: 380.0,
      days: [],
      gaps: [],
      gapRule: 'delta_disclosed',
      source: 'ECU',
    },
    sealSha256: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
    issuedAt: new Date(daysAgo(8)).toISOString(),
    issuedBy: 'u-khalid',
    status: 'sealed',
  },
];

// ── Invoices ───────────────────────────────────────────────────────────────────

export const invoices: Invoice[] = [
  {
    id: 'inv-0412', number: 'INV-EE-0412', kind: 'rental', issuerTenantId: 't-emirates',
    customerTenantId: 't-palm', customerName: 'Palm Contracting',
    bookingId: 'b-0981',
    lines: [
      { description: 'EX-04 — Excavator hourly rate', basis: 'ECU', quantity: 450, unit: 'h', rateAed: 185, amountAed: 83250 },
      { description: 'Minimum hours top-up (8h/day × 20 days − actual)', basis: 'Days on hire', quantity: 0, unit: 'h', rateAed: 185, amountAed: 0 },
    ],
    subtotalAed: 83250, vatAed: 4162.5, totalAed: 87412.5,
    issuedAt: new Date(daysAgo(12)).toISOString(), dueAt: daysAgo(12) + 14*86400000, status: 'paid',
    mucId: 'muc-ex04-sep',
  },
  {
    id: 'inv-0415', number: 'INV-EE-0415', kind: 'rental', issuerTenantId: 't-emirates',
    customerTenantId: 't-marina', customerName: 'Marina Builders',
    bookingId: 'b-0982',
    lines: [
      { description: 'WL-03 — Wheel loader hourly rate', basis: 'ECU', quantity: 610, unit: 'h', rateAed: 160, amountAed: 97600 },
    ],
    subtotalAed: 97600, vatAed: 4880, totalAed: 102480,
    issuedAt: new Date(daysAgo(14)).toISOString(), dueAt: daysAgo(14) + 14*86400000, status: 'overdue',
    mucId: 'muc-wl03-02',
  },
  {
    id: 'inv-0207', number: 'INV-GL-0207', kind: 'rental', issuerTenantId: 't-gulflift',
    customerTenantId: 't-palm', customerName: 'Palm Contracting',
    bookingId: 'b-0983',
    lines: [
      { description: 'CR-02 — Mobile crane daily rate × 19 days', basis: 'Days on hire', quantity: 19, unit: 'day', rateAed: 3200, amountAed: 60800 },
    ],
    subtotalAed: 60800, vatAed: 3040, totalAed: 63840,
    issuedAt: new Date(daysAgo(10)).toISOString(), dueAt: daysAgo(10) + 14*86400000, status: 'part_paid',
    mucId: undefined,
  },
  {
    id: 'inv-0098', number: 'INV-AN-0098', kind: 'rental', issuerTenantId: 't-alnoor',
    customerTenantId: 't-marina', customerName: 'Marina Builders',
    bookingId: 'b-1008',
    lines: [
      { description: 'TP-21 — Tipper daily rate × 6 days', basis: 'Days on hire', quantity: 6, unit: 'day', rateAed: 1100, amountAed: 6600 },
    ],
    subtotalAed: 6600, vatAed: 330, totalAed: 6930,
    issuedAt: new Date(daysAgo(7)).toISOString(), dueAt: daysAgo(7) + 14*86400000, status: 'unpaid',
    mucId: undefined,
  },
  {
    id: 'inv-0091', number: 'INV-AN-0091', kind: 'rental', issuerTenantId: 't-alnoor',
    customerTenantId: null, customerName: 'Bin Saeed Haulage',
    bookingId: 'b-1012',
    lines: [
      { description: 'LB-02 — Lowbed daily rate × 2 days', basis: 'Days on hire', quantity: 2, unit: 'day', rateAed: 1200, amountAed: 2400 },
    ],
    subtotalAed: 2400, vatAed: 120, totalAed: 2520,
    issuedAt: new Date(daysAgo(3)).toISOString(), dueAt: daysAgo(3) + 14*86400000, status: 'paid',
    mucId: undefined,
  },
];

// ── Payments ───────────────────────────────────────────────────────────────────

export const payments: Payment[] = [
  { id: 'pay-001', invoiceId: 'inv-0412', at: new Date(daysAgo(10)).toISOString(), amountAed: 87412.5, method: 'bank_transfer', reference: 'BT-2026-0910-EE', recordedBy: 'u-khalid' },
  { id: 'pay-002', invoiceId: 'inv-0207', at: new Date(daysAgo(5)).toISOString(), amountAed: 38304, method: 'bank_transfer', reference: 'BT-2026-0920-GL', recordedBy: 'u-priya' },
  { id: 'pay-003', invoiceId: 'inv-0091', at: new Date(daysAgo(2)).toISOString(), amountAed: 2520, method: 'cash', reference: 'Cash — Bin Saeed', recordedBy: 'u-omar' },
];

// ── Cost profiles ──────────────────────────────────────────────────────────────

export const costProfiles: { assetId: string; tenantId: string; purchaseValueAed: number; monthlyFinanceAed: number; operatorCostPerHourAed: number; insurancePerMonthAed: number }[] = [
  { assetId: 'a-ex04', tenantId: 't-emirates', purchaseValueAed: 420000, monthlyFinanceAed: 5200, operatorCostPerHourAed: 85, insurancePerMonthAed: 800 },
  { assetId: 'a-ex07', tenantId: 't-emirates', purchaseValueAed: 380000, monthlyFinanceAed: 4800, operatorCostPerHourAed: 80, insurancePerMonthAed: 750 },
  { assetId: 'a-ex11', tenantId: 't-emirates', purchaseValueAed: 350000, monthlyFinanceAed: 4400, operatorCostPerHourAed: 78, insurancePerMonthAed: 700 },
  { assetId: 'a-wl03', tenantId: 't-emirates', purchaseValueAed: 310000, monthlyFinanceAed: 3900, operatorCostPerHourAed: 72, insurancePerMonthAed: 600 },
  { assetId: 'a-wl06', tenantId: 't-emirates', purchaseValueAed: 330000, monthlyFinanceAed: 4100, operatorCostPerHourAed: 75, insurancePerMonthAed: 650 },
  { assetId: 'a-bd02', tenantId: 't-emirates', purchaseValueAed: 580000, monthlyFinanceAed: 7200, operatorCostPerHourAed: 95, insurancePerMonthAed: 1100 },
  { assetId: 'a-bh05', tenantId: 't-emirates', purchaseValueAed: 180000, monthlyFinanceAed: 2200, operatorCostPerHourAed: 55, insurancePerMonthAed: 350 },
  { assetId: 'a-gr01', tenantId: 't-emirates', purchaseValueAed: 290000, monthlyFinanceAed: 3600, operatorCostPerHourAed: 70, insurancePerMonthAed: 580 },
  { assetId: 'a-cp03', tenantId: 't-emirates', purchaseValueAed: 160000, monthlyFinanceAed: 2000, operatorCostPerHourAed: 45, insurancePerMonthAed: 320 },
  { assetId: 'a-gn01', tenantId: 't-emirates', purchaseValueAed: 240000, monthlyFinanceAed: 3000, operatorCostPerHourAed: 60, insurancePerMonthAed: 480 },
  { assetId: 'a-cr02', tenantId: 't-gulflift', purchaseValueAed: 850000, monthlyFinanceAed: 10600, operatorCostPerHourAed: 120, insurancePerMonthAed: 1700 },
  { assetId: 'a-cr05', tenantId: 't-gulflift', purchaseValueAed: 620000, monthlyFinanceAed: 7800, operatorCostPerHourAed: 100, insurancePerMonthAed: 1200 },
  { assetId: 'a-cr08', tenantId: 't-gulflift', purchaseValueAed: 720000, monthlyFinanceAed: 9000, operatorCostPerHourAed: 110, insurancePerMonthAed: 1400 },
  { assetId: 'a-th01', tenantId: 't-gulflift', purchaseValueAed: 280000, monthlyFinanceAed: 3500, operatorCostPerHourAed: 68, insurancePerMonthAed: 560 },
  { assetId: 'a-th04', tenantId: 't-gulflift', purchaseValueAed: 220000, monthlyFinanceAed: 2800, operatorCostPerHourAed: 60, insurancePerMonthAed: 440 },
  { assetId: 'a-fb12', tenantId: 't-alnoor', purchaseValueAed: 280000, monthlyFinanceAed: 3500, operatorCostPerHourAed: 65, insurancePerMonthAed: 560 },
  { assetId: 'a-fb14', tenantId: 't-alnoor', purchaseValueAed: 250000, monthlyFinanceAed: 3200, operatorCostPerHourAed: 62, insurancePerMonthAed: 500 },
  { assetId: 'a-pu51', tenantId: 't-marina', purchaseValueAed: 120000, monthlyFinanceAed: 1500, operatorCostPerHourAed: 35, insurancePerMonthAed: 240 },
  { assetId: 'a-pu52', tenantId: 't-marina', purchaseValueAed: 115000, monthlyFinanceAed: 1450, operatorCostPerHourAed: 34, insurancePerMonthAed: 230 },
  { assetId: 'a-vn01', tenantId: 't-marina', purchaseValueAed: 95000, monthlyFinanceAed: 1200, operatorCostPerHourAed: 30, insurancePerMonthAed: 190 },
];

// ── Report schedules ───────────────────────────────────────────────────────────

export const reportSchedules: ReportSchedule[] = [
  { id: 'rs-kh01', userId: 'u-khalid', reportType: 'Trip & Mileage', scope: 'Project Alpha labels', frequency: 'weekly', runAt: '07:00', weekday: 7, format: 'pdf', nextRunAt: ANCHOR_MS - 2*86400000 + 7*3600000, active: true },
  { id: 'rs-li01', userId: 'u-lina', reportType: 'Location history', scope: 'EX-04', frequency: 'daily', runAt: '18:00', format: 'xlsx', nextRunAt: ANCHOR_MS + 18*3600000, active: true },
];

// ── Report runs ────────────────────────────────────────────────────────────────

export const reportRuns: ReportRun[] = [
  { id: 'rr-001', userId: 'u-khalid', reportType: 'Trip & Mileage', scope: 'Project Alpha labels', from: new Date(daysAgo(7)).toISOString(), to: new Date(ANCHOR_MS).toISOString(), format: 'pdf', createdAt: new Date(daysAgo(7)).toISOString(), scheduleId: 'rs-kh01', status: 'ready', fileName: 'Kasper_TripMileage_Weekly_2026-09-29_to_2026-10-06.pdf' },
  { id: 'rr-002', userId: 'u-khalid', reportType: 'Trip & Mileage', scope: 'Project Alpha labels', from: new Date(daysAgo(14)).toISOString(), to: new Date(daysAgo(7)).toISOString(), format: 'pdf', createdAt: new Date(daysAgo(14)).toISOString(), scheduleId: 'rs-kh01', status: 'ready', fileName: 'Kasper_TripMileage_Weekly_2026-09-22_to_2026-09-29.pdf' },
];

// ── Audit entries ──────────────────────────────────────────────────────────────

export const auditEntries: AuditEntry[] = [
  { id: 'au-001', at: new Date(daysAgo(12)).toISOString(), actorUserId: 'u-sara', action: 'tenant.create', tenantId: 't-palm', detail: 'Tenant Palm Contracting created' },
  { id: 'au-002', at: new Date(daysAgo(10)).toISOString(), actorUserId: 'u-omar', action: 'pairing.create', assetId: 'a-fb12', detail: 'Tracker paired to FB-12' },
  { id: 'au-003', at: new Date(daysAgo(10)).toISOString(), actorUserId: 'u-omar', action: 'pairing.create', assetId: 'a-fb14', detail: 'Tracker paired to FB-14' },
  { id: 'au-004', at: new Date(daysAgo(10)).toISOString(), actorUserId: 'u-omar', action: 'link.create', assetId: 'a-fb12', detail: 'Tracking link created for FB-12 (BK-1011, with ETA)' },
  { id: 'au-005', at: new Date(daysAgo(7)).toISOString(), actorUserId: 'u-priya', action: 'link.revoke', assetId: 'a-cr02', detail: 'Tracking link revoked for CR-02 — manual', reason: 'Link no longer needed' },
  { id: 'au-006', at: new Date(daysAgo(6)).toISOString(), actorUserId: 'u-sara', action: 'asset.view.crossTenant', tenantId: 't-marina', assetId: 'a-ex04', detail: 'Sara Haddad viewed Marina Builders assets' },
  { id: 'au-007', at: new Date(daysAgo(5)).toISOString(), actorUserId: 'u-lina', action: 'user.invite', tenantId: 't-marina', detail: 'Lina Aziz invited Sam Invite (site_user, Business Bay)' },
  { id: 'au-008', at: new Date(daysAgo(3)).toISOString(), actorUserId: 'u-khalid', action: 'muc.issue', assetId: 'a-ex04', detail: 'MUC-2026-09-EX-04-01 issued for EX-04' },
  { id: 'au-009', at: new Date(daysAgo(3)).toISOString(), actorUserId: 'u-khalid', action: 'payment.record', detail: 'Payment of AED 87,412.50 recorded on INV-EE-0412' },
  { id: 'au-010', at: new Date(daysAgo(2)).toISOString(), actorUserId: 'u-khalid', action: 'muc.void', detail: 'MUC-2026-09-WL-03-01 voided — Wrong period', reason: 'Wrong period — booking was extended by 2 days' },
  { id: 'au-011', at: daysAgo(1) + 16.33*3600000, actorUserId: 'u-khalid', action: 'grant.endEarly', assetId: 'a-ex11', detail: 'EX-11 rental ended early by Khalid', reason: 'Payment overdue for two weeks' },
  { id: 'au-012', at: daysAgo(1) + 16.33*3600000, actorUserId: 'u-khalid', action: 'link.revoke', assetId: 'a-ex11', detail: 'Tracking links revoked — access ended early on EX-11' },
  { id: 'au-013', at: daysAgo(1) + 9.33*3600000, actorUserId: 'u-khalid', action: 'muc.issue', assetId: 'a-bd02', detail: 'MUC-2026-09-BD-02-01 issued for BD-02' },
  { id: 'au-014', at: new Date(daysAgo(1)).toISOString(), actorUserId: 'u-ravi', action: 'tracker.configure', detail: 'Tracker CR-08 moved to In stock — intermittent GSM' },
  { id: 'au-015', at: new Date(daysAgo(10)).toISOString(), actorUserId: 'u-khalid', action: 'geofence.create', tenantId: 't-emirates', detail: 'Geofence "Al Quoz Yard — after hours" created' },
  { id: 'au-016', at: new Date(daysAgo(8)).toISOString(), actorUserId: 'u-khalid', action: 'maintenance.plan.create', assetId: 'a-ex04', detail: 'Maintenance plan "500 h service" created for EX-04' },
];

// ── Onboarding drafts ──────────────────────────────────────────────────────────

export const onboardingDrafts: { id: string; createdBy: string; step: 1|2|3|4|5|6; data: unknown; updatedAt: string }[] = [];

// ── Import helper: seed everything ─────────────────────────────────────────────

export const seed = {
  tenants,
  sites,
  users,
  assets,
  trackers,
  pairings,
  bookings,
  grantOverrides,
  trackingLinks,
  labels,
  assetLabels,
  geofences,
  geofenceEvents,
  alerts,
  trackerRequests,
  maintenancePlans,
  serviceRecords,
  mucs,
  invoices,
  payments,
  costProfiles,
  reportSchedules,
  reportRuns,
  auditEntries,
  onboardingDrafts,
  adapters,
};

export default seed;
