// How screens read the demo store (F2). Components import from here, not from
// `@/store`, so every value a screen shows is a subscription: it re-renders when
// the value changes, with no reload.
//
// `storeActions` is for callers that are not hooks: scenario set-up, and
// handlers that run outside render. Calling an action never reads state.

import { useStore, type WalkthroughState } from '@/store';
import * as clock from '@/lib/clock';
import type { DemoSwitches, Session } from '@/domain/types';

/** The signed-in session, or null. */
export function useSession(): Session | null {
  return useStore(s => s.session);
}

/** The demo switches: phase, show hidden, sales view. */
export function useSwitches(): DemoSwitches {
  return useStore(s => s.demoSwitches);
}

export function useSelectedAssetId(): string | null {
  return useStore(s => s.selectedAssetId);
}

export function useWalkthrough(): WalkthroughState | null {
  return useStore(s => s.walkthrough);
}

export function useWalkthroughsDone(): number[] {
  return useStore(s => s.walkthroughsDone);
}

/** The clock's offset from real time, in ms (0 when the clock is live). */
export function useClockOffsetMs(): number {
  return useStore(s => s.clockOffsetMs);
}

/**
 * The simulated Dubai time in ms. The clock only moves when its offset
 * changes, so subscribing to the offset is enough to keep it current.
 */
export function useNow(): number {
  useStore(s => s.clockOffsetMs);
  return clock.now();
}

export const storeActions = {
  setSession: (session: Session | null) => useStore.getState().setSession(session),
  setDemoSwitches: (switches: Partial<DemoSwitches>) => useStore.getState().setDemoSwitches(switches),
  setClockOffsetMs: (ms: number) => useStore.getState().setClockOffsetMs(ms),
  resetClock: () => useStore.getState().resetClock(),
  setSelectedAssetId: (id: string | null) => useStore.getState().setSelectedAssetId(id),
  setWalkthrough: (w: WalkthroughState | null) => useStore.getState().setWalkthrough(w),
  markWalkthroughDone: (id: number) => useStore.getState().markWalkthroughDone(id),
};
