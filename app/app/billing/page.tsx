'use client';

import React from 'react';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store';

export default function BillingPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  if (!session) return null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">Billing</h1>
      {phase === 'day_one' ? (
        <EmptyState
          title="Not available"
          description="Billing is available in Phase 2."
        />
      ) : session.isKasper ? (
        <div className="text-sm text-grey-500">
          Billing management for all tenants.
        </div>
      ) : (
        <div className="text-sm text-grey-500">
          Billing for your tenant.
        </div>
      )}
    </div>
  );
}
