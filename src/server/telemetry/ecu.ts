// ECU engine hours: the machine's own hour count, not the tracker's. Lives in its
// own module so the telemetry simulator and the MUC code can both use it without
// an import cycle.

import type { Asset } from '@/domain/types';
import { ANCHOR_MS } from '@/server/seed/data';

const DAY_MS = 86400000;

/** Engine hours per day the simulator puts on each kind of asset. */
export const BEHAVIOUR_HOURS_PER_DAY: Record<Asset['behaviour'], number> = {
  parked: 1,
  works_at_site: 9,
  drives_between_sites: 6,
  stationary_24h: 0,
  light_vehicle_day: 4,
};

/** Spec §8.2: ECU engine hours shown today for the Tier 3 assets. */
const ECU_HOURS_AT_ANCHOR: Record<string, number> = {
  'EX-04': 8420,
  'BD-02': 14980,
};

const n1 = (v: number) => Math.round(v * 10) / 10;

/** Hours on the machine's ECU at the seed anchor. Assets not listed get a stable value from their code. */
export function ecuHoursAtAnchor(asset: Asset): number {
  const override = ECU_HOURS_AT_ANCHOR[asset.code];
  if (override !== undefined) return override;
  let h = 0;
  for (const ch of asset.code) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return 500 + h;
}

/** ECU engine hours at a moment: the anchor value, moved by the behaviour's hours per day. Monotonic. */
export function ecuHoursAt(asset: Asset, atMs: number): number {
  const hoursPerDay = BEHAVIOUR_HOURS_PER_DAY[asset.behaviour] ?? 4;
  const days = (atMs - ANCHOR_MS) / DAY_MS;
  return n1(Math.max(0, ecuHoursAtAnchor(asset) + days * hoursPerDay));
}
