// Dummy pricing for the Kasper GPS prototype.
// ALL values are dummy — shown with "Dummy rates" in the UI.
// Prices in AED.

export const GPS_SUBSCRIPTION_PER_MONTH = {
  tier1: 75,
  tier2: 110,
  tier3: 165,
} as const;

export const DIESEL_PRICE_AED_PER_L = 3.05;

// Class-average fuel consumption L/h for cost estimates when no CAN data.
// Used for Tier 1/2 cost estimates and Tier 1 idle cost.
export const CLASS_AVG_FUEL_LPH: Record<string, number> = {
  excavator: 16,
  loader: 14,
  dozer: 22,
  grader: 15,
  crane: 9,
  telehandler: 7,
  generator: 30,
  truck: 12,
  pickup: 4,
  light_vehicle: 4,
  forklift: 3,
  boom_lift: 0,
  scissor_lift: 0,
  water_tanker: 12,
  mobile_welder: 5,
  skid_steer: 3,
};

export const MILEAGE_RATES_DAILY = {
  truck: { min: 900, max: 1400 },
  plant: { min: 150, max: 200 },
  lifting: { min: 1200, max: 3500 },
  light_vehicle: { min: 300, max: 600 },
  power: { min: 300, max: 800 },
} as const;

// Hourly rates by class (AED/h), for daily-rate conversion display
export const HOURLY_RATES = {
  plant: { min: 150, max: 200 },
  crane: { min: 1200, max: 3500 },
  truck: { min: 900, max: 1400 },
  light_vehicle: { min: 300, max: 600 },
  power: { min: 300, max: 800 },
} as const;

export const TP21_DAILY_RATE_AED = 1100;

export function formatDummyRate(label: string): string {
  return `${label} (Dummy rates)`;
}
