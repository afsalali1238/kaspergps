'use client';

import React from 'react';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store';

export default function CertificatesPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  if (!session) return null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">Monthly Utilisation Certificates</h1>
      {phase === 'day_one' ? (
        <EmptyState
          title="Not available"
          description="MUCs are available in Phase 2."
        />
      ) : (
        <div className="text-sm text-grey-500">
          Monthly utilisation certificates for Tier 3 assets.
        </div>
      )}
    </div>
  );
}
