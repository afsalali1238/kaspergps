// Global search over the user's visible assets (spec §11.3 Search, S40).
// Sits behind the API layer so UI components never touch the seed directly.

import { seed } from '@/server/seed/data';
import type { Session } from '@/domain/types';
import { visibleAssetIds } from '@/server/access';

export interface AssetSearchHit {
  id: string;
  code: string;
  name: string;
  siteName: string;
  subtitle: string;
}

/**
 * Matches code, name, site, plate/serial, make and model — the fields the
 * spec's search copy names. Returns at most `limit` hits.
 */
export function searchAssets(session: Session | null, query: string, limit = 6): AssetSearchHit[] {
  if (!session) return [];
  const q = query.trim().toLowerCase();
  const visible = new Set(visibleAssetIds(session));
  return seed.assets
    .filter(a => visible.has(a.id))
    .filter(a => {
      const site = seed.sites.find(s => s.id === a.homeSiteId)?.name ?? '';
      if (!q) return true;
      return [a.code, a.name, site, a.plateOrSerial, a.make, a.model]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    })
    .slice(0, limit)
    .map(a => {
      const siteName = seed.sites.find(s => s.id === a.homeSiteId)?.name ?? '';
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        siteName,
        subtitle: siteName,
      };
    });
}
