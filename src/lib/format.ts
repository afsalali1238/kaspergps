// One set of number formatters for every screen (UI-UPGRADE §9.3, C2).
//
// - Grouped with commas in the en-US style ("8,420"), so no raw floats like
//   "37.599999" reach a screen.
// - A missing value (null, undefined, NaN, ±Infinity) reads "Not measured",
//   never 0 (spec 4: never present a gap as a measure).
// - Numbers stay Western digits in Arabic too (§10: "numbers stay LTR").
//
// Wave 2 screens switch to these on their own pages; C2 only adds them.

export const NOT_MEASURED = 'Not measured';

type Maybe = number | null | undefined;

function isNumber(value: Maybe): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fixed(value: number, decimals: number): string {
  // Round first so 0.05 → "0.1" the same way everywhere, and never print "-0".
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const clean = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  return clean.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "8,420" or, with decimals, "8,420.5". */
export function formatNumber(value: Maybe, decimals = 0): string {
  return isNumber(value) ? fixed(value, decimals) : NOT_MEASURED;
}

/** Engine hours: "8,420.0 h" (one decimal, like the ECU meter). */
export function formatHours(value: Maybe, decimals = 1): string {
  return isNumber(value) ? `${fixed(value, decimals)} h` : NOT_MEASURED;
}

/** Distance: one decimal under 10 km ("3.4 km"), whole kilometres above ("1,234 km"). */
export function formatKm(value: Maybe): string {
  if (!isNumber(value)) return NOT_MEASURED;
  return `${fixed(value, Math.abs(value) < 10 ? 1 : 0)} km`;
}

/** Speed in whole km/h: "62 km/h". */
export function formatSpeed(value: Maybe): string {
  return isNumber(value) ? `${fixed(value, 0)} km/h` : NOT_MEASURED;
}

/** Money: "AED 1,234" (whole dirhams), "AED 1,234.50" with decimals = 2, "AED -1,200" for a loss. */
export function formatAed(value: Maybe, decimals = 0): string {
  return isNumber(value) ? `AED ${fixed(value, decimals)}` : NOT_MEASURED;
}

/** Percent: "76%" or, with decimals, "75.9%". */
export function formatPct(value: Maybe, decimals = 0): string {
  return isNumber(value) ? `${fixed(value, decimals)}%` : NOT_MEASURED;
}

/** Supply voltage: "24.1 V". */
export function formatVolts(value: Maybe, decimals = 1): string {
  return isNumber(value) ? `${fixed(value, decimals)} V` : NOT_MEASURED;
}
