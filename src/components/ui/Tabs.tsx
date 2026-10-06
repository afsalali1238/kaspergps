'use client';

import React from 'react';
import clsx from 'clsx';

type TabId = string;

interface TabsProps {
  tabs: { id: TabId; label: string; badge?: string | number }[];
  activeId: TabId;
  onChange: (id: TabId) => void;
  className?: string;
  bordered?: boolean;
}

export function Tabs({ tabs, activeId, onChange, className = '', bordered = false }: TabsProps) {
  return (
    <div className={clsx('flex gap-0 border-b', bordered && 'border-line', className)}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-3 py-2 text-sm font-medium transition-colors relative',
            activeId === tab.id
              ? 'text-ink'
              : 'text-grey-500 hover:text-grey-700 hover:bg-paper/50',
            bordered && activeId === tab.id && 'font-semibold'
          )}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge !== '' && (
            <span
              className={clsx(
                'ml-1.5 text-[10px] font-mono',
                activeId === tab.id ? 'text-grey-500' : 'text-grey-400'
              )}
            >
              {tab.badge}
            </span>
          )}
          {activeId === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow" />
          )}
        </button>
      ))}
    </div>
  );
}

interface TabContentProps {
  activeId: TabId;
  id: TabId;
  children: React.ReactNode;
  className?: string;
}

export function TabContent({ activeId, id, children, className = '' }: TabContentProps) {
  if (activeId !== id) return null;
  return (
    <div className={clsx('mt-4', className)}>
      {children}
    </div>
  );
}
