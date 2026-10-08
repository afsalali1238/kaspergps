'use client';

import React from 'react';
import clsx from 'clsx';

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
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
}

export function Table<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  emptyMessage = 'No items yet',
  loading = false,
  className = '',
  selectedKeys,
  selectable = false,
}: TableProps<T>) {
  if (loading) {
    return <div className="space-y-2 p-4">{/* skeleton rendered by caller */}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-grey-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            {selectable && (
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-line bg-white accent-ink"
                />
              </th>
            )}
            {columns.map(col => (
              <th
                key={col.key}
                className={clsx(
                  'text-xs font-semibold text-grey-500 uppercase tracking-wider px-3 py-2.5',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  'whitespace-nowrap'
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(row => {
            const key = String(row[keyField] ?? '');
            return (
              <tr
                key={key}
                className={clsx(
                  'transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-paper-2/50',
                  selectedKeys?.has(key) && 'bg-yellow/5'
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <td className="p-3">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-line bg-white accent-ink"
                      checked={selectedKeys?.has(key) ?? false}
                    />
                  </td>
                )}
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-3 py-2.5 text-sm',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
