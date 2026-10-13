// The string colours must stay equal to the CSS tokens they mirror.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COLORS } from './colors';

const css = readFileSync('app/globals.css', 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();

describe('COLORS mirror the CSS tokens', () => {
  it.each([
    ['ink', 'ink'], ['Kasper-yellow', 'accent'], ['yellow-dark', 'accentDark'], ['paper', 'paper'],
    ['paper-2', 'paper2'], ['line', 'line'], ['line-2', 'line2'], ['grey-700', 'slate'],
    ['grey-500', 'secondary'], ['muted', 'muted'], ['live', 'live'], ['idle', 'idle'], ['stale', 'stale'],
    ['offline', 'offline'], ['info', 'info'], ['zone-2', 'zone2'],
    ['ok-ink', 'okInk'], ['warn-ink', 'warnInk'], ['bad-ink', 'badInk'], ['info-ink', 'infoInk'],
  ] as const)('--%s equals COLORS.%s', (cssName, key) => {
    expect(token(cssName)).toBe(COLORS[key].toUpperCase());
  });
});

// B3 "done when": no raw hex in screens or components. Colours come from the tokens
// (Tailwind classes) or, where a library needs a string, from src/config/colors.ts.
// The only other hex lives in the token block of app/globals.css.
describe('no raw hex outside the colour config', () => {
  const HEX = /#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?(?:[0-9A-Fa-f]{2})?\b/;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk('src/components');
  walk('app');

  it('finds the files it checks', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s', file => {
    let text = readFileSync(file, 'utf8');
    // globals.css defines the tokens in its :root block; everything after it must use them.
    if (file.endsWith('globals.css')) text = text.slice(text.indexOf('@theme'));
    const hits = text.split('\n').filter(line => HEX.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));
    expect(hits).toEqual([]);
  });
});
