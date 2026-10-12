// A small built-in list of Dubai and UAE areas (spec §11.8): a site's location
// is picked from here by name, so no map search or outside geocoder is needed.

export interface Place {
  name: string;
  center: { lat: number; lng: number };
}

export const PLACES: Place[] = [
  { name: 'Business Bay', center: { lat: 25.1866, lng: 55.2644 } },
  { name: 'Dubai Hills', center: { lat: 25.1177, lng: 55.2480 } },
  { name: 'Al Quoz', center: { lat: 25.1466, lng: 55.2286 } },
  { name: 'Al Qusais', center: { lat: 25.2791, lng: 55.3776 } },
  { name: 'Dubai South', center: { lat: 24.8956, lng: 55.1647 } },
  { name: 'Jebel Ali', center: { lat: 25.0213, lng: 55.0634 } },
  { name: 'JVC (Jumeirah Village Circle)', center: { lat: 25.0575, lng: 55.2107 } },
  { name: 'Palm Jumeirah', center: { lat: 25.1124, lng: 55.1390 } },
  { name: 'Ras Al Khaimah', center: { lat: 25.7895, lng: 55.9432 } },
];

/** Places whose name contains the query (case-insensitive). An empty query lists them all. */
export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  return q ? PLACES.filter(p => p.name.toLowerCase().includes(q)) : PLACES;
}
