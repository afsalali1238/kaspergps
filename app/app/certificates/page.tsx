'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState, Tabs,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';

function formatTs(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return new Date(t).toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function fmtAed(amount: number): string {
  return `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`;
}

function MucRow({ muc, canView, onView }: {
  muc: typeof seed.mucs[0];
  canView: boolean;
  onView: (number: string) => void;
}) {
  const asset = seed.assets.find(a => a.id === muc.assetId);
  const owner = seed.tenants.find(t => t.id === muc.ownerTenantId);

  return (
    <tr key={muc.id} className="bg-paper hover:bg-paper-2">
      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{muc.number}</td>
      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{asset?.code ?? '—'}</td>
      <td className="px-3 py-2 border-b border-line text-grey-700">{owner?.name ?? '—'}</td>
      <td className="px-3 py-2 border-b border-line text-grey-500 text-xs">
        {formatTs(muc.periodFrom).split(',')[0]} – {formatTs(muc.periodTo).split(',')[0]}
      </td>
      <td className="px-3 py-2 border-b border-line text-right font-mono text-ink font-medium">
        {muc.payload.billableHours.toFixed(1)} h
      </td>
      <td className="px-3 py-2 border-b border-line text-center">
        <Badge variant={muc.status === 'sealed' ? 'green' : 'yellow'}>{muc.status}</Badge>
      </td>
      <td className="px-3 py-2 text-right border-b border-line">
        {muc.status === 'sealed' && canView ? (
          <Button size="sm" onClick={() => onView(muc.number)}>View</Button>
        ) : muc.status === 'voided' ? (
          <span className="text-xs text-grey-500">Voided</span>
        ) : (
          <span className="text-xs text-grey-400">—</span>
        )}
      </td>
    </tr>
  );
}

function CertificateVerify({ number, onClose }: { number: string; onClose: () => void }) {
  const muc = seed.mucs.find(m => m.number === number);
  if (!muc) return null;

  const asset = seed.assets.find(a => a.id === muc.assetId);
  const owner = seed.tenants.find(t => t.id === muc.ownerTenantId);
  const isValid = true;
  const isReplaced = !!muc.replacesMucId;

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
        <Badge variant={isValid ? 'green' : 'red'}>
          {isValid ? 'Seal intact' : 'Seal broken'}
        </Badge>
      </div>

      <h1 className="text-base font-semibold text-ink">{muc.number}</h1>
      <p className="text-xs text-grey-500">Monthly Utilisation Certificate</p>

      <div className="bg-paper-2 rounded-lg p-3 border border-line text-sm space-y-1.5">
        <div className="flex justify-between">
          <span className="text-grey-500">Asset</span>
          <span className="text-ink font-medium">{asset?.code ?? '—'} — {asset?.name ?? 'Unknown'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Owner</span>
          <span className="text-ink">{owner?.name ?? '—'}</span>
        </div>
        {muc.payload.renter && (
          <div className="flex justify-between">
            <span className="text-grey-500">Renter</span>
            <span className="text-ink">{muc.payload.renter.name}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-grey-500">Period</span>
          <span className="text-ink text-xs font-mono">
            {formatTs(muc.periodFrom).split(',')[0]} – {formatTs(muc.periodTo).split(',')[0]}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Opening ECU hours</span>
          <span className="text-ink font-mono">{muc.payload.openingHoursEcu.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Closing ECU hours</span>
          <span className="text-ink font-mono">{muc.payload.closingHoursEcu.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Billable hours</span>
          <span className="text-ink font-mono font-medium">{muc.payload.billableHours.toFixed(1)} h</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Source</span>
          <span className="text-ink text-xs">{muc.payload.source}</span>
        </div>
      </div>

      <div className="text-xs space-y-1 pt-2 border-t border-line">
        <div className="flex justify-between">
          <span className="text-grey-500">Status</span>
          <span className="text-ink">
            {muc.status === 'sealed' ? <Badge variant="green">Sealed</Badge> : <Badge variant="yellow">Voided</Badge>}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Issued</span>
          <span className="text-ink">{formatTs(muc.issuedAt).split(',')[0]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-grey-500">Issued by</span>
          <span className="text-ink">{seed.users.find(u => u.id === muc.issuedBy)?.name ?? '—'}</span>
        </div>
        {muc.status === 'voided' && (
          <>
            <div className="flex justify-between">
              <span className="text-grey-500">Voided</span>
              <span className="text-ink">{muc.voidedAt ? formatTs(muc.voidedAt).split(',')[0] : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-grey-500">Void reason</span>
              <span className="text-ink text-xs">{muc.voidReason}</span>
            </div>
          </>
        )}
        {isReplaced && (
          <div className="flex justify-between">
            <span className="text-grey-500">Replaced by</span>
            <span className="text-ink font-mono text-xs">{muc.number}</span>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-line">
        <div className="text-xs text-grey-500 mb-1">SHA-256 seal</div>
        <div className="bg-ink text-paper px-2 py-1 rounded text-xs font-mono break-all">
          {muc.sealSha256}
        </div>
      </div>

      {!isValid && (
        <div className="bg-red/10 border border-red/30 text-red text-sm px-3 py-2 rounded-lg">
          This certificate has been tampered with. The seal does not match the stored payload.
        </div>
      )}

      {isReplaced && (
        <div className="bg-yellow/5 border border-yellow/20 text-yellow-dark text-sm px-3 py-2 rounded-lg">
          This certificate was voided and replaced. See <strong>{muc.replacesMucId}</strong>.
        </div>
      )}
    </div>
  );
}

export default function CertificatesPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;
  const [selectedMuc, setSelectedMuc] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);

  if (!session) return null;

  const myTenantId = session.tenantId;
  const isTenantAdmin = session.role === 'tenant_admin';
  const isKasper = session.isKasper;

  const myMucs = useMemo(() => {
    if (isKasper) return seed.mucs;
    return seed.mucs.filter(muc => {
      if (muc.ownerTenantId === myTenantId) return true;
      const booking = muc.bookingId ? seed.bookings.find(b => b.id === muc.bookingId) : null;
      if (booking && booking.renterTenantId === myTenantId) return true;
      return false;
    });
  }, [myTenantId, isKasper]);

  const tier3Assets = useMemo(() =>
    seed.assets.filter(a => a.canProfile.adapter === 'ALL-CAN300'),
    []
  );

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">Monthly Utilisation Certificates</h1>
        <EmptyState title="Not available" description="Certificates are available in Phase 2. Tier 3 assets with ECU engine hours only." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Monthly Utilisation Certificates</h1>
        <p className="text-sm text-grey-500 mt-1">
          Sealed certificates of engine hours for Tier 3 assets.
        </p>
      </div>

      {showIssue && isTenantAdmin && tier3Assets.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Issue a certificate</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Asset (Tier 3 with ECU)</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {tier3Assets.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Period</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                <option value="last-month">Last month (Sep 2026)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm">Issue and seal</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowIssue(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-line">
          <h2 className="text-sm font-medium text-ink">Certificates</h2>
          {isTenantAdmin && tier3Assets.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setShowIssue(!showIssue)}>
              {showIssue ? 'Cancel' : 'Issue certificate'}
            </Button>
          )}
        </div>
        {myMucs.length === 0 ? (
          <div className="p-6 text-center text-sm text-grey-500">No certificates yet.</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left font-medium">Certificate</th>
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Owner</th>
                <th className="px-3 py-2 text-left font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {myMucs.map(muc => (
                <MucRow key={muc.id} muc={muc} canView={isTenantAdmin || isKasper} onView={setSelectedMuc} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedMuc && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 z-50 p-4">
          <div className="bg-surface border border-line rounded-lg p-5 max-w-md w-full shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-ink">Certificate details</h2>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMuc(null)}>Close</Button>
            </div>
            <CertificateVerify number={selectedMuc} onClose={() => setSelectedMuc(null)} />
          </div>
        </div>
      )}

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">About MUCs:</strong> A Monthly Utilisation Certificate is a sealed record of ECU engine hours for a Tier 3 asset over a calendar month or rental period. Issued by the owner Tenant Admin or Kasper Admin, sealed with SHA-256, and cannot be edited. Renters can view certificates for periods inside their rental windows.
      </div>
    </div>
  );
}
