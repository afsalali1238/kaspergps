'use client';

import React, { useMemo } from 'react';
import clsx from 'clsx';
import { useDb, isFeatureVisible, getRelationship, reasonFor, type Capability, can } from '@/server/api';
import { FEATURES } from '@/domain/features';
import { useSession, useSwitches, useSelectedAssetId } from '@/hooks';

// ── Helpers ────────────────────────────────────────────────────────────────────

function roleShort(role: string): string {
  const map: Record<string, string> = {
    kasper_admin: 'Kasper admin',
    kasper_ops: 'Kasper ops',
    tenant_admin: 'Tenant admin',
    site_user: 'Site user',
  };
  return map[role] ?? role;
}

// ── All capabilities to show in the panel ─────────────────────────────────────

const ALL_CAPABILITIES: Capability[] = [
  'asset.view',
  'asset.viewTelemetry',
  'asset.edit',
  'link.create',
  'link.revoke',
  'grant.endEarly',
  'alert.view',
  'alert.acknowledge',
  'users.manage',
  'sites.manage',
  'console.tenants.view',
  'console.tenants.manage',
  'console.assets.manage',
  'console.trackers.view',
  'console.trackers.manage',
  'console.audit.view',
  'label.view',
  'label.manage',
  'geofence.view',
];

// ── Main component ──────────────────────────────────────────────────────────────

export function FeaturesPanel() {
  const seed = useDb(s => s);
  const session = useSession();
  const selectedAssetId = useSelectedAssetId();
  const { showHidden } = useSwitches();
  const { phase } = useSwitches();
  const { salesView } = useSwitches();

  const user = session?.user;
  const asset = selectedAssetId ? seed.assets.find(a => a.id === selectedAssetId) : null;
  const rel = asset && session ? getRelationship(session, asset.id) : undefined;

  // Build the list of capabilities to show
  const capabilityList = useMemo(() => {
    if (!session) return [];
    return ALL_CAPABILITIES.map(cap => ({
      capability: cap,
      ok: can(session, cap, asset?.id),
      reason: reasonFor(session, cap, rel),
    }));
  }, [session, rel, asset?.id]);

  // Build the list of features to show
  const featureList = useMemo(() => {
    if (!session || !asset) return [];
    return FEATURES.map(f => ({
      feature: f,
      ok: isFeatureVisible(session, asset.id, f.key, phase, salesView),
      reason: !isFeatureVisible(session, asset.id, f.key, phase, salesView) ? reasonFor(session, f.key as Capability, rel) : null,
    }));
  }, [session, asset, phase, salesView, rel]);

  // Filtered feature list based on phase
  const visibleFeatures = useMemo(() => {
    return featureList.filter(f => {
      if (phase === 'day_one') return f.feature.phase === 'day_one';
      if (phase === 'phase2') return f.feature.phase === 'day_one' || f.feature.phase === 'phase2';
      return true;
    });
  }, [featureList, phase]);

  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
        <div className="bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 p-6 max-w-md w-full mx-4">
          <h2 className="text-sm font-medium text-paper mb-3">Features</h2>
          <p className="text-xs text-paper/50">Sign in to see your capabilities and features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-[60]">
      <div className="bg-[#1a1b20] border-l border-[#2a2c30] shadow-2xl shadow-black/50 w-full max-w-sm h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1a1b20] border-b border-[#2a2c30] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-paper">Features</h2>
          <button
            onClick={() => {}}
            className="text-paper/50 hover:text-paper transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* User info */}
        {user && (
          <div className="px-4 py-3 border-b border-[#2a2c30] bg-[#22242a]">
            <div className="text-xs text-paper font-medium">{user.name}</div>
            <div className="text-xs text-paper/50 mt-0.5">
              {roleShort(user.role)}
              {user.tenantId ? ` · ${seed.tenants.find(t => t.id === user.tenantId)?.name ?? user.tenantId}` : ''}
            </div>
          </div>
        )}

        {/* Selected asset */}
        {asset && (
          <div className="px-4 py-3 border-b border-[#2a2c30]">
            <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider mb-1">Selected asset</div>
            <div className="text-xs text-paper">{asset.code}</div>
            {rel && (
              <div className="text-[10px] text-paper/50 mt-0.5">
                Relationship: {rel === 'owner' ? 'Owner' : rel === 'renter' ? 'Renter' : rel === 'kasper' ? 'Kasper' : 'No relationship'}
              </div>
            )}
          </div>
        )}

        {/* Capabilities */}
        <div className="px-4 py-3 border-b border-[#2a2c30]">
          <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider mb-2">Capabilities</div>
          <div className="space-y-1">
            {capabilityList.map(item => (
              <div
                key={item.capability}
                className={clsx(
                  'flex items-center justify-between py-1.5 px-2 rounded-lg text-xs',
                  item.ok
                    ? 'bg-green-500/5 text-green'
                    : showHidden
                    ? 'bg-yellow/5 text-paper/70 border border-yellow-dark/20'
                    : 'bg-transparent text-paper/30'
                )}
              >
                <span className="capitalize">{item.capability.replace(/[.]/g, ' ')}</span>
                {item.ok ? (
                  <span className="text-green text-[9px] font-mono">✓</span>
                ) : showHidden ? (
                  <span className="text-yellow-dark text-[9px] font-mono">✕</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="px-4 py-3">
          <div className="text-[10px] text-paper/50 font-mono uppercase tracking-wider mb-2">Features</div>
          <div className="space-y-1">
            {visibleFeatures.map(item => (
              <div
                key={item.feature.key}
                className={clsx(
                  'flex items-start justify-between py-1.5 px-2 rounded-lg text-xs gap-2',
                  item.ok
                    ? 'bg-green-500/5 text-green'
                    : showHidden
                    ? 'bg-yellow/5 text-paper/70 border border-yellow-dark/20'
                    : 'bg-transparent text-paper/30'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="capitalize">{item.feature.key.replace(/_/g, ' ')}</div>
                  {item.reason && showHidden && (
                    <div className="text-[10px] text-yellow-dark mt-0.5 font-mono">{item.reason}</div>
                  )}
                </div>
                {item.ok ? (
                  <span className="text-green text-[9px] font-mono flex-shrink-0">✓</span>
                ) : showHidden ? (
                  <span className="text-yellow-dark text-[9px] font-mono flex-shrink-0">✕</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#2a2c30] bg-[#22242a] text-[10px] text-paper/40 font-mono">
          {showHidden ? 'Showing hidden items (review mode)' : 'Hidden items are not shown'}
        </div>
      </div>
    </div>
  );
}
