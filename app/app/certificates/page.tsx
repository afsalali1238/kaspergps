'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import {
  getMucVerifyStatus, issueMuc, reissueMuc, voidMuc,
} from '@/server/muc';
import type { MucVerifyStatus } from '@/server/muc';
import type { Muc } from '@/domain/types';
import { hasFeature } from '@/domain/features';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';

function formatTs(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return new Date(t).toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function formatDateOnly(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return new Date(t).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

/** The previous calendar month in Dubai, e.g. 1–30 Sep 2026 at the anchor. */
function lastMonthPeriod(nowMs: number): { label: string; from: number; to: number } {
  const d = new Date(new Date(nowMs).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' }));
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime() - 60000;
  const label = new Date(from).toLocaleDateString('en-AE', { month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
  return { label, from, to };
}

function MucRow({ muc, canView, verifyState, onView }: {
  muc: Muc;
  canView: boolean;
  verifyState: MucVerifyStatus | 'checking';
  onView: (number: string) => void;
}) {
  const t = useT();
  const asset = seed.assets.find(a => a.id === muc.assetId);
  const owner = seed.tenants.find(t => t.id === muc.ownerTenantId);

  return (
    <tr className="bg-paper hover:bg-paper-2">
      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{muc.number}</td>
      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{asset?.code ?? '—'}</td>
      <td className="px-3 py-2 border-b border-line text-grey-700">{owner?.name ?? '—'}</td>
      <td className="px-3 py-2 border-b border-line text-grey-500 text-xs">
        {formatDateOnly(muc.periodFrom)} – {formatDateOnly(muc.periodTo)}
      </td>
      <td className="px-3 py-2 border-b border-line text-right font-mono text-ink font-medium">
        {muc.payload.billableHours.toFixed(1)} h
      </td>
      <td className="px-3 py-2 border-b border-line text-center">
        {verifyState === 'tampered' ? (
          <Badge variant="red">{t('certificates.status.seal_broken', 'Seal broken')}</Badge>
        ) : muc.status === 'sealed' ? (
          <Badge variant="green">{t('certificates.status.sealed', 'Sealed')}</Badge>
        ) : (
          <Badge variant="yellow">{t('certificates.status.voided', 'Voided')}</Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right border-b border-line">
        {muc.status === 'sealed' && canView ? (
          <Button size="sm" onClick={() => onView(muc.number)}>{t('certificates.actions.view', 'View')}</Button>
        ) : muc.status === 'voided' ? (
          <span className="text-xs text-grey-500">{t('certificates.status.voided', 'Voided')}</span>
        ) : (
          <span className="text-xs text-grey-400">—</span>
        )}
      </td>
    </tr>
  );
}

function CertificateVerify({ number, onClose }: { number: string; onClose: () => void }) {
  const t = useT();
  const muc = seed.mucs.find(m => m.number === number);
  const [status, setStatus] = useState<MucVerifyStatus | 'checking'>('checking');

  React.useEffect(() => {
    let cancelled = false;
    if (!muc) return;
    getMucVerifyStatus(muc).then(s => {
      if (!cancelled) setStatus(s);
    });
    return () => { cancelled = true; };
  }, [muc]);

  if (!muc) return null;

  const asset = seed.assets.find(a => a.id === muc.assetId);
  const owner = seed.tenants.find(t => t.id === muc.ownerTenantId);
  const isValid = status === 'valid';
  const isReplaced = !!muc.replacesMucId;
  const replacement = muc.replacesMucId ? seed.mucs.find(m => m.id === muc.replacesMucId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="12" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold text-ink">Kasper GPS</span>
        </div>
        <Badge variant={isValid ? 'green' : status === 'checking' ? 'grey' : 'red'}>
          {status === 'checking'
              ? t('verify.checking', 'Checking…')
              : isValid
                ? t('certificates.seal_intact', 'Seal intact')
                : t('certificates.status.seal_broken', 'Seal broken')}
        </Badge>
      </div>

      <h1 className="text-base font-semibold text-ink">{muc.number}</h1>
      <p className="text-xs text-grey-500">{t('certificates.detail.monthly', 'Monthly Utilisation Certificate')}</p>

      <div className="bg-paper-2 rounded-lg p-3 border border-line text-sm space-y-1.5">
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.asset', 'Asset')}</span>
          <span className="text-ink font-medium">{asset?.code ?? '—'} — {asset?.name ?? t('common.unknown', 'Unknown')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.owner', 'Owner')}</span>
          <span className="text-ink">{owner?.name ?? '—'}</span>
        </div>
        {muc.payload.renter && (
          <div className="flex justify-between">
            <span className="text-grey-500">{t('certificates.detail.renter', 'Renter')}</span>
            <span className="text-ink">{muc.payload.renter.name}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.period', 'Period')}</span>
          <span className="text-ink text-xs font-mono">
            {formatDateOnly(muc.periodFrom)} – {formatDateOnly(muc.periodTo)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.opening_ecu', 'Opening ECU hours')}</span>
          <span className="text-ink font-mono">{muc.payload.openingHoursEcu.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.closing_ecu', 'Closing ECU hours')}</span>
          <span className="text-ink font-mono">{muc.payload.closingHoursEcu.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.billable_hours', 'Billable hours')}</span>
          <span className="text-ink font-mono font-medium">{muc.payload.billableHours.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.source', 'Source')}</span>
          <span className="text-ink text-xs">{muc.payload.source}</span>
        </div>
      </div>

      {muc.payload.gaps.length > 0 && (
        <div className="bg-paper-2 rounded-lg p-3 border border-line text-xs text-grey-700">
          <div className="text-grey-500 mb-1">Data gaps ({muc.payload.gaps.length})</div>
          <ul className="space-y-0.5 font-mono">
            {muc.payload.gaps.map((g, i) => (
              <li key={i}>{formatTs(g.from)} → {formatTs(g.to)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs space-y-1 pt-2 border-t border-line">
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.status', 'Status')}</span>
          <span className="text-ink">
            {muc.status === 'sealed'
              ? <Badge variant="green">{t('certificates.status.sealed', 'Sealed')}</Badge>
              : <Badge variant="yellow">{t('certificates.status.voided', 'Voided')}</Badge>}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.issued', 'Issued')}</span>
          <span className="text-ink">{formatTs(muc.issuedAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">{t('certificates.detail.issued_by', 'Issued by')}</span>
          <span className="text-ink">{seed.users.find(u => u.id === muc.issuedBy)?.name ?? '—'}</span>
        </div>
        {muc.status === 'voided' && (
          <>
            <div className="flex justify-between">
              <span className="text-grey-500">{t('certificates.status.voided', 'Voided')}</span>
              <span className="text-ink">{muc.voidedAt ? formatTs(muc.voidedAt) : '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-grey-500">{t('certificates.detail.void_reason', 'Void reason')}</span>
              <span className="text-ink text-xs text-right">{muc.voidReason}</span>
            </div>
          </>
        )}
        {isReplaced && (
          <div className="flex justify-between">
            <span className="text-grey-500">{muc.status === 'voided' ? 'Replaced by' : 'Replaces'}</span>
            <span className="text-ink font-mono text-xs">{replacement?.number ?? '—'}</span>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-line">
        <div className="text-xs text-grey-500 mb-1">{t('certificates.detail.seal', 'SHA-256 seal')}</div>
        <div className="bg-ink text-paper px-2 py-1 rounded text-xs font-mono break-all">
          {muc.sealSha256}
        </div>
      </div>

      {status === 'tampered' && (
        <div className="bg-red/10 border border-red/30 text-red text-sm px-3 py-2 rounded-lg">
          Does not match its seal — contact Kasper.
        </div>
      )}

      {muc.status === 'voided' && (
        <div className="bg-yellow/5 border border-yellow/20 text-yellow-dark text-sm px-3 py-2 rounded-lg">
          {replacement
            ? <>{t('certificates.detail.voided_replaced', 'This certificate was voided and replaced. See')} <strong>{replacement.number}</strong>.</>
            : <>{t('certificates.detail.voided_no_replacement', 'This certificate was voided. No replacement has been issued.')}</>}
        </div>
      )}

      <a
        className="text-xs text-yellow-600 hover:text-yellow font-medium"
        href={`/verify/${encodeURIComponent(muc.number)}`}
        target="_blank"
        rel="noreferrer"
      >
        Open the public verify page
      </a>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>{t('common.close', 'Close')}</Button>
      </div>
    </div>
  );
}

export default function CertificatesPage() {
  const t = useT();
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;
  const [selectedMuc, setSelectedMuc] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [version, setVersion] = useState(0);
  const [issueAssetId, setIssueAssetId] = useState('');
  const [issuePeriod, setIssuePeriod] = useState<'last-month' | 'booking'>('last-month');
  const [gapOverride, setGapOverride] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [actionNumber, setActionNumber] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<'void' | 'reissue' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [verifyStates, setVerifyStates] = useState<Record<string, MucVerifyStatus | 'checking'>>({});

  const myMucs = useMemo(() => {
    if (!session) return [];
    if (session.isKasper) return seed.mucs;
    const myTenantId = session.tenantId;
    return seed.mucs.filter(muc => {
      if (muc.ownerTenantId === myTenantId) return true;
      const booking = muc.bookingId ? seed.bookings.find(b => b.id === muc.bookingId) : null;
      if (booking && booking.renterTenantId === myTenantId) return true;
      return false;
    });
    // version busts the memo after issue/void/reissue
  }, [session, version]);

  const tier3Assets = useMemo(
    () => seed.assets.filter(a => hasFeature(a, 'muc')),
    // Recompute after issue/void/reissue (adapter edits can change eligibility).
    [version]
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, MucVerifyStatus | 'checking'> = {};
      for (const muc of seed.mucs) {
        next[muc.id] = await getMucVerifyStatus(muc);
      }
      if (!cancelled) setVerifyStates(next);
    })();
    return () => { cancelled = true; };
  }, [version]);

  if (!session) return null;

  const isKasperAdmin = session.isKasper && session.role === 'kasper_admin';
  const isTenantAdmin = session.role === 'tenant_admin';
  const canIssue = isKasperAdmin || isTenantAdmin;

  const myTier3 = tier3Assets.filter(a =>
    isKasperAdmin || a.ownerTenantId === session.tenantId
  );

  const selectedAsset = myTier3.find(a => a.id === issueAssetId) ?? myTier3[0] ?? null;
  const selectedAssetBookings = selectedAsset
    ? seed.bookings.filter(b => b.assetId === selectedAsset.id)
    : [];

  const nowMs = clock.now();
  const lastMonth = lastMonthPeriod(nowMs);

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('asset_detail.certificates_tab.title', 'Monthly Utilisation Certificates')}</h1>
        <EmptyState title={t('common.not_available', 'Not available')} description={t('certificates.phase_gate', 'Certificates are available in Phase 2. Tier 3 assets with ECU engine hours only.')} />
      </div>
    );
  }

  const refresh = () => setVersion(v => v + 1);

  const handleIssue = async () => {
    if (!selectedAsset) return;
    const bookingId = issuePeriod === 'booking' ? selectedAssetBookings[0]?.id : undefined;
    const period = issuePeriod === 'booking' && selectedAssetBookings[0]
      ? {
          from: new Date(selectedAssetBookings[0].start).getTime(),
          to: new Date(selectedAssetBookings[0].end).getTime(),
        }
      : { from: lastMonth.from, to: lastMonth.to };

    const result = await issueMuc(session, {
      assetId: selectedAsset.id,
      periodFrom: period.from,
      periodTo: period.to,
      bookingId,
      gapOverrideReason: gapOverride.trim() || undefined,
    });
    if (result.ok) {
      setBanner({ kind: 'ok', text: result.message ?? 'Certificate issued.' });
      setShowIssue(false);
      setGapOverride('');
      refresh();
    } else {
      setBanner({ kind: 'error', text: result.error ?? 'Could not issue the certificate.' });
    }
  };

  const handleVoid = async () => {
    if (!actionNumber) return;
    const result = await voidMuc(session, actionNumber, actionReason);
    if (result.ok) {
      setBanner({ kind: 'ok', text: result.message ?? 'Certificate voided.' });
      setActionNumber(null);
      setActionKind(null);
      setActionReason('');
      refresh();
    } else {
      setBanner({ kind: 'error', text: result.error ?? 'Could not void the certificate.' });
    }
  };

  const handleReissue = async () => {
    if (!actionNumber) return;
    const result = await reissueMuc(session, actionNumber, actionReason);
    if (result.ok) {
      setBanner({ kind: 'ok', text: result.message ?? 'Certificate reissued.' });
      setActionNumber(null);
      setActionKind(null);
      setActionReason('');
      refresh();
    } else {
      setBanner({ kind: 'error', text: result.error ?? 'Could not reissue the certificate.' });
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('asset_detail.certificates_tab.title', 'Monthly Utilisation Certificates')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t('certificates.subtitle', 'Sealed certificates of engine hours for Tier 3 assets. Sealed at issue — to correct one, void it and reissue.')}
        </p>
      </div>

      {banner && (
        <div
          className={
            banner.kind === 'ok'
              ? 'bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg'
              : 'bg-red/10 border border-red/30 text-red text-sm px-4 py-2 rounded-lg'
          }
        >
          {banner.text}
        </div>
      )}

      {showIssue && canIssue && myTier3.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">{t('certificates.actions.issue', 'Issue a certificate')}</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">{t('certificates.issue.asset', 'Asset (Tier 3 with ECU)')}</label>
              <select
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                value={selectedAsset?.id ?? ''}
                onChange={e => setIssueAssetId(e.target.value)}
              >
                {myTier3.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">{t('certificates.issue.period', 'Period')}</label>
              <select
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                value={issuePeriod}
                onChange={e => setIssuePeriod(e.target.value as 'last-month' | 'booking')}
              >
                <option value="last-month">Last month ({lastMonth.label})</option>
                {selectedAssetBookings.map(b => (
                  <option key={b.id} value="booking">
                    Booking {b.reference} ({formatDateOnly(b.start)} – {formatDateOnly(b.end)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">
                Data-gap override reason {isKasperAdmin ? '(Kasper Admin only)' : ''}
              </label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder={t('certificates.issue.gap_reason', 'Only needed when the period has a gap longer than 24 hours')}
                value={gapOverride}
                onChange={e => setGapOverride(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleIssue}>{t('certificates.issue.issue_and_seal', 'Issue and seal')}</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowIssue(false)}>{t('common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        </div>
      )}

      {actionNumber && actionKind && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-2">
            {actionKind === 'void'
              ? t('certificates.actions.void_named', 'Void {number}', { number: actionNumber })
              : t('certificates.actions.reissue_named', 'Reissue {number}', { number: actionNumber })}
          </h2>
          <p className="text-xs text-grey-500 mb-2">
            {actionKind === 'void'
              ? t('certificates.void_note', 'A void needs a reason of at least 10 characters. The certificate stays listed as Voided.')
              : t('certificates.reissue_note', 'Reissue copies the period into a new -02 certificate with a fresh seal and audit entry.')}
          </p>
          <input
            type="text"
            className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            placeholder={t('common.reason_min_10', 'Reason (at least 10 characters)')}
            value={actionReason}
            onChange={e => setActionReason(e.target.value)}
          />
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant={actionKind === 'void' ? 'danger' : 'primary'}
              onClick={actionKind === 'void' ? handleVoid : handleReissue}
            >
              {actionKind === 'void'
                ? t('certificates.actions.void_certificate', 'Void certificate')
                : t('certificates.actions.reissue_certificate', 'Reissue certificate')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setActionNumber(null); setActionKind(null); setActionReason(''); }}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-line">
          <h2 className="text-sm font-medium text-ink">{t('certificates.title', 'Certificates')}</h2>
          {canIssue && myTier3.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setShowIssue(!showIssue)}>
              {showIssue ? t('common.cancel', 'Cancel') : t('certificates.actions.issue', 'Issue certificate')}
            </Button>
          )}
        </div>
        {myMucs.length === 0 ? (
          <div className="p-6 text-center text-sm text-grey-500">{t('certificates.none', 'No certificates yet.')}</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left font-medium">{t('certificates.columns.certificate', 'Certificate')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('certificates.columns.asset', 'Asset')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('certificates.detail.owner', 'Owner')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('certificates.columns.period', 'Period')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('certificates.columns.hours', 'Hours')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('certificates.columns.status', 'Status')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('certificates.columns.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {myMucs.map(muc => (
                <React.Fragment key={muc.id}>
                  <MucRow
                    muc={muc}
                    canView={isTenantAdmin || session.isKasper}
                    verifyState={verifyStates[muc.id] ?? 'checking'}
                    onView={setSelectedMuc}
                  />
                  {canIssue && muc.ownerTenantId === session.tenantId && (
                    <tr className="bg-paper">
                      <td colSpan={7} className="px-3 pb-2 border-b border-line">
                        <div className="flex gap-2 justify-end">
                          {muc.status === 'sealed' && (
                            <button
                              className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                              onClick={() => { setActionNumber(muc.number); setActionKind('void'); setActionReason(''); }}
                            >
                              {t('certificates.actions.void', 'Void')}
                            </button>
                          )}
                          {muc.status === 'voided' && (
                            <button
                              className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                              onClick={() => { setActionNumber(muc.number); setActionKind('reissue'); setActionReason(''); }}
                            >
                              {t('certificates.actions.reissue', 'Reissue')}
                            </button>
                          )}
                          <a
                            className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                            href={`/verify/${encodeURIComponent(muc.number)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('certificates.actions.verify', 'Verify')}
                          </a>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedMuc && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 z-50 p-4">
          <div className="bg-surface border border-line rounded-lg p-5 max-w-md w-full shadow-lg max-h-[90vh] overflow-y-auto">
            <CertificateVerify number={selectedMuc} onClose={() => setSelectedMuc(null)} />
          </div>
        </div>
      )}

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">{t('certificates.about', 'About MUCs:')}</strong> {t('certificates.about_body', 'A Monthly Utilisation Certificate is a sealed record of ECU engine hours for a Tier 3 asset over a calendar month or rental period. Issued by the owner Tenant Admin or Kasper Admin, sealed with SHA-256, and cannot be edited. Renters can view certificates for periods inside their rental windows.')}
      </div>
    </div>
  );
}
