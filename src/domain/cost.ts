export const DEFAULT_DIESEL_PRICE_AED_PER_L = 3.05;
export const COMPANY_DIESEL_PRICE_STORAGE_PREFIX = 'kasper.company-diesel-price.v1:';

export function companyDieselPriceStorageKey(tenantId: string | null): string {
  return `${COMPANY_DIESEL_PRICE_STORAGE_PREFIX}${tenantId ?? 'kasper'}`;
}

export function parseDieselPrice(serialized: string | null): number | null {
  if (serialized === null || serialized.trim() === '') return null;
  const value = Number(serialized);
  return Number.isFinite(value) && value > 0 && value <= 20 ? value : null;
}
