'use client';

// ConfirmDialog — asks before a destructive action (End access, Void,
// Deactivate …). UI-UPGRADE §4, A4/A10.
//
//   <ConfirmDialog
//     open={!!target}
//     title={`Void certificate ${target?.number}?`}
//     body="The certificate stays on record as Voided. This cannot be undone."
//     confirmLabel="Void certificate"
//     destructive
//     onConfirm={() => voidCert(target!)}
//     onCancel={() => setTarget(null)}
//   />
//
// Focus starts on Cancel (the safe choice). Esc, Cancel and a click on the
// dimmed page all cancel. `onConfirm` may return a promise: the button shows a
// spinner until it settles; close the dialog from the caller when it does.

import React, { useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { Button } from './Button';
import { useFocusTrap } from './useFocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const ref = useFocusTrap<HTMLDivElement>(open, () => {
    if (!busy) onCancel();
  }, { initialFocus: cancelRef });
  const titleId = useId();
  const bodyId = useId();
  if (!open) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/40" aria-hidden="true" onClick={busy ? undefined : onCancel} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-xl border border-line bg-surface p-5 shadow-pop outline-none sm:rounded-xl"
      >
        <h2 id={titleId} className="text-section text-ink">{title}</h2>
        {body && <div id={bodyId} className="mt-2 text-sm text-text-secondary">{body}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy} className="min-h-10 w-full sm:w-auto">
            {cancelLabel ?? t('ui.cancel', 'Cancel')}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={confirm}
            loading={busy}
            className={clsx('min-h-10 w-full sm:w-auto')}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel ?? t('ui.confirm', 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
