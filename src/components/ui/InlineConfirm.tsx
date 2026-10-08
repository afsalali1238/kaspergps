'use client';

import React from 'react';
import clsx from 'clsx';
import { Button } from './Button';

interface InlineConfirmProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'yellow';
  loading?: boolean;
  className?: string;
}

export function InlineConfirm({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
  className = '',
}: InlineConfirmProps) {
  if (!open) return null;

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      <div className="flex items-start gap-3 p-4 bg-paper-2 rounded-lg border border-line">
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {description && <p className="text-xs text-grey-500 mt-1">{description}</p>}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant === 'danger' ? 'danger' : confirmVariant === 'yellow' ? 'yellow' : 'primary'}
          size="sm"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
