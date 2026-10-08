'use client';

import React from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';

type Source = 'ECU' | 'ECU · partial' | 'Estimated' | 'ECU (ALL-CAN300)' | 'GPS distance' | 'From invoices' | 'From service log' | 'Dummy rate' | 'Days on hire' | 'Not measured';

interface SourceLabelProps {
  source: Source;
  className?: string;
  inline?: boolean;
}

const sourceStyles: Record<string, string> = {
  'ECU': 'bg-green/10 text-green border-green/20',
  'ECU · partial': 'bg-amber/10 text-amber-dark border-amber/20',
  'Estimated': 'bg-paper border-line text-grey-500',
  'ECU (ALL-CAN300)': 'bg-green/10 text-green border-green/20',
  'GPS distance': 'bg-paper border-line text-grey-500',
  'From invoices': 'bg-paper border-line text-grey-500',
  'From service log': 'bg-paper border-line text-grey-500',
  'Dummy rate': 'bg-yellow/5 border-yellow-dark/20 text-grey-500 italic',
  'Days on hire': 'bg-paper border-line text-grey-500',
};

const SOURCE_KEYS: Record<Source, { key: string; fallback: string }> = {
  'ECU': { key: 'common.source.ecu', fallback: 'ECU' },
  'ECU · partial': { key: 'common.source.ecu_partial', fallback: 'ECU · partial' },
  'Estimated': { key: 'common.source.estimated', fallback: 'Estimated' },
  'ECU (ALL-CAN300)': { key: 'common.source.ecu_all_can300', fallback: 'ECU (ALL-CAN300)' },
  'GPS distance': { key: 'common.source.gps_distance', fallback: 'GPS distance' },
  'From invoices': { key: 'common.source.from_invoices', fallback: 'From invoices' },
  'From service log': { key: 'common.source.from_service_log', fallback: 'From service log' },
  'Dummy rate': { key: 'common.source.dummy_rate', fallback: 'Dummy rate' },
  'Days on hire': { key: 'common.source.days_on_hire', fallback: 'Days on hire' },
  'Not measured': { key: 'common.not_measured', fallback: 'Not measured' },
};

export function SourceLabel({ source, className = '', inline = false }: SourceLabelProps) {
  const t = useT();
  const copy = SOURCE_KEYS[source];
  const label = t(copy.key, copy.fallback);
  const isNotMeasured = source === 'Not measured';

  if (isNotMeasured) {
    return (
      <span className={clsx('text-grey-500 italic text-xs', className)}>
        {label}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
        sourceStyles[source] || sourceStyles['Estimated'],
        inline ? 'text-[10px]' : '',
        className
      )}
    >
      {label}
    </span>
  );
}
