'use client';

// Table — the data table (UI-UPGRADE §4, fleetx `.tbl`): sticky uppercase mono
// header, 13 px rows, row hover tint, right-aligned mono numbers and an optional
// ⋯ RowMenu at the end of each row.
//
//   <Table
//     caption="Maintenance schedule"
//     keyField="id"
//     rows={rows}
//     columns={[
//       { key: 'code', header: 'Asset', mono: true, render: r => r.code },
//       { key: 'left', header: 'Hours left', numeric: true, render: r => r.leftLabel },
//     ]}
//     rowMenu={r => [{ id: 'log', label: 'Log service', onSelect: () => log(r) }]}
//   />
//
// `numeric` right-aligns (end-aligns in Arabic) and sets tabular mono figures.
// Pass already-formatted strings: the table never formats numbers itself.
// The header sticks to the top of the nearest scrolling ancestor; give the
// wrapper a max height (`maxHeight`) when the table should scroll on its own.

import React from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { RowMenu, type RowMenuItem } from './RowMenu';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Right/end aligned, mono, tabular figures. */
  numeric?: boolean;
  /** Mono text (IDs, codes, times). */
  mono?: boolean;
  render: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
  selectedKeys?: Set<string>;
  selectable?: boolean;
  /** Visually hidden caption that names the table for screen readers. */
  caption?: string;
  /** Header sticks while the rows scroll (default on). */
  stickyHeader?: boolean;
  /** CSS max-height of the scroll box, e.g. '480px'. */
  maxHeight?: string;
  /** Row actions for a trailing ⋯ menu. Return [] for a row with none. */
  rowMenu?: (row: T) => RowMenuItem[];
  /** Accessible name of each row's ⋯ button. */
  rowMenuLabel?: (row: T) => string;
  dense?: boolean;
}

function alignClass<T>(col: Column<T>): string {
  if (col.numeric || col.align === 'right') return 'text-end';
  if (col.align === 'center') return 'text-center';
  return 'text-start';
}

export function Table<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  emptyMessage,
  loading = false,
  className = '',
  selectedKeys,
  selectable = false,
  caption,
  stickyHeader = true,
  maxHeight,
  rowMenu,
  rowMenuLabel,
  dense = false,
}: TableProps<T>) {
  const t = useT();
  if (loading) {
    return <div className="space-y-2 p-4">{/* skeleton rendered by caller */}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-text-secondary">{emptyMessage ?? t('ui.no_items', 'No items yet')}</p>
      </div>
    );
  }

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';

  return (
    <div
      className={clsx('overflow-x-auto', maxHeight && 'overflow-y-auto', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={clsx(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b border-line bg-surface-2">
            {selectable && (
              <th scope="col" className="w-10 p-3">
                <span className="sr-only">{t('ui.select', 'Select')}</span>
              </th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className={clsx(
                  'whitespace-nowrap bg-surface-2 px-3 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate',
                  alignClass(col)
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
            {rowMenu && (
              <th scope="col" className="w-12 bg-surface-2 px-1 py-2">
                <span className="sr-only">{t('ui.actions', 'Actions')}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(row => {
            const key = String(row[keyField] ?? '');
            const menu = rowMenu?.(row) ?? [];
            return (
              <tr
                key={key}
                className={clsx(
                  'transition-colors hover:bg-surface-2',
                  onRowClick && 'cursor-pointer',
                  selectedKeys?.has(key) && 'bg-accent-tint'
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <td className="p-3">
                    <input
                      type="checkbox"
                      readOnly
                      className="h-4 w-4 rounded border-line bg-surface accent-ink"
                      checked={selectedKeys?.has(key) ?? false}
                    />
                  </td>
                )}
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={clsx(
                      cellPad,
                      'text-ink',
                      alignClass(col),
                      (col.numeric || col.mono) && 'font-mono',
                      col.numeric && 'whitespace-nowrap tabular-nums'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {rowMenu && (
                  <td className="w-12 px-1 py-0.5 text-end">
                    {menu.length > 0 && <RowMenu items={menu} label={rowMenuLabel?.(row)} />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
