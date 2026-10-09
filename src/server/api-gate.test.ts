// H2.8 — the API gate. Every export of src/server/api.ts is either:
//   · PURE:  a formatter or constant that reads no tenant data (allow-listed), or
//   · GATED: its first parameter is a Session, so can() can run, or
//   · DEBT:  known and listed here until it is gated. The list may only shrink.
// A new export that is none of these fails the build. A DEBT item that becomes
// gated must be removed from DEBT, or this test fails.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const api = readFileSync(join(ROOT, 'src/server/api.ts'), 'utf8');

const PURE = new Set([
  'ADAPTER_SERIAL_DUPLICATE', 'LVCAN_MODEL_ERROR', 'aed', 'invoiceStatusLabel', 'hasRole', 'isKasperStaff',
  'auditActions', 'auditEntriesToCsv', 'clockPresets', 'dubaiYesterdayAt', 'fb12PublicPath', 'presetAt',
  'periodRange', 'hoursSourceFor', 'showsUtilisation', 'REPORT_TYPES', 'viewAsGroups',
  'actorName', 'assetCode', 'tenantName', 'useDb', 'hydrateDb', 'nextRowNumber',
  // Public by design: token-gated, no session (spec §11.14).
  'getTrackingLinkState', 'resolveTrackingLink',
]);

const DEBT = new Set([
  'adapterForAsset', 'fittedAssetFor', 'fittingHistory', 'modelFitsAsset', 'stockAdapters',
  'queryAuditEntries', 'invoiceById', 'lastMonthStatements', 'mucForInvoice', 'paidTotal', 'paymentsFor',
  'statementById', 'invoiceView', 'getDieselPrice', 'monthlySeries', 'roiFor', 'append',
  'outboxItems', 'currentMeter', 'planSnapshot', 'buildEcuBreakdown', 'ecuHoursAt', 'getMucByNumber',
  'getMucVerifyStatus', 'getMucsForAsset', 'getReplacementMuc', 'tamperWithMuc', 'markAllRead',
  'markNotificationRead', 'allTrackerRequests', 'hasOpenTrackerRequest', 'trackerRequestForAsset',
  'runDueSchedules', 'assetsWithoutTracker', 'currentPairingForTracker', 'currentTrackerForAsset',
  'pairingHistory', 'pairingTargetsFor', 'stockTrackers', 'activeLinksForAsset', 'expiryOptions',
  'linkEndWords', 'pastLinksForAsset', 'detectTrips', 'engineHoursToday', 'fleetTodayTotals',
  'last7DaysIgnition', 'todayFor', 'fuelToday', 'buildIgnitionBreakdown',
]);

/** Every name exported from api.ts, with the file it comes from. */
function apiExports(): { name: string; file: string }[] {
  const out: { name: string; file: string }[] = [];
  for (const m of api.matchAll(/export \{([^}]*)\} from '\.\/([\w-]+)';/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (name) out.push({ name, file: m[2] });
    }
  }
  return out;
}

/** The first parameter of an exported function, or 'const' for constants. */
function firstParam(name: string, file: string): string | 'const' | 'missing' {
  const path = join(ROOT, 'src/server', `${file}.ts`);
  if (!existsSync(path)) return 'missing';
  const src = readFileSync(path, 'utf8');
  const fn = new RegExp(`export (?:async )?function ${name}\\s*(?:<[^>]*>)?\\(([^)]*)\\)`).exec(src);
  if (fn) return fn[1].split(',')[0].trim();
  if (new RegExp(`export (?:const|let|class|type|interface) ${name}\\b`).test(src)) return 'const';
  return 'missing';
}

const gated = (param: string) => /\bSession\b/.test(param);

describe('api gate (H2.8)', () => {
  const exports = apiExports();

  it('finds the exports this test is about', () => {
    expect(exports.length).toBeGreaterThan(100);
  });

  it('every export is pure, gated (takes a Session first), or listed as debt', () => {
    const unknown: string[] = [];
    for (const { name, file } of exports) {
      if (PURE.has(name) || DEBT.has(name)) continue;
      const p = firstParam(name, file);
      if (p === 'const' || gated(p)) continue;
      unknown.push(`${name} (${file}.ts): ${p}`);
    }
    expect(unknown, 'new ungated export — take session first and check can(), or justify it in PURE').toEqual([]);
  });

  it('every DEBT item is still ungated (remove it from DEBT once it takes a Session)', () => {
    const nowGated: string[] = [];
    for (const name of DEBT) {
      const entry = exports.find(e => e.name === name);
      expect(entry, `${name} is listed as debt but is no longer exported`).toBeDefined();
      const p = firstParam(name, entry!.file);
      if (p === 'const' || gated(p)) nowGated.push(name);
    }
    expect(nowGated, 'these now take a Session — remove them from DEBT').toEqual([]);
  });

  it('PURE and DEBT are disjoint and only name real exports', () => {
    for (const name of PURE) expect(DEBT.has(name), `${name} in both lists`).toBe(false);
    const names = new Set(exports.map(e => e.name));
    for (const name of [...PURE, ...DEBT]) expect(names.has(name), `${name} is not exported`).toBe(true);
  });
});
