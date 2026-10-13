'use client';

// End access now (UI-UPGRADE §7.1, A4): the destructive action sits behind
// ConfirmDialog and keeps the existing reason rule (at least 10 characters,
// enforced by endEarly on the server). A refused attempt keeps the dialog open
// and says why, so the owner can fix the reason without starting again.

import React, { useEffect, useId, useState } from 'react';
import { ConfirmDialog } from '@/components/ui';
import { useT } from '@/i18n';

export interface EndAccessResult {
  ok: boolean;
  error?: string;
}

interface EndAccessDialogProps {
  open: boolean;
  /** The renter whose access ends ("Marina Builders"). */
  company: string;
  code: string;
  onConfirm: (reason: string) => EndAccessResult;
  onCancel: () => void;
}

export function EndAccessDialog({ open, company, code, onConfirm, onCancel }: EndAccessDialogProps) {
  const t = useT();
  const inputId = useId();
  const errorId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A fresh dialog starts empty.
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const title = t('asset_detail.end_access.title', 'End {company} access now', { company });

  return (
    <ConfirmDialog
      open={open}
      destructive
      title={title}
      confirmLabel={t('asset_detail.end_access.confirm', 'End {company} access now', { company })}
      onCancel={onCancel}
      onConfirm={() => {
        const result = onConfirm(reason);
        if (!result.ok) setError(result.error ?? t('asset_detail.end_access.failed', 'Could not end access.'));
      }}
      body={
        <div className="space-y-3">
          <p>
            {t('asset_detail.end_access.body', 'The rental is cut short now: the override is saved, the job tracking links are revoked and the cut-off is audited. It is not undone by the nightly check.', { company, code })}
          </p>
          <div>
            <label htmlFor={inputId} className="text-eyebrow">
              {t('asset_page.end_access.reason', 'Reason')}
            </label>
            <input
              id={inputId}
              type="text"
              value={reason}
              onChange={e => { setReason(e.target.value); setError(null); }}
              placeholder={t('asset_detail.end_access.reason_label', 'Reason (at least 10 characters)')}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="mt-1 min-h-10 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-bad-ink">{error}</p>
          )}
        </div>
      }
    />
  );
}
