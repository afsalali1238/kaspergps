// Client state store for the Kasper GPS prototype.
// Uses Zustand with persistence for the demo switches, clock offset and the
// signed-in session, so a refresh (or a pasted URL) keeps the demo context.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Session, DemoSwitches, User } from '@/domain/types';
import * as clock from '@/lib/clock';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StoreState {
  session: Session | null;
  demoSwitches: DemoSwitches;
  selectedAssetId: string | null;
  currentPath: string;
  clockOffsetMs: number;
}

interface StoreActions {
  setSession: (s: Session | null) => void;
  setDemoSwitches: (s: Partial<DemoSwitches>) => void;
  setSelectedAssetId: (id: string | null) => void;
  setCurrentPath: (p: string) => void;
  setClockOffsetMs: (ms: number) => void;
  resetClock: () => void;
  getClockOffsetMs: () => number;
}

type Store = StoreState & StoreActions;

// ── Default values ────────────────────────────────────────────────────────────

const defaultSwitches: DemoSwitches = {
  phase: 'later',
  showHidden: false,
  salesView: false,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // State
      session: null,
      demoSwitches: defaultSwitches,
      selectedAssetId: null,
      currentPath: '/app',
      clockOffsetMs: 0,

      // Actions
      setSession: (s) => set({ session: s }),

      setDemoSwitches: (s) =>
        set((state) => ({
          demoSwitches: { ...state.demoSwitches, ...s },
        })),

      setSelectedAssetId: (id) => set({ selectedAssetId: id }),

      setCurrentPath: (p) => set({ currentPath: p }),

      setClockOffsetMs: (ms) => {
        set({ clockOffsetMs: ms });
        clock.setOffsetMs(ms);
      },

      resetClock: () => {
        set({ clockOffsetMs: 0 });
        clock.resetOffset();
      },

      getClockOffsetMs: () => get().clockOffsetMs,
    }),
    {
      name: 'kasper.store.v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        session: state.session,
        demoSwitches: state.demoSwitches,
        clockOffsetMs: state.clockOffsetMs,
      }),
      // Re-apply the persisted demo clock offset to the simulated clock, so a
      // refresh keeps demo time (spec: reload persistence).
      onRehydrateStorage: () => (state) => {
        if (state && typeof state.clockOffsetMs === 'number' && state.clockOffsetMs !== 0) {
          clock.setOffsetMs(state.clockOffsetMs);
        }
      },
    }
  )
);

// ── Convenience getters ────────────────────────────────────────────────────────

export function getSession(): Session | null {
  return useStore.getState().session;
}

export function getUser(): User | null {
  return useStore.getState().session?.user ?? null;
}

export function getClockOffsetMs(): number {
  return useStore.getState().clockOffsetMs;
}
