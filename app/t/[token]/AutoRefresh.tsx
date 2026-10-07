'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The public tracking page refreshes every 30 s and on clock change (spec 11.6). */
export function AutoRefresh({ everyMs = 30000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    const onClock = () => router.refresh();
    window.addEventListener('kasper:clock-changed', onClock);
    return () => {
      clearInterval(id);
      window.removeEventListener('kasper:clock-changed', onClock);
    };
  }, [router, everyMs]);

  return null;
}
