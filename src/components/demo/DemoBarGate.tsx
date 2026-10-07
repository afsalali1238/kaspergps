'use client';

// The demo bar reads the persisted store (clock offset, session, demo switches)
// straight from `getState()`, so its server markup can never match the first
// client render. Mounting it only after hydration keeps React quiet; the bar is
// a fixed overlay, so nothing shifts when it appears.
import { useHydrated } from '@/store';
import { DemoBar } from '@/components/demo/DemoBar';

export function DemoBarGate() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <DemoBar />;
}
