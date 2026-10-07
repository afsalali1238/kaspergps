'use client';

import React from 'react';
import { EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';

export default function CostPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  if (!session) return null;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">{t('cost.title', 'Cost & ROI')}</h1>
      {phase === 'later' ? (
        <EmptyState
          title={t('cost.notAvailable', 'Not available')}
          description={t('cost.later', 'Cost & ROI is available in the Later phase.')}
        />
      ) : (
        <div className="text-sm text-grey-500">
          {t('cost.subtitle', 'Cost and ROI analysis for your assets.')}
        </div>
      )}
    </div>
  );
}
