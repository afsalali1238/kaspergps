'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getMucByNumber, getMucVerifyStatus, getReplacementMuc } from '@/server/muc';
import type { MucVerifyStatus } from '@/server/muc';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { useT, useLocale } from '@/i18n';
import { translate, type Locale } from '@/i18n/dictionary';

// Public certificate verification (spec 11.16).
// Shows the number, asset code, period, billable hours and whether the stored
// payload still matches its seal. Nothing else. noindex (see layout).

function formatDate(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return clock.formatDubaiDate(t);
}

function formatDateTime(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return clock.formatDubaiDateTime(t);
}

function periodLabel(from: string | number, to: string | number): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** The seal line is locale-aware; the status words themselves come from ar.json. */
function sealLine(
  status: MucVerifyStatus,
  muc: { voidedAt?: string | number; issuedAt: string | number },
  replacementNumber: string | undefined,
  locale: Locale
): string {
  if (status === 'tampered') {
    return translate(locale, 'verify.tampered', 'Does not match its seal — contact Kasper.');
  }
  if (status === 'voided') {
    const on = muc.voidedAt ? formatDate(muc.voidedAt) : '—';
    return replacementNumber
      ? translate(locale, 'verify.voided_replaced', 'Voided on {at} — replaced by {number}', { at: on, number: replacementNumber })
      : translate(locale, 'verify.voided', 'Voided on {at}', { at: on });
  }
  return translate(locale, 'verify.valid', 'Valid — sealed {at}', { at: formatDateTime(muc.issuedAt) });
}

interface VerifyData {
  status: MucVerifyStatus | 'loading';
  number: string;
  assetCode?: string;
  period?: string;
  billableHours?: number;
  sealLine?: string;
}

export default function VerifyMucPage() {
  const t = useT();
  const locale = useLocale();
  const params = useParams<{ number: string }>();
  const number = decodeURIComponent(params.number ?? '');
  const [data, setData] = useState<VerifyData>({ status: 'loading', number });

  useEffect(() => {
    let cancelled = false;
    const muc = getMucByNumber(number);
    if (!muc) {
      setData({ status: 'not_found', number });
      return;
    }
    getMucVerifyStatus(muc).then(status => {
      if (cancelled) return;
      const asset = seed.assets.find(a => a.id === muc.assetId);
      const replacement = getReplacementMuc(muc);
      const line = sealLine(status, muc, replacement?.number, locale);
      setData({
        status,
        number: muc.number,
        assetCode: asset?.code,
        period: periodLabel(muc.periodFrom, muc.periodTo),
        billableHours: muc.payload.billableHours,
        sealLine: line,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [number, locale]);

  if (data.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-grey-500">{t('verify.checking', 'Checking…')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold text-ink">Kasper GPS</span>
        </div>

        {data.status === 'not_found' ? (
          <div>
            <h1 className="text-base font-semibold text-ink">{t('verify.not_found', 'Not found')}</h1>
            <p className="text-sm text-grey-500 mt-1 font-mono break-all">{number}</p>
          </div>
        ) : (
          <>
            <div>
              <div className="text-xs text-grey-500">{t('verify.certificate', 'Certificate')}</div>
              <h1 className="text-base font-semibold text-ink font-mono break-all">{data.number}</h1>
            </div>

            <div className="bg-paper-2 rounded-lg p-3 border border-line text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-grey-500">{t('verify.asset', 'Asset')}</span>
                <span className="text-ink font-medium font-mono">{data.assetCode ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-grey-500">{t('verify.period', 'Period')}</span>
                <span className="text-ink font-mono text-xs">{data.period}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-grey-500">{t('verify.billable_hours', 'Billable hours')}</span>
                <span className="text-ink font-mono font-medium">{data.billableHours?.toFixed(1)} h</span>
              </div>
            </div>

            <div
              className={
                data.status === 'valid'
                  ? 'bg-green/10 border border-green/30 text-green text-sm px-3 py-2 rounded-lg'
                  : data.status === 'voided'
                    ? 'bg-yellow/10 border border-yellow/30 text-yellow-dark text-sm px-3 py-2 rounded-lg'
                    : 'bg-red/10 border border-red/30 text-red text-sm px-3 py-2 rounded-lg'
              }
            >
              {data.sealLine}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
