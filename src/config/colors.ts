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
} as const;

export type ColorName = keyof typeof COLORS;
