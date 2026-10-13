'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ToastProvider } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { useSession } from '@/hooks';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();

  // Chunk R: with no session, the app screens never show. Back after Log out lands on the role picker.
  useEffect(() => {
    if (!session) router.replace('/');
  }, [session, router]);

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
