// Server API — all reads and writes go through here.
// Architecture rule 1: components never import the store, seed or telemetry modules.
// Every function takes a session first and delegates access to access.ts.

import type { Session } from '@/domain/types';
import { db, type DbRow, touch } from '@/server/db';
import { computeStatus } from '@/server/telemetry/simulator';

import { can, isKasperStaff } from '@/server/capabilities';
import * as clock from '@/lib/clock';

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Auth

export interface SignInResult {
  session: Session;
  /** Shown once after the first sign-in of an invited user. */
  notice?: string;
}

/**
 * Sign-in for an email and password. The password is not checked (any password
 * works in the demo), but an empty field is refused like a wrong password.
 */
export async function signIn(email: string, password: string): Promise<ApiResult<SignInResult>> {
  const address = email.trim().toLowerCase();
  if (!address || !password) {
    return { success: false, error: 'Email or password is incorrect.' };
  }
  const user = db.getState().users.find(u => u.email.toLowerCase() === address);
  if (!user) {
    return { success: false, error: "You don't have an account. Please contact your administrator." };
  }
  return signInAs(user.id);
}

/**
 * The sign-in checks for one user: the same for the sign-in form and the demo
 * bar's View as. A deactivated user or a suspended company is refused. An
 * invited user becomes active on first sign-in.
 */
export function signInAs(userId: string): ApiResult<SignInResult> {
  const user = db.getState().users.find(u => u.id === userId);
  if (!user) {
    return { success: false, error: "You don't have an account. Please contact your administrator." };
  }
  if (user.status === 'deactivated') {
    return { success: false, error: 'Your account is no longer active. Contact your company admin.' };
  }
  const tenant = user.tenantId ? db.getState().tenants.find(t => t.id === user.tenantId) : null;
  if (tenant && tenant.status === 'suspended') {
    return { success: false, error: "Your company's account is suspended. Contact Kasper." };
  }
  if (user.status === 'invited') {
    user.status = 'active';
    touch('users');
    const first = user.name.split(' ')[0];
    return {
      success: true,
      data: { session: buildSession(user), notice: `Welcome to Kasper, ${first}.` },
    };
  }
  return { success: true, data: { session: buildSession(user) } };
}

function buildSession(user: DbRow<'users'>): Session {
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: isKasperStaff(user.role),
  };
}

// Asset reads
export async function getAsset(session: Session, assetId: string): Promise<ApiResult<AssetView>> {
  const access = can(session, 'asset.view', assetId);
  if (!access) {
    return { success: false, error: 'Asset not found' };
  }
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) {
    return { success: false, error: 'Asset not found' };
  }
  if (session.isKasper && asset.ownerTenantId !== session.tenantId) {
    // audit entry would go here
  }
  return { success: true, data: assetToView(asset, session) };
}

export async function getVisibleAssets(session: Session): Promise<ApiResult<AssetView[]>> {
  const access = can(session, 'asset.view');
  if (!access) {
    return { success: false, error: 'Access denied' };
  }
  const all = db.getState().assets.filter(a => assetVisibleTo(session, a));
  return { success: true, data: all.map(a => assetToView(a, session)) };
}

function assetVisibleTo(session: Session, asset: DbRow<'assets'>): boolean {
  if (session.isKasper) return true;
  if (asset.ownerTenantId === session.tenantId) return true;
  const booking = db.getState().bookings.find(b => b.assetId === asset.id && isBookingActive(b));
  if (booking && booking.renterTenantId === session.tenantId) {
    const nowMs = clock.now();
    return new Date(booking.start).getTime() <= nowMs && nowMs <= new Date(booking.end).getTime();
  }
  return false;
}

function isBookingActive(b: DbRow<'bookings'>): boolean {
  return b.status === 'active' || b.status === 'scheduled';
}

function assetToView(asset: DbRow<'assets'>, _session: Session): AssetView {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    type: asset.type,
    assetClass: asset.assetClass,
    make: asset.make,
    model: asset.model,
    year: asset.year,
    plateOrSerial: asset.plateOrSerial,
    ownerTenantId: asset.ownerTenantId,
    ownerName: db.getState().tenants.find(t => t.id === asset.ownerTenantId)?.name ?? '',
    homeSiteId: asset.homeSiteId,
    homeSiteName: db.getState().sites.find(s => s.id === asset.homeSiteId)?.name ?? '',
    tankLitres: asset.tankLitres,
    canProfile: asset.canProfile,
    status: computeStatus(asset, clock.now()),
    behaviour: asset.behaviour,
    tier: asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1,
  };
}

export interface AssetView {
  id: string;
  code: string;
  name: string;
  type: string;
  assetClass: string;
  make: string;
  model: string;
  year: number;
  plateOrSerial: string;
  ownerTenantId: string;
  ownerName: string;
  homeSiteId: string;
  homeSiteName: string;
  tankLitres?: number;
  canProfile: { adapter: string; supported: string[]; checkedAt?: string; notes?: string };
  status: string;
  behaviour: string;
  tier: number;
}

export type { Session };

// ── Screen facade ─────────────────────────────────────────────────────────────
// Screens (app/** and src/components/**) import server code only from this file
// (architecture test, rule 6). Every function below enforces its own access check
// through can(); this file is a list of re-exports, not a second permission layer.
export { anyAssetHasFeature, getRelationship, isAssetVisible, visibleAssetIds } from './access';
export { ADAPTER_SERIAL_DUPLICATE, LVCAN_MODEL_ERROR, adapterForAsset, fitAdapter, fittedAssetFor, fittingHistory, markAdapterFaulty, modelFitsAsset, registerAdapter, removeAdapter, stockAdapters } from './adapters';
export { acknowledgeAlert, alertTypesIn, bellAlerts, visibleAlerts } from './alerts';
export type { AlertView } from './alerts';
export { actorName, assetCode, auditActions, auditEntriesToCsv, queryAuditEntries, recordAuditForSession, tenantName } from './audit';
export { aed, agedReceivables, billingSummary, canPay, canRecordPayment, createInvoiceFromBooking, generateStatement, invoiceById, invoiceStatusLabel, invoiceView, issuedInvoices, lastMonthStatements, mucForInvoice, paidTotal, payInvoice, paymentsFor, receivedInvoices, recordPayment, recordStatementPayment, statementById, statementsFor, voidInvoice, voidStatement } from './billing';
export type { InvoiceView } from './billing';
export { canManageBookings, cancelBooking, closeBooking, createBooking, endEarly, extendBooking, shortenBooking } from './bookings';
export { can, hasRole, isFeatureVisible, isKasperStaff } from './capabilities';
export type { Capability } from './capabilities';
export { reasonFor } from './capability-reasons';
export { canViewCost, costRows, getDieselPrice, monthlySeries, periodRange, roiFor, saveCostProfile, setDieselPrice } from './cost';
export type { AssetCostRow, CostPeriod } from './cost';
export { append, hydrateDb, nextRowNumber, useDb } from './db';
export type { DbRow, DbState } from './db';
export { clockPresets, dubaiYesterdayAt, fb12PublicPath, presetAt } from './demo-presets';
export { createGeofence, deleteGeofence, visibleGeofenceEvents, visibleGeofences } from './geofences';
export { getTrackingLinkState, resolveTrackingLink } from './links';
export { boardFor, canManageMaintenance, createTaskFromFault, currentMeter, logService, maintenanceAlerts, openTasks, planSnapshot, plansForAsset, plansVisibleTo, savePlan, serviceHistory } from './maintenance';
export type { PlanSnapshot } from './maintenance';
export { buildEcuBreakdown, ecuHoursAt, getMucByNumber, getMucVerifyStatus, getMucsForAsset, getReplacementMuc, issueMuc, reissueMuc, tamperWithMuc, voidMuc } from './muc';
export type { EcuBreakdown, MucVerifyStatus } from './muc';
export { bellNotifications, bellUnreadCount, markAllRead, markNotificationRead } from './notifications';
export { outboxForSession, outboxItems } from './outbox';
export { REPORT_TYPES, availableReportTypes, deleteReportRun, pastRentalLabel, regenerateReport, reportRunsFor, reportableAssets, runReport } from './reports';
export type { ReportTypeId } from './reports';
export { allTrackerRequests, declineTrackerRequest, hasOpenTrackerRequest, pairTrackerRequest, requestTracker, trackerRequestForAsset } from './requests';
export type { TrackerRequestView } from './requests';
export { createSchedule, deleteSchedule, runDueSchedules, schedulesFor, setScheduleActive } from './schedules';
export type { ScheduleFrequency } from './schedules';
export { searchAssets } from './search';
export { createUser, deactivateUser, reactivateUser, updateUserName, updateUserRole } from './team';
export { computeStatus, getReadingForAsset, getReadingsForAsset } from './telemetry/simulator';
export { createTenant, suspendTenant, unsuspendTenant, updateTenant } from './tenants';
export { assetsWithoutTracker, currentPairingForTracker, currentTrackerForAsset, markTrackerFaulty, pairTracker, pairingHistory, pairingTargetsFor, registerTracker, retireTracker, stockTrackers, unpairTracker, updateTrackerSettings } from './trackers';
export { activeLinksForAsset, createTrackingLink, expiryOptions, linkEndWords, pastLinksForAsset, revokeTrackingLink } from './tracking-links';
export { detectTrips } from './trips';
export { viewAsGroups } from './view-as';
