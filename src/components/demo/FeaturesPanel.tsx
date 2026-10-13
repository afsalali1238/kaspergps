'use client';

// The Features panel (spec §10.2, J5.2).
//
// A reviewer opens this and can answer, without asking anyone: who am I, which
// company, what sites, what is my role for; which capabilities do I hold and how
// far do they reach; why do I not hold the ones I don't; what hardware is in
// front of me and which §6.3 features it can actually show; and what is
// happening right now.
//
// Every ✓/✕ comes from can()/hasFeature() through src/server/capability-catalog,
// every ✕ carries the reason from capability-reasons.ts, and every capability
// name reads as words ("View telemetry"), so the panel cannot disagree with the
// screens. It is demo chrome, so it stays English like the rest of the demo bar.

import React, { useMemo } from 'react';
import clsx from 'clsx';
import {
  CAPABILITY_GROUPS, ROLE_PURPOSE, ROLE_WORDS,
  capabilityRows, featureAvailability, getRelationship, rightNowCounts, siteWords, tierSummary,
  useDb,
} from '@/server/api';
import { useSelectedAssetId, useSession } from '@/hooks';

export interface FeaturesPanelProps {
  onClose?: () => void;
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-label={ok ? 'Allowed' : 'Not allowed'}
      className={clsx(
        'flex-shrink-0 w-4 text-[10px] font-mono text-center',
        ok ? 'text-green' : 'text-red-400',
      )}
    >
      {ok ? '✓' : '✕'}
    </span>
  );
}

function Row({ id, ok, title, scope, reason, count }: {
  id: string;
  ok: boolean;
  title: string;
  scope: string;
  reason: string | null;
  count?: string;
}) {
  return (
    <div
      data-testid={id}
      data-held={ok ? 'yes' : 'no'}
      className={clsx(
        'flex items-start gap-2 py-1.5 px-2 rounded-lg text-xs',
        ok ? 'bg-green-500/5 text-paper' : 'bg-red-500/5 text-paper/60',
      )}
    >
      <Mark ok={ok} />
      <div className="flex-1 min-w-0">
        <div>{title}</div>
        <div className="text-[10px] text-paper/45 mt-0.5">{scope}{count ? ` · ${count}` : ''}</div>
        {!ok && reason && (
          <div className="text-[10px] text-yellow-dark mt-0.5 leading-snug">{reason}</div>
        )}
      </div>
    </div>
  );
}

export function FeaturesPanel({ onClose }: FeaturesPanelProps) {
  const session = useSession();
  const seed = useDb(s => s);
  const selectedAssetId = useSelectedAssetId();

  const asset = selectedAssetId ? seed.assets.find(a => a.id === selectedAssetId) ?? null : null;
  const scopedAssetId = asset?.id;

  const capabilities = useMemo(
    () => (session ? capabilityRows(session, scopedAssetId) : []),
    [session, scopedAssetId, seed],
  );
  const features = useMemo(
    () => (session ? featureAvailability(session) : []),
    [session, seed],
  );
  const hardware = useMemo(() => (session ? tierSummary(session) : null), [session, seed]);
  const rightNow = useMemo(() => (session ? rightNowCounts(session) : null), [session, seed]);

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" data-testid="features-panel">
        <div className="bg-demo-surface border border-demo-line rounded-xl shadow-2xl shadow-black/50 p-6 max-w-md w-full mx-4">
          <h2 className="text-sm font-medium text-paper mb-3">Features</h2>
          <p className="text-xs text-paper/50">Sign in to see your capabilities and features.</p>
        </div>
      </div>
    );
  }

  const user = session.user;
  const company = seed.tenants.find(t => t.id === user.tenantId)?.name ?? (session.isKasper ? 'Kasper' : '—');
  const heldHere = capabilities.filter(c => c.held).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-[60]" data-testid="features-panel">
      <div className="bg-demo-surface border-l border-demo-line shadow-2xl shadow-black/50 w-full max-w-sm h-full overflow-y-auto">
        {/* Header: who, company, role, sites, and what the role is for */}
        <div className="sticky top-0 bg-demo-surface border-b border-demo-line px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-paper">Features</h2>
          <button
            onClick={() => onClose?.()}
            className="text-paper/50 hover:text-paper transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-demo-line bg-demo-surface-2" data-testid="features-identity">
          <div className="text-xs text-paper font-medium">{user.name}</div>
          <div className="text-xs text-paper/60 mt-0.5">
            {ROLE_WORDS[user.role]} · {company}
          </div>
          <div className="text-[11px] text-paper/50 mt-1">{siteWords(session)}</div>
          <div className="text-[11px] text-paper/60 mt-2 leading-snug">{ROLE_PURPOSE[user.role]}</div>
        </div>

        {/* The asset the reviewer was looking at, when there is one */}
        {asset && (
          <div className="px-4 py-2.5 border-b border-demo-line">
            <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider mb-1">Selected asset</div>
            <div className="text-xs text-paper">{asset.code} · {asset.name}</div>
            <div className="text-[10px] text-paper/50 mt-0.5">
              Relationship: {(() => {
                const rel = getRelationship(session, asset.id);
                return rel === 'owner' ? 'Owner' : rel === 'renter' ? 'Renter' : rel === 'kasper' ? 'Kasper' : 'No relationship';
              })()}
              {' — the ✓ and ✕ below are for this asset.'}
            </div>
          </div>
        )}

        {/* Every capability, grouped, with the scope and the reason for every ✕ */}
        <div className="px-4 py-3 border-b border-demo-line" data-testid="features-capabilities">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider">Capabilities</div>
            <span className="text-[10px] font-mono text-paper/60">{heldHere} of {capabilities.length}</span>
          </div>
          <div className="space-y-3">
            {CAPABILITY_GROUPS.map(group => {
              const rows = capabilities.filter(c => group.capabilities.includes(c.capability));
              if (rows.length === 0) return null;
              const groupHeld = rows.filter(r => r.held).length;
              return (
                <div key={group.id}>
                  <div className="text-[11px] text-paper/70 mb-1">
                    {group.label}
                    <span className="text-paper/60 font-mono"> · {groupHeld}/{rows.length}</span>
                  </div>
                  <div className="space-y-1">
                    {rows.map(row => (
                      <Row
                        key={row.capability}
                        id={`cap-${row.capability}`}
                        ok={row.held}
                        title={row.label}
                        scope={row.scope}
                        reason={row.reason}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hardware in the current view, then every §6.3 feature against it */}
        <div className="px-4 py-3 border-b border-demo-line" data-testid="features-hardware">
          <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider mb-2">Hardware in your view</div>
          <div className="text-xs text-paper/80 mb-2" data-testid="features-tiers">{hardware?.sentence}</div>
          <div className="text-[11px] text-paper/50 mb-3 leading-snug">
            Tier 1 tracks position only · Tier 2 reads the vehicle&apos;s own bus · Tier 3 reads and controls it
          </div>
          <div className="space-y-3">
            {Array.from(new Set(features.map(f => f.group))).map(groupLabel => (
              <div key={groupLabel}>
                <div className="text-[11px] text-paper/70 mb-1">{groupLabel}</div>
                <div className="space-y-1">
                  {features.filter(f => f.group === groupLabel).map(row => (
                    <Row
                      key={row.key}
                      id={`feature-${row.key}`}
                      ok={row.available > 0}
                      title={row.label}
                      scope={row.available > 0
                        ? `On ${row.available} of ${row.total} assets in view`
                        : `Not on any of the ${row.total} assets in view`}
                      reason={row.reason}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right now */}
        {rightNow && (
          <div className="px-4 py-3" data-testid="features-right-now">
            <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider mb-2">Right now</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Assets you can see', value: rightNow.assets },
                { label: 'Owned by your company', value: rightNow.owned },
                { label: 'Rented in', value: rightNow.rentedIn },
                { label: 'Rented out', value: rightNow.rentedOut },
                { label: 'Active tracking links', value: rightNow.activeLinks },
                { label: 'Open alerts', value: rightNow.openAlerts },
              ].map(item => (
                <div key={item.label} className="bg-demo-surface-2 border border-demo-line rounded-lg px-2.5 py-2">
                  <div className="text-sm text-paper font-mono">{item.value}</div>
                  <div className="text-[10px] text-paper/50 mt-0.5 leading-snug">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t border-demo-line bg-demo-surface-2 text-[10px] text-paper/60 font-mono">
          Phase and Show hidden are gone: the demo shows everything, always.
        </div>
      </div>
    </div>
  );
}
