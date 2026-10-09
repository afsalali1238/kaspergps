'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { hydrateDb } from '@/server/api';

/**
 * Loads the browser's stored demo database before any screen renders.
 * The server and the first client render both show the same neutral
 * placeholder, so the stored data never causes a hydration mismatch.
 */
export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(hydrateDb()).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="min-h-screen" aria-busy="true" />;
  }
  return <>{children}</>;
}
