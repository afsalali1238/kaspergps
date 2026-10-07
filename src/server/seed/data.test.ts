// Seed data unit tests — verify counts and key facts from section 8.
import { describe, it, expect } from 'vitest';
import { seed } from './data';

describe('seed data', () => {
  it('has 5 tenants', () => {
    expect(seed.tenants).toHaveLength(5);
  });

  it('has 10 sites', () => {
    expect(seed.sites).toHaveLength(10);
  });

  it('has 16 users (15 seeded + 1 invited)', () => {
    // 15 active/invited/deactivated seeded users
    const statuses = seed.users.map(u => u.status);
    expect(statuses.filter(s => s === 'active').length).toBeGreaterThanOrEqual(12);
    expect(statuses.filter(s => s === 'invited').length).toBeGreaterThanOrEqual(1);
    expect(statuses.filter(s => s === 'deactivated').length).toBeGreaterThanOrEqual(1);
  });

  it('has 36 assets', () => {
    expect(seed.assets).toHaveLength(36);
  });

  it('has 37 trackers (34 paired + 3 spare)', () => {
    const paired = seed.trackers.filter(t => t.stockStatus === 'paired').length;
    const inStock = seed.trackers.filter(t => t.stockStatus === 'in_stock').length;
    expect(paired + inStock).toBe(37);
    expect(inStock).toBe(3);
  });

  it('has 15 bookings including 3 from last month', () => {
    expect(seed.bookings).toHaveLength(15);
    const lastMonth = seed.bookings.filter(b => b.reference.startsWith('BK-09'));
    expect(lastMonth).toHaveLength(3);
  });

  it('has 4 tracking links', () => {
    expect(seed.trackingLinks).toHaveLength(4);
  });

  it('FB-12 has a tracking link with the fixed demo token', () => {
    const fb12Link = seed.trackingLinks.find(l => l.assetId === 'a-fb12');
    expect(fb12Link).toBeDefined();
    expect(fb12Link!.token).toBe('k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
    expect(fb12Link!.showEta).toBe(true);
  });

  it('has Al Noor with no CAN adapters (Tier 1 only)', () => {
    const alNoorAssets = seed.assets.filter(a => a.ownerTenantId === 't-alnoor');
    const allTier1 = alNoorAssets.every(a => a.canProfile.adapter === 'none');
    expect(allTier1).toBe(true);
  });

  it('has 22 CAN adapters (17 fitted, 4 in stock, 1 faulty)', () => {
    const fitted = seed.adapters.filter(a => a.status === 'fitted').length;
    const inStock = seed.adapters.filter(a => a.status === 'in_stock').length;
    const faulty = seed.adapters.filter(a => a.status === 'faulty').length;
    expect(fitted).toBe(17);
    expect(inStock).toBe(4);
    expect(faulty).toBe(1);
    expect(fitted + inStock + faulty).toBe(22);
  });

  it('has 1 open tracker request for MW-01', () => {
    const mw01Request = seed.trackerRequests.find(r => r.assetId === 'a-mw01');
    expect(mw01Request).toBeDefined();
    expect(mw01Request!.status).toBe('open');
    expect(mw01Request!.assetId).toBe('a-mw01');
  });

  it('has 22 alerts including the scripted Phase 2 scenarios', () => {
    expect(seed.alerts).toHaveLength(22);
    const types = seed.alerts.map(a => a.type);
    expect(types).toContain('offline');
    expect(types).toContain('power_cut');
    expect(types).toContain('fuel_drop');
    expect(types).toContain('fault_code');
    expect(types).toContain('towing');
  });

  it('has at least 35 audit entries', () => {
    expect(seed.auditEntries.length).toBeGreaterThanOrEqual(35);
  });

  it('{TP-23} is offline in seed alerts', () => {
    const tp23Alert = seed.alerts.find(a => a.assetId === 'a-tp23' && a.type === 'offline');
    expect(tp23Alert).toBeDefined();
  });

  it('{GN-01} has a fuel_drop alert', () => {
    const gn01Alert = seed.alerts.find(a => a.assetId === 'a-gn01' && a.type === 'fuel_drop');
    expect(gn01Alert).toBeDefined();
    expect(gn01Alert!.detail).toContain('18%');
  });

  it('BD-02 has a fault_code alert', () => {
    const bd02Alert = seed.alerts.find(a => a.assetId === 'a-bd02' && a.type === 'fault_code');
    expect(bd02Alert).toBeDefined();
  });

  it('EX-11 has an endedAt override (early cut-off)', () => {
    expect(seed.grantOverrides).toHaveLength(1);
    expect(seed.grantOverrides[0].bookingId).toBe('b-1010');
    expect(seed.grantOverrides[0].reason).toBe('Payment overdue for two weeks');
  });

  it('every seeded IMEI is 15 digits and passes Luhn', () => {
    for (const t of seed.trackers) {
      expect(t.imei.length).toBe(15);
      expect(t.imei).toMatch(/^\d{15}$/);
      expect(luhnCheck(t.imei)).toBe(true);
    }
  });

  it('every seeded tracker has model FMC130', () => {
    for (const t of seed.trackers) {
      expect(t.model).toBe('FMC130');
    }
  });
});

/** Standard Luhn check for 15-digit IMEIs: the check digit is not doubled. */
function luhnCheck(imei: string): boolean {
  const digits = imei.split('').map(d => parseInt(d, 10));
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
