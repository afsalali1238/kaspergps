'use client';

// The public page refreshes every 30 s and whenever the demo clock changes
// (spec 11.6). Renders nothing.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';

export function LiveRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const clockOffsetMs = useStore(state => state.clockOffsetMs);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  useEffect(() => {
    router.refresh();
  }, [router, clockOffsetMs]);

  return null;
}
