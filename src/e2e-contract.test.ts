// E2E contract — the parts of the Playwright suite that can be checked without
// a browser.
//
// The suite has never run in Chromium here (no browser in this environment), and
// the failures it hits are almost never product bugs: they are selector drift —
// a spec reaching for `getByLabel('Full name')` when the field's accessible name
// is the <label> "Name", or a label that was never paired to its control, so
// getByLabel finds nothing even though the screen looks right to a human.
//
// Playwright's accessible-name rules are small enough to check statically:
//   · <label for="x"> names the control with id="x" in the same document, and
//   · a <label> that *wraps* a control names it.
// Everything else (placeholders, aria-describedby, a caption sitting next to an
// unlabelled input) does NOT produce an accessible name. This test walks every
// getByLabel in tests/e2e and fails if the app has nothing that would match it.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', 'reviews', 'screenshots'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

const appFiles = walk(join(ROOT, 'app')).map(path => ({ path, src: readFileSync(path, 'utf8') }));
const specDir = join(ROOT, 'tests', 'e2e');
const specFiles = readdirSync(specDir)
  .filter(f => f.endsWith('.ts'))
  .map(f => ({ name: f, src: readFileSync(join(specDir, f), 'utf8') }));

interface LabelQuery {
  /** The spec's argument, as written. */
  raw: string;
  /** Matches the accessible name case-insensitively (substring, like Playwright). */
  test: (name: string) => boolean;
  spec: string;
}

function queries(): LabelQuery[] {
  const found: LabelQuery[] = [];
  for (const { name, src } of specFiles) {
    for (const m of src.matchAll(/getByLabel\(\s*'([^']+)'/g)) {
      const needle = m[1].toLowerCase();
      found.push({ raw: `'${m[1]}'`, test: n => n.toLowerCase().includes(needle), spec: name });
    }
    for (const m of src.matchAll(/getByLabel\(\s*\/(.+?)\/([a-z]*)\)/g)) {
      const flags = m[2].includes('i') ? m[2] : `${m[2]}i`;
      const re = new RegExp(m[1], flags);
      found.push({ raw: `/${m[1]}/${m[2]}`, test: n => re.test(n), spec: name });
    }
  }
  return found;
}

/** The English names a label gives its control, as they render in the demo. */
function labelNames(src: string): { names: string[]; pairsControl: boolean }[] {
  const out: { names: string[]; pairsControl: boolean }[] = [];
  for (const match of src.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
    const [, attrs, body] = match;
    const htmlFor = /htmlFor="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const wrapsControl = /<(input|select|textarea)\b/.test(body);
    // A label's text is either plain JSX text or a t('key', 'English') call;
    // strip the tags and collect both the whole line and every string literal.
    const withoutTags = body.replace(/\{[^}]*\}/g, ' ');
    const literals = [...body.matchAll(/'([^']*)'/g)].map(m => m[1]);
    const htmlForResolves = htmlFor !== null
      && new RegExp(`<(input|select|textarea)\\b[^>]*\\bid="${htmlFor}"`).test(src);
    out.push({
      names: [withoutTags, ...literals],
      // Either it wraps a control, or its htmlFor points at one in this file.
      pairsControl: wrapsControl || htmlForResolves,
    });
  }
  return out;
}

const LABELS = appFiles.flatMap(file =>
  labelNames(file.src)
    .filter(label => label.pairsControl)
    .flatMap(label => label.names.map(name => ({ name, file: file.path.replace(`${ROOT}/`, '') })))
);

describe('e2e contract: every getByLabel has a paired, named control', () => {
  const wanted = queries();

  it('finds the label queries to check', () => {
    expect(wanted.length).toBeGreaterThanOrEqual(15);
  });

  it.each(wanted.map(q => [q.raw, q.spec, q] as const))(
    '%s (%s) resolves in the app',
    (_raw, _spec, q) => {
      const hit = LABELS.find(l => q.test(l.name) && l.name.trim().length > 0);
      expect(
        hit?.file,
        `No <label> in app/ names a control "${q.raw}". Pair the control with id/htmlFor `
        + `or wrap it, or re-point the spec at the label the product actually uses.`
      ).toBeTruthy();
    }
  );
});

describe('e2e contract: the surfaces the suite leans on exist', () => {
  const certificates = readFileSync(join(ROOT, 'app/app/certificates/page.tsx'), 'utf8');

  it('gates the certificates screen on Phase 2, with the copy the spec quotes', () => {
    expect(certificates).toMatch(/phase === 'day_one'/);
    expect(certificates).toContain('Certificates are available in Phase 2');
  });

  it('keeps the demo-bar affordances the helpers click', () => {
    // The bar composes ViewAsMenu, which renders the "View as" trigger.
    const demoBar = ['src/components/demo/DemoBar.tsx', 'src/components/demo/ViewAsMenu.tsx']
      .map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    for (const trigger of ['View as', 'Clock', 'Scenarios', 'Tools', 'demo-bar']) {
      expect(demoBar, `DemoBar lost its "${trigger}"`).toContain(trigger);
    }
  });

  it('shows the "today" figures the map strip is specified to carry', () => {
    const map = readFileSync(join(ROOT, 'app/app/page.tsx'), 'utf8');
    for (const key of ['map.kpi.engine_hours_today', 'map.kpi.fuel_used_today', 'map.kpi.open_alerts']) {
      expect(map, `${key} is no longer rendered on /app`).toContain(key);
    }
  });

  it('gives Tier 1 and Tier 2 assets a real utilisation table, not a sentence', () => {
    const detail = readFileSync(join(ROOT, 'app/app/assets/[id]/page.tsx'), 'utf8');
    expect(detail).toContain('asset_detail.utilisation.ignition_stationary');
    expect(detail).toContain('asset_detail.utilisation.off_h');
    expect(detail).not.toContain('Last 7 days utilisation for this asset.');
  });
});
