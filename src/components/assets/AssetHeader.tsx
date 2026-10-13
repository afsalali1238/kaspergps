'use client';

// Asset page header (UI-UPGRADE §7.1, A4).
//
//   Line 1  CODE  Name  [status] [tier] [Rented]
//   Line 2  make model · year · plate
//   Line 3  viewer's site · owner · Inside: <geofence> | Outside all geofences
//   Line 4  Last updated 09:59 (1 min ago)   — the tracker's own and received times on hover
//
// Actions: one primary (Share tracking link for owners, Run report otherwise),
// secondary Edit / Run report, and End access now as an outlined danger button
// that the page wires to EndAccessDialog. Which actions show is decided by the
// page with can(); this component only lays them out.

import React from 'react';
import clsx from 'clsx';
import { Badge, Button, StatusBadge, TierChip } from '@/components/ui';
import { useT } from '@/i18n';

type Status = React.ComponentProps<typeof StatusBadge>['status'];

interface AssetHeaderProps {
  code: string;
  name: string;
  status: Status;
  tier: 1 | 2 | 3;
  /** "Rented" for the renter, "On hire" for the owner while a booking runs. */
  hireChip: 'rented' | 'on_hire' | null;
  makeLine: string;
  /** Line 3 parts, already in the viewer's terms; empty parts are dropped. */
  placeParts: string[];
  lastUpdated: string;
  lastUpdatedTitle?: string;
  labels?: React.ReactNode;
  actions: {
    share?: () => void;
    shareOpen?: boolean;
    edit?: () => void;
    runReportHref?: string;
    endAccess?: () => void;
  };
}

const linkBase = 'inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export function AssetHeader({
  code, name, status, tier, hireChip, makeLine, placeParts, lastUpdated, lastUpdatedTitle, labels, actions,
}: AssetHeaderProps) {
  const t = useT();
  const { share, shareOpen, edit, runReportHref, endAccess } = actions;
  const primaryIsShare = Boolean(share);
  const hasActions = Boolean(share || edit || runReportHref || endAccess);

  return (
    <header data-testid="asset-header" className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-sm font-bold text-ink" dir="ltr">{code}</span>
          <h1 className="text-title min-w-0 break-words text-ink">{name}</h1>
          <StatusBadge status={status} />
          <TierChip tier={tier} />
          {hireChip === 'rented' && <Badge tone="accent">{t('common.status.rented', 'Rented')}</Badge>}
          {hireChip === 'on_hire' && <Badge tone="info">{t('asset_page.on_hire', 'On hire')}</Badge>}
        </div>
        <div className="text-sm text-text-secondary">{makeLine}</div>
        {placeParts.length > 0 && (
          <div className="text-sm text-text-secondary" data-testid="asset-place">
            {placeParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && ' · '}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div
          className={clsx('w-fit text-xs text-text-secondary', lastUpdatedTitle && 'cursor-help')}
          title={lastUpdatedTitle}
        >
          {lastUpdated}
        </div>
        {labels}
      </div>

      {hasActions && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end" data-testid="asset-actions">
          {primaryIsShare ? (
            <Button
              variant="primary"
              onClick={share}
              aria-expanded={shareOpen}
              className="min-h-10 w-full sm:w-auto"
            >
              {t('asset_detail.actions.share_link', 'Share tracking link')}
            </Button>
          ) : runReportHref ? (
            <a href={runReportHref} className={clsx(linkBase, 'w-full bg-ink text-white hover:bg-ink/90 sm:w-auto')}>
              {t('asset_detail.actions.run_report', 'Run report')}
            </a>
          ) : null}
          {edit && (
            <Button variant="secondary" onClick={edit} className="min-h-10">
              {t('asset_detail.actions.edit_asset', 'Edit asset')}
            </Button>
          )}
          {primaryIsShare && runReportHref && (
            <a href={runReportHref} className={clsx(linkBase, 'border border-line bg-paper-2 text-ink hover:border-grey-500 hover:bg-paper')}>
              {t('asset_detail.actions.run_report', 'Run report')}
            </a>
          )}
          {endAccess && (
            <button
              type="button"
              onClick={endAccess}
              className={clsx(linkBase, 'cursor-pointer border border-bad-ink bg-surface text-bad-ink hover:bg-bad-tint')}
            >
              {t('asset_detail.actions.end_access', 'End access now')}
            </button>
          )}
        </div>
      )}
    </header>
  );
}
