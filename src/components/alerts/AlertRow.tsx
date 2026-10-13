'use client';

// AlertRow (UI-UPGRADE §8, reference `.alert-item`): left severity border, a
// Lucide type icon, the asset code as a link, the text, a relative time with
// the exact time on hover, the site, and Acknowledge when the user may.

import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Badge, Button } from '@/components/ui';
import { toneText } from '@/components/ui/tones';
import type { AlertSeverity, AlertView } from '@/server/api';
import * as clock from '@/lib/clock';
import { useHref, useT } from '@/i18n';
import { SEVERITY_BORDER, SEVERITY_TONE, TYPE_ICON } from './severity';
import { relativeTime } from './relative-time';

interface AlertRowProps {
  alert: AlertView;
  severity: AlertSeverity;
  canAcknowledge: boolean;
  onAcknowledge: (id: string) => void;
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}

export function AlertRow({ alert, severity, canAcknowledge, onAcknowledge }: AlertRowProps) {
  const t = useT();
  const href = useHref();
  const Icon = TYPE_ICON[alert.type];
  const tone = SEVERITY_TONE[severity];
  const opened = toMs(alert.openedAt);
  const exact = clock.formatDubaiDateTime(opened);
  const typeLabel = t(`alerts.types.${alert.type}`, alert.typeLabel);

  return (
    <li
      className={clsx(
        'flex items-start gap-3 rounded-lg border border-line border-l-4 bg-surface px-3 py-3 sm:px-4',
        SEVERITY_BORDER[severity],
        alert.status !== 'open' && 'opacity-80'
      )}
      data-testid="alert-row"
      data-severity={severity}
      data-alert-id={alert.id}
    >
      <Icon aria-hidden className={clsx('mt-0.5 h-5 w-5 shrink-0', toneText[tone])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {alert.assetId ? (
            <Link
              href={href(`/app/assets/${alert.assetId}`)}
              className="font-mono text-sm font-semibold text-ink underline-offset-2 hover:underline"
            >
              {alert.assetCode}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-ink">{t('alerts.company', 'Company')}</span>
          )}
          {alert.assetName && <span className="min-w-0 truncate text-sm text-text-secondary">{alert.assetName}</span>}
          <Badge tone={tone}>{typeLabel}</Badge>
          {alert.status === 'acknowledged' && <Badge tone="neutral">{t('alerts.acknowledged', 'Acknowledged')}</Badge>}
          {alert.status === 'closed' && <Badge tone="neutral">{t('alerts.closed', 'Closed')}</Badge>}
        </div>
        <p className="mt-1 break-words text-sm text-ink">{t(`alerts.words.${alert.type}`, alert.typeWords)}</p>
        <p className="mt-1 text-xs text-text-secondary">
          <time dateTime={new Date(opened).toISOString()} title={exact} className="cursor-help">
            {relativeTime(t, opened, clock.now())}
          </time>
          {alert.siteName && <> · <span data-testid="alert-site">{alert.siteName}</span></>}
        </p>
        {alert.status === 'acknowledged' && alert.acknowledgedBy && (
          <p className="mt-1 text-xs text-text-secondary">
            {t('alerts.acknowledged_by', 'Acknowledged by {name} at {at}', {
              name: alert.acknowledgedBy,
              at: alert.acknowledgedAt ? clock.formatDubaiTime(toMs(alert.acknowledgedAt)) : '',
            })}
          </p>
        )}
      </div>
      {alert.status === 'open' && canAcknowledge && (
        <Button
          size="sm"
          variant="secondary"
          className="min-h-10 shrink-0 sm:min-h-0"
          onClick={() => onAcknowledge(alert.id)}
          aria-label={t('alerts_page.acknowledge_one', 'Acknowledge {code} {type}', { code: alert.assetCode, type: typeLabel })}
        >
          {t('alerts.acknowledge', 'Acknowledge')}
        </Button>
      )}
    </li>
  );
}
