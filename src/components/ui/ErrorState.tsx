'use client';

import React from 'react';
import clsx from 'clsx';
import { Button } from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className = '' }: ErrorStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center py-12 px-4 gap-3', className)}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-red">
        <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2" />
        <path d="M14 20l5 5 11-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h3 className="text-base font-semibold text-ink">Something went wrong</h3>
      <p className="text-sm text-grey-500 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
