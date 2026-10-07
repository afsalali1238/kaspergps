'use client';

import React from 'react';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';

export default function MaintenancePage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  if (!session) return null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">{t('maintenance.title', 'Maintenance')}</h1>
      {phase === 'later' ? (
        <EmptyState
          title={t('maintenance.notAvailable', 'Not available')}
          description={t('maintenance.later', 'Maintenance is available in the Later phase.')}
        />
      ) : (
        <div className="text-sm text-grey-500">
          {t('maintenance.subtitle', 'Maintenance scheduling for your assets.')}
        </div>
      )}
    </div>
  );
}
