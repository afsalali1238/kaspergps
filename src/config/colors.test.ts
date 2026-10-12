// The string colours must stay equal to the CSS tokens they mirror.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COLORS } from './colors';

const css = readFileSync('app/globals.css', 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();

describe('COLORS mirror the CSS tokens', () => {
  it.each([
    ['ink', 'ink'], ['Kasper-yellow', 'accent'], ['yellow-dark', 'accentDark'], ['paper', 'paper'],
    ['paper-2', 'paper2'], ['line', 'line'], ['line-2', 'line2'], ['grey-700', 'slate'],
    ['grey-500', 'secondary'], ['muted', 'muted'], ['live', 'live'], ['idle', 'idle'], ['stale', 'stale'],
    ['offline', 'offline'], ['info', 'info'], ['zone-2', 'zone2'],
  ] as const)('--%s equals COLORS.%s', (cssName, key) => {
    expect(token(cssName)).toBe(COLORS[key].toUpperCase());
  });
});
