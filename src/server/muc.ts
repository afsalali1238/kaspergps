import type { Muc } from '@/domain/types';
import { seed } from '@/server/seed/data';

/** Find a sealed or voided utilisation certificate by its public number. */
export function getMucByNumber(number: string): Muc | null {
  if (!number.trim()) return null;
  return seed.mucs.find(muc => muc.number === number.trim()) ?? null;
}
