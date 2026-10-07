// Client state store for the Kasper GPS prototype.
// Uses Zustand with persistence for demo switches and clock offset.

import { useEffect, useState } from 'react';
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
  signOut: () => void;
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

      signOut: () => set({ session: null }),

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
        demoSwitches: state.demoSwitches,
        clockOffsetMs: state.clockOffsetMs,
        // The session is persisted so a hard refresh does not throw you out of
        // the app (it used to leave both shells stuck on "Loading…").
        session: state.session,
      }),
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

// ── Shell helpers ──────────────────────────────────────────────────────────────

/**
 * False on the server and on the very first client render, true afterwards.
 * Layouts gate on this so the server HTML and the first client render match,
 * and the persisted session is not read before it exists.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

export function useSession(): Session | null {
  return useStore(s => s.session);
}
