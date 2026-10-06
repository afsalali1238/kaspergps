'use client';

import React from 'react';
import clsx from 'clsx';

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

export function SourceLabel({ source, className = '', inline = false }: SourceLabelProps) {
  const isNotMeasured = source === 'Not measured';

  if (isNotMeasured) {
    return (
      <span className={clsx('text-grey-500 italic text-xs', className)}>
        Not measured
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
      {source}
    </span>
  );
}
