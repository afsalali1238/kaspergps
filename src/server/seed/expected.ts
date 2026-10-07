// Expected visibility results at anchor.
// Compares against: access tests, /dev/access explorer, Features panel.
// If code and fixture disagree, fix the code — not the fixture.



export interface ExpectedUserVisibility {
  userId: string;
  userName: string;
  role: string;
  tenantId: string | null;
  assets: ExpectedAsset[];
}

export interface ExpectedAsset {
  id: string;
  code: string;
  relationship: 'kasper' | 'owner' | 'renter' | 'none';
  window: { start: number; end: number } | null;
}

export interface ExpectedAssetStatus {
  id: string;
  code: string;
  status: string;
  features: string[];
  tier: number;
}

// ── User visibility at anchor ─────────────────────────────────────────────────
// Derived from access.test.ts — the source of truth for who sees what.

export const expectedUserVisibility: ExpectedUserVisibility[] = [
  // Kasper
  {
    userId: 'u-sara',
    userName: 'Sara Haddad',
    role: 'kasper_admin',
    tenantId: null,
    assets: [], // Sara sees all 36 assets — listed via API, not enumerated here
  },
  {
    userId: 'u-ravi',
    userName: 'Ravi Menon',
    role: 'kasper_ops',
    tenantId: null,
    assets: [], // Ravi sees all 36 assets
  },
  // Al Noor
  {
    userId: 'u-omar',
    userName: 'Omar Saleh',
    role: 'tenant_admin',
    tenantId: 't-alnoor',
    assets: [
      { id: 'a-fb12', code: 'FB-12', relationship: 'owner', window: null },
      { id: 'a-fb14', code: 'FB-14', relationship: 'owner', window: null },
      { id: 'a-lb02', code: 'LB-02', relationship: 'owner', window: null },
      { id: 'a-lb05', code: 'LB-05', relationship: 'owner', window: null },
      { id: 'a-tp21', code: 'TP-21', relationship: 'owner', window: null },
      { id: 'a-tp22', code: 'TP-22', relationship: 'owner', window: null },
      { id: 'a-tp23', code: 'TP-23', relationship: 'owner', window: null },
      { id: 'a-wt07', code: 'WT-07', relationship: 'owner', window: null },
      { id: 'a-wt08', code: 'WT-08', relationship: 'owner', window: null },
      { id: 'a-pu31', code: 'PU-31', relationship: 'owner', window: null },
    ],
  },
  {
    userId: 'u-hessa',
    userName: 'Hessa Al Mansoori',
    role: 'tenant_admin',
    tenantId: 't-alnoor',
    assets: [], // Same as Omar — all Al Noor assets
  },
  // Emirates
  {
    userId: 'u-khalid',
    userName: 'Khalid Rahman',
    role: 'tenant_admin',
    tenantId: 't-emirates',
    assets: [
      { id: 'a-ex04', code: 'EX-04', relationship: 'owner', window: null },
      { id: 'a-ex07', code: 'EX-07', relationship: 'owner', window: null },
      { id: 'a-ex11', code: 'EX-11', relationship: 'owner', window: null },
      { id: 'a-wl03', code: 'WL-03', relationship: 'owner', window: null },
      { id: 'a-wl06', code: 'WL-06', relationship: 'owner', window: null },
      { id: 'a-bd02', code: 'BD-02', relationship: 'owner', window: null },
      { id: 'a-bh05', code: 'BH-05', relationship: 'owner', window: null },
      { id: 'a-gr01', code: 'GR-01', relationship: 'owner', window: null },
      { id: 'a-cp03', code: 'CP-03', relationship: 'owner', window: null },
      { id: 'a-gn01', code: 'GN-01', relationship: 'owner', window: null },
      { id: 'a-gn02', code: 'GN-02', relationship: 'owner', window: null },
      { id: 'a-ld09', code: 'LD-09', relationship: 'owner', window: null },
    ],
  },
  // Gulf Lift
  {
    userId: 'u-priya',
    userName: 'Priya Nair',
    role: 'tenant_admin',
    tenantId: 't-gulflift',
    assets: [
      { id: 'a-cr02', code: 'CR-02', relationship: 'owner', window: null },
      { id: 'a-cr05', code: 'CR-05', relationship: 'owner', window: null },
      { id: 'a-cr08', code: 'CR-08', relationship: 'owner', window: null },
      { id: 'a-th01', code: 'TH-01', relationship: 'owner', window: null },
      { id: 'a-th04', code: 'TH-04', relationship: 'owner', window: null },
      { id: 'a-fl09', code: 'FL-09', relationship: 'owner', window: null },
      { id: 'a-fl10', code: 'FL-10', relationship: 'owner', window: null },
      { id: 'a-bl01', code: 'BL-01', relationship: 'owner', window: null },
      { id: 'a-sl02', code: 'SL-02', relationship: 'owner', window: null },
      { id: 'a-mw01', code: 'MW-01', relationship: 'owner', window: null },
      { id: 'a-pu41', code: 'PU-41', relationship: 'owner', window: null },
      // Rented BD-02 (BK-1007)
      { id: 'a-bd02', code: 'BD-02', relationship: 'renter', window: { start: new Date('2026-10-03T14:00:00+04:00').getTime(), end: new Date('2026-10-07T10:00:00+04:00').getTime() } },
    ],
  },
  // Marina — Lina (tenant_admin)
  {
    userId: 'u-lina',
    userName: 'Lina Aziz',
    role: 'tenant_admin',
    tenantId: 't-marina',
    assets: [
      { id: 'a-pu51', code: 'PU-51', relationship: 'owner', window: null },
      { id: 'a-pu52', code: 'PU-52', relationship: 'owner', window: null },
      { id: 'a-vn01', code: 'VN-01', relationship: 'owner', window: null },
      // Rented EX-04 (BK-1001)
      { id: 'a-ex04', code: 'EX-04', relationship: 'renter', window: { start: new Date('2026-10-04T18:00:00+04:00').getTime(), end: new Date('2026-10-11T06:00:00+04:00').getTime() } },
      // Rented CR-02 (BK-1002)
      { id: 'a-cr02', code: 'CR-02', relationship: 'renter', window: { start: new Date('2026-10-01T15:00:00+04:00').getTime(), end: new Date('2026-10-09T06:00:00+04:00').getTime() } },
    ],
  },
  // Marina — Ahmed (site_user, Dubai Hills)
  {
    userId: 'u-ahmed',
    userName: 'Ahmed Yousef',
    role: 'site_user',
    tenantId: 't-marina',
    assets: [
      { id: 'a-pu51', code: 'PU-51', relationship: 'owner', window: null },
      // Rented EX-04 to Dubai Hills (BK-1001)
      { id: 'a-ex04', code: 'EX-04', relationship: 'renter', window: { start: new Date('2026-10-04T18:00:00+04:00').getTime(), end: new Date('2026-10-11T06:00:00+04:00').getTime() } },
    ],
  },
  // Marina — John (site_user, Business Bay + JVC Villas)
  {
    userId: 'u-john',
    userName: 'John Mathew',
    role: 'site_user',
    tenantId: 't-marina',
    assets: [
      { id: 'a-pu52', code: 'PU-52', relationship: 'owner', window: null },
      { id: 'a-vn01', code: 'VN-01', relationship: 'owner', window: null },
      // Rented CR-02 to Business Bay (BK-1002)
      { id: 'a-cr02', code: 'CR-02', relationship: 'renter', window: { start: new Date('2026-10-01T15:00:00+04:00').getTime(), end: new Date('2026-10-09T06:00:00+04:00').getTime() } },
    ],
  },
  // Marina — Anil (site_user, JVC Villas)
  {
    userId: 'u-anil',
    userName: 'Anil Kumar',
    role: 'site_user',
    tenantId: 't-marina',
    assets: [
      { id: 'a-vn01', code: 'VN-01', relationship: 'owner', window: null },
    ],
  },
  // Marina — Karim (site_user, deactivated)
  {
    userId: 'u-karim',
    userName: 'Karim Old',
    role: 'site_user',
    tenantId: 't-marina',
    assets: [], // deactivated — can't sign in
  },
  // Marina — Sam (site_user, invited)
  {
    userId: 'u-sam',
    userName: 'Sam Invite',
    role: 'site_user',
    tenantId: 't-marina',
    assets: [], // invited — first sign-in activates
  },
  // Palm — Fatima (tenant_admin)
  {
    userId: 'u-fatima',
    userName: 'Fatima Noor',
    role: 'tenant_admin',
    tenantId: 't-palm',
    assets: [
      // Rented WL-06 (BK-1004)
      { id: 'a-wl06', code: 'WL-06', relationship: 'renter', window: { start: new Date('2026-10-05T15:00:00+04:00').getTime(), end: new Date('2026-10-15T06:00:00+04:00').getTime() } },
      // Rented TH-01 (BK-1005)
      { id: 'a-th01', code: 'TH-01', relationship: 'renter', window: { start: new Date('2026-10-02T15:00:00+04:00').getTime(), end: new Date('2026-10-05T06:00:00+04:00').getTime() } },
      // Rented GN-01 (BK-1006)
      { id: 'a-gn01', code: 'GN-01', relationship: 'renter', window: { start: new Date('2026-10-01T14:00:00+04:00').getTime(), end: new Date('2026-10-09T12:00:00+04:00').getTime() } },
    ],
  },
  // Palm — Rashid (site_user, Palm Crescent)
  {
    userId: 'u-rashid',
    userName: 'Rashid Ali',
    role: 'site_user',
    tenantId: 't-palm',
    assets: [
      // Rented WL-06 to Palm Crescent (BK-1004)
      { id: 'a-wl06', code: 'WL-06', relationship: 'renter', window: { start: new Date('2026-10-05T15:00:00+04:00').getTime(), end: new Date('2026-10-15T06:00:00+04:00').getTime() } },
    ],
  },
  // Palm — Deepa (site_user, Dubai South + Palm Crescent)
  {
    userId: 'u-deepa',
    userName: 'Deepa Rajan',
    role: 'site_user',
    tenantId: 't-palm',
    assets: [
      // Rented TH-01 to Dubai South (BK-1005)
      { id: 'a-th01', code: 'TH-01', relationship: 'renter', window: { start: new Date('2026-10-02T15:00:00+04:00').getTime(), end: new Date('2026-10-05T06:00:00+04:00').getTime() } },
      // Rented GN-01 to Dubai South (BK-1006)
      { id: 'a-gn01', code: 'GN-01', relationship: 'renter', window: { start: new Date('2026-10-01T14:00:00+04:00').getTime(), end: new Date('2026-10-09T12:00:00+04:00').getTime() } },
      // Rented WL-06 to Palm Crescent (BK-1004)
      { id: 'a-wl06', code: 'WL-06', relationship: 'renter', window: { start: new Date('2026-10-05T15:00:00+04:00').getTime(), end: new Date('2026-10-15T06:00:00+04:00').getTime() } },
    ],
  },
];

// ── Asset status and features at anchor ──────────────────────────────────────
// Derived from the asset table (8.2) and feature registry.

export const expectedAssetStatus: ExpectedAssetStatus[] = [
  { id: 'a-fb12', code: 'FB-12', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-fb14', code: 'FB-14', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-lb02', code: 'LB-02', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-lb05', code: 'LB-05', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-tp21', code: 'TP-21', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-tp22', code: 'TP-22', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-tp23', code: 'TP-23', status: 'offline', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-wt07', code: 'WT-07', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-wt08', code: 'WT-08', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-pu31', code: 'PU-31', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-ex04', code: 'EX-04', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'adblue'], tier: 3 },
  { id: 'a-ex07', code: 'EX-07', status: 'offline', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'adblue'], tier: 3 },
  { id: 'a-ex11', code: 'EX-11', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'adblue'], tier: 3 },
  { id: 'a-wl03', code: 'WL-03', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-wl06', code: 'WL-06', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-bd02', code: 'BD-02', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-bh05', code: 'BH-05', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle'], tier: 3 },
  { id: 'a-gr01', code: 'GR-01', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle'], tier: 3 },
  { id: 'a-cp03', code: 'CP-03', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-gn01', code: 'GN-01', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle'], tier: 3 },
  { id: 'a-gn02', code: 'GN-02', status: 'stale', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-ld09', code: 'LD-09', status: 'no_tracker', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-cr02', code: 'CR-02', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-cr05', code: 'CR-05', status: 'stale', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-cr08', code: 'CR-08', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-th01', code: 'TH-01', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults'], tier: 3 },
  { id: 'a-th04', code: 'TH-04', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'adblue'], tier: 3 },
  { id: 'a-fl09', code: 'FL-09', status: 'unknown', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-fl10', code: 'FL-10', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-bl01', code: 'BL-01', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-sl02', code: 'SL-02', status: 'offline', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-mw01', code: 'MW-01', status: 'no_tracker', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'], tier: 1 },
  { id: 'a-pu41', code: 'PU-41', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle'], tier: 2 },
  { id: 'a-pu51', code: 'PU-51', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle', 'hours.ecuPartial'], tier: 2 },
  { id: 'a-pu52', code: 'PU-52', status: 'idle', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle', 'hours.ecuPartial'], tier: 2 },
  { id: 'a-vn01', code: 'VN-01', status: 'live', features: ['location.live', 'status', 'history.track', 'trips', 'alerts.offline', 'power.status', 'connection.quality', 'hours.ignition', 'engine.live', 'odometer.can', 'faults', 'fuel.level', 'fuel.used', 'fuel.idle', 'hours.ecuPartial'], tier: 2 },
];

// ── Test helpers ─────────────────────────────────────────────────────────────
export function assertUserVisibility(
  actual: ExpectedUserVisibility[],
  expected: ExpectedUserVisibility[],
): void {
  for (const exp of expected) {
    const act = actual.find(a => a.userId === exp.userId);
    if (!act) throw new Error(`Missing user ${exp.userId}`);
    const actCodes = act.assets.map(a => a.code).sort();
    const expCodes = exp.assets.map(a => a.code).sort();
    if (JSON.stringify(actCodes) !== JSON.stringify(expCodes)) {
      throw new Error(`User ${exp.userId}: expected [${expCodes}] got [${actCodes}]`);
    }
  }
}
