'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ToastProvider } from '@/components/ui';
import { DemoBar } from '@/components/demo/DemoBar';
import { AppShell } from '@/components/layout/AppShell';
import { useHydrated, useSession } from '@/store';

/** Shown until the persisted session is readable — identical on server and client. */
function ShellLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg">
      <div className="text-sm text-grey-500">Loading…</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const hydrated = useHydrated();
  const router = useRouter();

  // No session and nothing left to wait for: go to sign-in instead of hanging
  // on the loading screen (a hard refresh used to do exactly that).
  useEffect(() => {
    if (hydrated && !session) router.replace('/sign-in');
  }, [hydrated, session, router]);

  if (!hydrated || !session) return <ShellLoading />;

  return (
    <ToastProvider>
      <DemoBar />
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
