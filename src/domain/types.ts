// Domain types for Kasper GPS Dashboard
// Branding: say "Asset", "Tracker", "CAN adapter" and "Kasper" — see the words
// table in the build prompt.

export type TenantType = 'vendor' | 'client' | 'both';
export type Role = 'kasper_admin' | 'kasper_ops' | 'tenant_admin' | 'site_user';

/** The View as menu's role dropdown: one role, or every role. */
export type ViewAsRoleFilter = Role | 'all';
export type Adapter = 'none' | 'LVCAN200' | 'ALL-CAN300';
export type AssetStatus = 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker';
export type AssetClass = 'truck' | 'light_vehicle' | 'plant' | 'lifting' | 'power';
export type BookingStatus = 'scheduled' | 'active' | 'closed' | 'cancelled';
export type StockStatus = 'in_stock' | 'paired' | 'faulty' | 'retired';
export type LinkRevokeReason = 'manual' | 'job_closed' | 'booking_cancelled' | 'access_ended';
export type MucStatus = 'sealed' | 'voided';
export type InvoiceStatus = 'unpaid' | 'part_paid' | 'paid' | 'overdue' | 'void';
export type PaymentMethod = 'bank_transfer' | 'cheque' | 'cash' | 'simulated_online';
export type SimBehaviour = 'parked' | 'works_at_site' | 'drives_between_sites' | 'stationary_24h' | 'light_vehicle_day';
export type ReportFormat = 'pdf' | 'xlsx';
export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type GeofenceKind = 'site' | 'job' | 'restricted' | 'yard';
export type GeofenceShapeType = 'circle' | 'polygon';
export type TrackerSleepMode = 'off' | 'deep' | 'gps';
export type TrackerRequestStatus = 'open' | 'done' | 'declined';
export type MucState = 'en_route' | 'arrived' | 'unavailable';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  status: 'active' | 'suspended';
  createdAt: string | number;
}

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  center: LatLng;
  radiusM: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string | null;
  siteIds: string[];
  status: 'active' | 'invited' | 'deactivated';
  title?: string;
}

export type ParamKey =
  | 'gnss'
  | 'speed'
  | 'ignition'
  | 'movement'
  | 'extVoltage'
  | 'intBattery'
  | 'gsm'
  | 'gnssOdometer'
  | 'accelEvents'
  | 'fuelLevel'
  | 'fuelUsed'
  | 'fuelRate'
  | 'rpm'
  | 'canOdometer'
  | 'coolantTemp'
  | 'engineLoad'
  | 'engineHours'
  | 'faultCodes'
  | 'adBlue';

export interface CanProfile {
  adapter: Adapter;
  supported: ParamKey[];
  checkedAt?: string;
  notes?: string;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: string;
  assetClass: AssetClass;
  make: string;
  model: string;
  year: number;
  plateOrSerial: string;
  ownerTenantId: string;
  homeSiteId: string;
  tankLitres?: number;
  canProfile: CanProfile;
  status: AssetStatus;
  behaviour: SimBehaviour;
  createdAt: string | number;
  createdBy: string;
  retiredAt?: string;
}

export interface Tracker {
  id: string;
  assetId?: string | null;
  imei: string;
  model: 'FMC130';
  simIccid: string;
  firmware: string;
  pingIntervalSec: number;
  sleepMode: TrackerSleepMode;
  stockStatus: StockStatus;
  registeredAt: string | number;
  registeredBy: string;
  flaggedForSupport?: { by: string; at: string | number; note: string };
}

export interface Pairing {
  id: string;
  trackerId: string;
  assetId: string;
  from: string | number;
  to: string | number | null;
}

export interface Reading {
  trackerId: string;
  deviceTime: string;
  receivedAt: string;
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number;
  satellites: number;
  ignition: boolean;
  moving: boolean;
  extVoltage: number;
  intBattery: number;
  gsm: 0 | 1 | 2 | 3 | 4 | 5;
  gnssOdometerKm: number;
  fuelLevelPct?: number;
  fuelUsedL?: number;
  fuelRateLph?: number;
  rpm?: number;
  canOdometerKm?: number;
  coolantC?: number;
  engineLoadPct?: number;
  engineHours?: number;
  activeDtcs?: string[];
  adBluePct?: number;
  event?: 'harsh_brake' | 'harsh_accel' | 'harsh_corner' | 'overspeed' | 'power_cut' | 'towing';
}

export type AlertType =
  | 'offline'
  | 'power_cut'
  | 'low_battery'
  | 'towing'
  | 'overspeed'
  | 'harsh_driving'
  | 'fuel_drop'
  | 'fault_code'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'after_hours_move'
  | 'maintenance_due'
  | 'maintenance_overdue'
  | 'invoice_overdue'
  | 'idle'
  | 'low_fuel';

export interface Alert {
  id: string;
  assetId: string | undefined;
  tenantId?: string;
  type: AlertType;
  openedAt: string | number;
  closedAt?: string | number;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  detail: string;
}

export interface OwnershipPeriod {
  assetId: string;
  tenantId: string;
  from: string | number;
  to: string | number | null;
}

export interface Booking {
  id: string;
  assetId: string;
  ownerTenantId: string;
  renterTenantId: string | null;
  renterName?: string;
  renterSiteId: string | null;
  start: string | number;
  end: string | number;
  status: BookingStatus;
  cancelledAt?: string | number;
  closedAt?: string | number;
  reference: string;
  rateType: 'daily' | 'hourly';
  rateAed: number;
  minHoursPerDay?: number;
  destination?: { name: string; lat: number; lng: number };
}

export interface GrantOverride {
  bookingId: string;
  endedAt: string | number;
  endedBy: string;
  reason: string;
}

export interface TrackingLink {
  id: string;
  token: string;
  assetId: string;
  bookingId: string | null;
  createdBy: string;
  createdAt: string | number;
  expiresAt: string | number;
  revokedAt?: string | number;
  revokedBy?: string;
  revokeReason?: LinkRevokeReason;
  showEta: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  at: string | number;
  text: string;
  read: boolean;
  href?: string;
}

export interface AuditEntry {
  id: string;
  at: string | number;
  actorUserId: string;
  action: string;
  tenantId?: string;
  assetId?: string;
  bookingId?: string;
  detail: string;
  reason?: string;
}

export interface Label {
  id: string;
  tenantId: string;
  name: string;
  createdBy: string;
  createdAt: string | number;
}

export interface AssetLabel {
  labelId: string;
  assetId: string;
  tenantId: string;
}

export interface Geofence {
  id: string;
  tenantId: string;
  name: string;
  kind: GeofenceKind;
  shape: { type: 'circle'; center: LatLng; radiusM: number } | { type: 'polygon'; points: LatLng[] };
  siteId?: string;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  afterHoursOnly?: { from: string | number; to: string | number;};
  assetIds: 'all' | string[];
  createdBy: string;
  createdAt: string | number;
}

export interface GeofenceEvent {
  id: string;
  geofenceId: string;
  assetId: string;
  type: 'enter' | 'exit';
  at: string | number;
}

export interface ReportRun {
  id: string;
  userId: string;
  reportType: string;
  scope: string;
  from: string | number;
  to: string | number;
  format: ReportFormat;
  createdAt: string | number;
  scheduleId?: string;
  status: 'ready' | 'skipped';
  skipReason?: string;
  fileName?: string;
  /** Scope's asset ids, kept so "Download again" can rebuild the file (spec §11.13). */
  assetIds?: string[];
}

export interface ReportSchedule {
  id: string;
  userId: string;
  reportType: string;
  scope: string;
  frequency: ReportFrequency;
  runAt: string;
  weekday?: number;
  format: ReportFormat;
  nextRunAt: string | number;
  active: boolean;
  /** Assets the schedule reports on. Seeded rows predate this and may omit it. */
  assetIds?: string[];
  /** Runs skipped in a row; two pause the schedule. */
  consecutiveSkips?: number;
}

export interface MaintenancePlan {
  id: string;
  tenantId: string;
  assetId: string;
  name: string;
  basis: 'engine_hours' | 'km' | 'days';
  hoursSource?: 'ecu' | 'estimated';
  kmSource?: 'can' | 'gps';
  interval: number;
  dueSoonAt: number;
  lastDoneAt: string | number;
  lastDoneValue: number;
}

export interface ServiceRecord {
  id: string;
  planId?: string;
  assetId: string;
  tenantId: string;
  doneAt: string | number;
  value: number;
  notes: string;
  costAed: number;
  createdBy: string;
  fromFaultCode?: string;
}

export interface MucPayload {
  version: 1;
  asset: { code: string; name: string; make: string; model: string; serial: string };
  owner: { tenantId: string; name: string };
  renter?: { tenantId: string; name: string };
  periodFrom: string | number;
  periodTo: string | number;
  openingHoursEcu: number;
  closingHoursEcu: number;
  billableHours: number;
  days: { date: string; engineHours: number; workingHours: number; idlingHours: number; gapMinutes: number }[];
  gaps: { from: string | number; to: string | number;}[];
  gapRule: 'delta_disclosed';
  source: 'ECU';
}

export interface Muc {
  id: string;
  number: string;
  assetId: string;
  ownerTenantId: string;
  bookingId?: string;
  periodFrom: string | number;
  periodTo: string | number;
  payload: MucPayload;
  sealSha256: string;
  issuedAt: string | number;
  issuedBy: string;
  status: MucStatus;
  voidedAt?: string | number;
  voidedBy?: string;
  voidReason?: string;
  replacesMucId?: string;
  reissueOf?: string;
}

export interface InvoiceLine {
  description: string;
  basis: 'ECU' | 'Estimated' | 'Days on hire' | 'Tracker · Tier 1' | 'Tracker · Tier 2' | 'Tracker · Tier 3';
  quantity: number;
  unit: 'h' | 'day' | 'tracker-month';
  rateAed: number;
  amountAed: number;
}

export interface Invoice {
  id: string;
  number: string;
  kind: 'rental' | 'gps_subscription';
  issuerTenantId: string | 'kasper';
  customerTenantId: string | null;
  customerName: string;
  bookingId?: string;
  mucId?: string;
  lines: InvoiceLine[];
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
  issuedAt: string | number;
  dueAt: string | number;
  status: InvoiceStatus;
}

export interface Payment {
  id: string;
  invoiceId: string;
  at: string | number;
  amountAed: number;
  method: PaymentMethod;
  reference: string;
  recordedBy: string;
}

export interface AssetCostProfile {
  assetId: string;
  tenantId: string;
  purchaseValueAed: number;
  monthlyFinanceAed: number;
  operatorCostPerHourAed: number;
  insurancePerMonthAed: number;
}

export interface TrackerRequest {
  id: string;
  tenantId: string;
  assetId: string;
  requestedBy: string;
  at: string | number;
  note: string;
  status: TrackerRequestStatus;
  handledBy?: string;
  handledAt?: string;
}

export interface CanAdapter {
  id: string;
  serial: string;
  model: 'LVCAN200' | 'ALL-CAN300';
  status: 'in_stock' | 'fitted' | 'faulty' | 'retired';
  assetId: string | null;
  fittedAt?: string;
  registeredAt: string | number;
}

export interface AdapterFitting {
  id: string;
  adapterId: string;
  assetId: string;
  from: string | number;
  to: string | number | null;
}

export interface OnboardingDraft {
  id: string;
  createdBy: string;
  step: 1 | 2 | 3 | 4 | 5 | 6;
  data: unknown;
  updatedAt: string | number;
}

export interface Session {
  userId: string;
  user: User;
  tenantId: string | null;
  siteIds: string[];
  role: Role;
  isKasper: boolean;
}

export interface Clock {
  anchor: number;
  offsetMs: number;
  now: number;
}

export interface DemoSwitches {
  phase: 'day_one' | 'phase2' | 'later';
  showHidden: boolean;
  salesView: boolean;
}

export type Capabilities =
  | 'asset.view'
  | 'asset.viewHistory'
  | 'asset.viewTelemetry'
  | 'asset.edit'
  | 'report.run'
  | 'link.create'
  | 'link.revoke'
  | 'grant.endEarly'
  | 'alert.view'
  | 'alert.acknowledge'
  | 'users.manage'
  | 'sites.manage'
  | 'console.tenants.view'
  | 'console.tenants.manage'
  | 'console.assets.manage'
  | 'console.trackers.view'
  | 'console.trackers.manage'
  | 'console.trackers.configure'
  | 'console.audit.view'
  | 'label.view'
  | 'label.manage'
  | 'geofence.view'
  | 'geofence.manage'
  | 'playback.view'
  | 'report.schedule'
  | 'maintenance.view'
  | 'maintenance.manage'
  | 'cost.view'
  | 'muc.view'
  | 'muc.issue'
  | 'muc.void'
  | 'billing.view'
  | 'billing.recordPayment'
  | 'billing.pay'
  | 'console.billing.view'
  | 'console.billing.manage'
  | 'asset.create'
  | 'asset.retire'
  | 'tracker.request'
  | 'console.assets.transfer'
  | 'console.adapters.manage'
  | 'console.bookings.view'
  | 'console.bookings.manage'
  | 'console.staff.manage'
  | 'console.import'
  | 'console.bookings.view'
  | 'console.staff.manage';

export interface FeatureDef {
  key: string;
  label: string;
  needs: ParamKey[];
  phase: 'day_one' | 'phase2' | 'later';
  group: string;
  /** Optional adapter condition — e.g. billing-grade ECU hours need ALL-CAN300 (spec 6.3). */
  adapter?: Adapter[];
}

export interface FeatureVisibility {
  key: string;
  visible: boolean;
  reason?: string;
}

/** A one-off service task raised from a fault code (Tier 3 only). */
export interface MaintenanceTask {
  id: string;
  assetId: string;
  title: string;
  fromFaultCode: string;
  createdAt: number;
  doneAt?: number;
  doneBy?: string;
}
