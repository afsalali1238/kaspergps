// Fuel model for Tier 3 assets (spec §9). Fuel falls with use, refuels add 40–70%
// when the tank runs low during a shift, and GN-01 has a theft drop of 18% at 02:10
// with the engine off. The level is a chain over 10-minute steps, so the same
// asset always gives the same levels, and a reading never sees a jump it did not
// cause.

import type { Asset } from '@/domain/types';
import { ANCHOR_MS } from '@/server/seed/data';
import { CLASS_AVG_FUEL_LPH } from '@/config/pricing';
import { dayLoadFactor } from '@/server/telemetry/ecu';

const MIN = 60 * 1000;
const STEP_MS = 10 * MIN;
const DAY = 24 * 60 * MIN;
const HISTORY_DAYS = 60;
const DUBAI_OFFSET_MS = 4 * 60 * MIN;

/** Spec §9: GN-01's theft drop is 18% at 02:10 Dubai on the anchor's night, with the engine off. */
export const GN01_DROP_PCT = 18;
// 02:10 Dubai on the anchor's calendar day (the anchor is 10:00 Dubai, so 02:10 is 7 h 50 min earlier).
export const GN01_DROP_AT = ANCHOR_MS - (7 * 60 + 50) * MIN;
export const GN01_OFF_FROM = GN01_DROP_AT - 10 * MIN; // 02:00
export const GN01_OFF_TO = GN01_DROP_AT + 20 * MIN; // 02:30

/** Working consumption in L/h (spec §9 ranges, by machine name; class average otherwise). */
const WORKING_RANGE_LPH: [string, [number, number]][] = [
  ['excavator', [12, 22]],
  ['loader', [10, 18]],
  ['dozer', [18, 28]],
  ['bulldozer', [18, 28]],
  ['grader', [10, 16]],
  ['crane', [6, 12]],
  ['telehandler', [5, 9]],
  ['backhoe', [7, 12]],
  ['generator', [25, 40]],
  ['compactor', [8, 14]],
  ['welder', [4, 6]],
  ['forklift', [3, 6]],
  ['lift', [2, 5]],
  ['skid', [3, 6]],
];

export function workingRangeLph(asset: Asset): [number, number] {
  const name = asset.name.toLowerCase();
  for (const [key, range] of WORKING_RANGE_LPH) if (name.includes(key)) return range;
  const avg = CLASS_AVG_FUEL_LPH[asset.assetClass] ?? 10;
  return [avg * 0.8, avg * 1.2];
}

/** Mean working consumption: the middle of the spec range. */
export function meanWorkingLph(asset: Asset): number {
  const [lo, hi] = workingRangeLph(asset);
  return (lo + hi) / 2;
}

/** Share of each day the engine runs, by behaviour. Used for the fuel chain only. */
const ON_FRACTION: Record<Asset['behaviour'], number> = {
  parked: 0.02,
  works_at_site: 0.4,
  drives_between_sites: 0.3,
  stationary_24h: 0.25,
  light_vehicle_day: 0.3,
};

/** Assets whose fuel levels are pinned by a seeded alert; their burn stays even. */
const SCRIPTED_LEVELS = new Set(['GN-01']);

interface Chain {
  originMs: number;
  /** Level (%) at the start of step i, after any refuel or drop at that step. */
  level: Float64Array;
  /** Litres used by the start of step i. */
  used: Float64Array;
  /** Litres burned per hour during step i (0 when the engine is off in that step). */
  burnLph: Float64Array;
  /** Start of each step where the tank was refilled. */
  refuelAt: number[];
}

const chains = new Map<string, Chain>();

function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seedFor(asset: Asset): number {
  let h = 2166136261;
  for (const ch of asset.code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function dubaiHour(ms: number): number {
  return ((ms + DUBAI_OFFSET_MS) % DAY) / (60 * MIN);
}

function buildChain(asset: Asset): Chain {
  const tank = asset.tankLitres ?? 300;
  const prng = mulberry32(seedFor(asset));
  const originMs = ANCHOR_MS - HISTORY_DAYS * DAY;
  const steps = Math.ceil((DAY * 2 + HISTORY_DAYS * DAY) / STEP_MS);
  const level = new Float64Array(steps);
  const used = new Float64Array(steps);
  const burnLph = new Float64Array(steps);
  const refuelAt: number[] = [];

  const [lo, hi] = workingRangeLph(asset);
  const meanLph = (lo + hi) / 2;
  const onFraction = ON_FRACTION[asset.behaviour] ?? 0.3;
  const refuelBelow = 20 + prng() * 10;
  let current = 60 + prng() * 35;
  let cumulative = 0;
  const hoursPerStep = STEP_MS / (60 * MIN);

  for (let i = 0; i < steps; i++) {
    const stepStart = originMs + i * STEP_MS;
    if (stepStart === GN01_DROP_AT && asset.code === 'GN-01') current -= GN01_DROP_PCT;
    // Refuel during the shift (07:00–18:00 Dubai) when the tank drops below the threshold.
    const h = dubaiHour(stepStart);
    if (current < refuelBelow && h >= 7 && h < 18) {
      current = Math.min(100, current + 40 + prng() * 30);
      refuelAt.push(stepStart);
    }
    level[i] = current;
    used[i] = cumulative;
    const engineOn = !(asset.code === 'GN-01' && stepStart >= GN01_OFF_FROM && stepStart < GN01_OFF_TO);
    // C2: burn follows the day's engine hours (the same day factors as the ECU meter).
    // GN-01's levels are scripted (§8.7: 20% at 04:37, refuel at 07:00), so it keeps the even burn.
    const load = SCRIPTED_LEVELS.has(asset.code) ? 1 : dayLoadFactor(asset, stepStart);
    const lph = engineOn ? meanLph * onFraction * load : 0;
    burnLph[i] = lph;
    const litres = lph * hoursPerStep;
    cumulative += litres;
    current -= (litres / tank) * 100;
    if (current < 0) current = 0;
  }
  return { originMs, level, used, burnLph, refuelAt };
}

function chainFor(asset: Asset): Chain {
  let c = chains.get(asset.id);
  if (!c) {
    c = buildChain(asset);
    chains.set(asset.id, c);
  }
  return c;
}

export interface FuelState {
  levelPct: number;
  usedL: number;
  /** Burn at this moment in L/h, from the chain. */
  burnLph: number;
}

/** Fuel state of an asset at `t`, interpolated inside the 10-minute step it falls in. */
export function fuelStateAt(asset: Asset, t: number): FuelState {
  const c = chainFor(asset);
  const idx = Math.min(c.level.length - 1, Math.max(0, Math.floor((t - c.originMs) / STEP_MS)));
  const stepStart = c.originMs + idx * STEP_MS;
  const within = Math.max(0, Math.min(1, (t - stepStart) / STEP_MS));
  const tank = asset.tankLitres ?? 300;
  const burnedInStep = c.burnLph[idx] * (STEP_MS / (60 * MIN)) * within;
  const levelPct = Math.max(0, c.level[idx] - (burnedInStep / tank) * 100);
  return {
    levelPct: Math.round(levelPct * 10) / 10,
    usedL: Math.round((c.used[idx] + burnedInStep) * 10) / 10,
    burnLph: c.burnLph[idx],
  };
}

/** Refuel times in the history window, for the simulator and the tests. */
export function refuelTimesFor(asset: Asset): number[] {
  return chainFor(asset).refuelAt.slice();
}

/** Instantaneous fuel rate for a reading, from its mode and the machine's working range. */
export function instantRateLph(asset: Asset, mode: 'off' | 'idle' | 'work' | 'drive', u: number): number {
  if (mode === 'off') return 0;
  const [lo, hi] = workingRangeLph(asset);
  if (mode === 'idle') return Math.round((lo * 0.2 + u * lo * 0.1) * 10) / 10;
  const base = lo + (hi - lo) * u;
  return Math.round((mode === 'drive' ? base * 1.1 : base) * 10) / 10;
}
