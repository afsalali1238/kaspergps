'use client';

import React from 'react';
import { ToastProvider } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { useStore } from '@/store';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const store = useStore;
  const session = store.getState().session;

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg">
        <div className="text-sm text-grey-500">Loading…</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      {/* The demo bar is rendered once by the root layout (app/layout.tsx) —
          rendering it here as well produced two bars on every customer screen. */}
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
