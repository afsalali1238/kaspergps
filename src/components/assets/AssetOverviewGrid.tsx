'use client';

// Asset Overview layout (UI-UPGRADE §7.2, A4): a shorter map beside a 2×2
// MetricTile grid (desktop: map 60 %, tiles 40 %; phone: stacked), then the
// rest of the tiles in one dense grid. Values arrive already formatted with
// src/lib/format.ts; `null` reads "Not measured".

import React from 'react';
import { MetricTile, type Tone } from '@/components/ui';
import { formatNumber } from '@/lib/format';

export interface TileSpec {
  key: string;
  label: string;
  value: string | null;
  unit?: string;
  context?: React.ReactNode;
  source?: string;
  tone?: Tone;
}

/** A formatted number, or null when there is nothing measured (never a raw float). */
export function measure(value: number | null | undefined, decimals = 0): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? formatNumber(value, decimals) : null;
}

function Tile({ tile }: { tile: TileSpec }) {
  return (
    <div data-testid={`tile-${tile.key}`} className="min-w-0">
      <MetricTile
        label={tile.label}
        value={tile.value}
        unit={tile.unit}
        context={tile.context}
        source={tile.source}
        tone={tile.tone}
        className="h-full"
      />
    </div>
  );
}

export function AssetOverviewGrid({ map, primary, more }: { map: React.ReactNode; primary: TileSpec[]; more: TileSpec[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="h-[220px] overflow-hidden rounded-lg border border-line bg-paper lg:col-span-3 lg:h-auto lg:min-h-[220px]">
          {map}
        </div>
        <div data-testid="metric-grid" className="grid grid-cols-2 content-start gap-2 lg:col-span-2">
          {primary.map(tile => <Tile key={tile.key} tile={tile} />)}
        </div>
      </div>
      {more.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {more.map(tile => <Tile key={tile.key} tile={tile} />)}
        </div>
      )}
    </div>
  );
}
