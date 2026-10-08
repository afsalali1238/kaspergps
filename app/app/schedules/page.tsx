'use client';

import React from 'react';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { useT } from '@/i18n';

export default function SchedulesPage() {
  const t = useT();
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  if (!session) return null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">{t('schedules.title', 'Schedules')}</h1>
      <p className="text-sm text-grey-500 mb-4">
        {t('schedules.subtitle', 'Automated report generation on a schedule.')}
      </p>
      {phase === 'day_one' ? (
        <EmptyState
          title={t('common.not_available', 'Not available')}
          description={t('schedules.phase_gate', 'Schedules are available in Phase 2.')}
        />
      ) : (
        <div className="text-sm text-grey-500">
          {t('schedules.coming_soon', 'Schedule list coming soon.')}
        </div>
      )}
    </div>
  );
}
