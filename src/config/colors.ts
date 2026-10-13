// Colours as plain strings, for code that can't use CSS classes: Leaflet markers and
// divIcons, chart libraries, and inline SVG. They are the same values as the tokens in
// app/globals.css; change both together. Components should use the Tailwind token
// classes (bg-live, text-red, …) instead of these wherever they can.
export const COLORS = {
  ink: '#141518',
  accent: '#FFC400',
  accentDark: '#E6AF00',
  paper: '#F1F1EC',
  paper2: '#F6F6F3',
  line: '#E8E8E3',
  line2: '#D8D8D2',
  slate: '#5B5F66',
  secondary: '#6B6F76',
  muted: '#9A9CA1',
  surface: '#FFFFFF',
  live: '#1F9A6D',
  idle: '#E6AF00',
  stale: '#D6457F',
  offline: '#D64545',
  unknown: '#9A9CA1',
  noTracker: '#C8C8C3',
  ok: '#1F9A6D',
  warn: '#E6AF00',
  bad: '#D64545',
  info: '#3D6E96',
  zone2: '#6E6398',
  // Text-safe inks (same as the --*-ink tokens): use these for words, not the base colours.
  okInk: '#136B4F',
  warnInk: '#7A5C00',
  badInk: '#A83232',
  infoInk: '#305C80',
  // Map-only strokes and fills (Leaflet needs strings).
  idleMarker: '#B89000',
  geofenceDraw: '#D4A000',
  track: '#1D4ED8',
  trackFaded: '#495057',
  hatch: '#CED4DA',
} as const;

export type ColorName = keyof typeof COLORS;

/** Map pin fill per live status (fleet map and asset page). Stale and unknown read grey on the map. */
export const MAP_STATUS_COLORS: Record<string, string> = {
  live: COLORS.live,
  idle: COLORS.idleMarker,
  stale: COLORS.muted,
  offline: COLORS.offline,
  unknown: COLORS.muted,
  no_tracker: COLORS.muted,
};

/** Geofence outline per kind (fleet map and geofences screen). */
export function geofenceColor(kind: string): string {
  return kind === 'restricted' ? COLORS.bad : kind === 'site' ? COLORS.live : COLORS.idleMarker;
}

/** Playback event pins. F2 (playback timeline) re-maps these onto the status tokens. */
export const PLAYBACK_EVENT_COLORS = {
  trip_start: '#0CA678',
  trip_stop: '#495057',
  harsh: '#E8590C',
  overspeed: '#E03131',
  fuel_drop: '#7048E8',
  refuel: '#2B8A3E',
  power_cut: '#C2255C',
  towing: '#A61E4D',
  geofence_enter: '#1971C2',
  geofence_exit: '#1971C2',
} as const;

/** Playback timeline state bands. */
export const PLAYBACK_STATE_COLORS = {
  moving: '#2F9E44',
  stationary_on: '#F59F00',
  off: '#ADB5BD',
} as const;
