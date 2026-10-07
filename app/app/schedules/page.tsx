'use client';

import React from 'react';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store';

export default function SchedulesPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  if (!session) return null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">Schedules</h1>
      <p className="text-sm text-grey-500 mb-4">
        Automated report generation on a schedule.
      </p>
      {phase === 'day_one' ? (
        <EmptyState
          title="Not available"
          description="Schedules are available in Phase 2."
        />
      ) : (
        <div className="text-sm text-grey-500">
          Schedule list coming soon.
        </div>
      )}
    </div>
  );
}
