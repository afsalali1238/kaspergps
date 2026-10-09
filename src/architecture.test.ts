// Architecture tests — spec §2 "Non-negotiable architecture rules" and §14.
// These grep the source tree directly so a rule can never be silently disabled:
//
//  1. Components never import the store, seed or telemetry modules
//     (enforced strictly for src/components/ui/**; src/components/layout and
//     demo shell + app routes have a pinned, no-growth ratchet — see below).
//  2. A role is compared (`role ===` or `role !==`, any receiver) only in the
//     role→capability map, the role→words map and the seed. Everything else asks
//     can() or hasRole(). Test files build sessions like the session builder, so
//     they are exempt (lint mirrors this).
//  6. Screens (app/ and src/components/) import server code only from
//     src/server/api.ts (F3).
//  7. The pre-F3 helpers (hasCapability, hasCompanyCapability, canEndAccess,
//     isAssetEditable) do not come back.
//  3. No Date.now() / new Date() outside clock.ts, seed and telemetry.
//  4. The banned brand words never appear in src/ or app/.
//
// The same rules run in ESLint (eslint.config.mjs); this file is the backstop.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].map(f => ({
  path: relative(ROOT, f).split(sep).join('/'),
  text: readFileSync(f, 'utf8'),
}));

const srcFiles = files.filter(f => f.path.startsWith('src/'));

// ── Rule 2: role === only in the role maps ────────────────────────────────────

describe('architecture: role comparisons (rule 2)', () => {
  const allowed = (p: string) =>
    p === 'src/server/capabilities.ts' ||
    p === 'src/server/capability-reasons.ts' ||
    p.startsWith('src/server/seed/');

  it('src/ and app/ never compare a role outside the capability and reason maps', () => {
    const offenders = files
      .filter(f => !allowed(f.path))
      .filter(f => /\brole\s*[!=]==/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });
});

// ── Rule 6: screens reach the server only through the API (F3) ────────────────

describe('architecture: screens import the server only via src/server/api (rule 6)', () => {
  const screen = (p: string) => p.startsWith('app/') || p.startsWith('src/components/');

  it('no screen imports a server module other than src/server/api', () => {
    const offenders: string[] = [];
    for (const f of files.filter(f => screen(f.path))) {
      for (const m of f.text.matchAll(/from\s+['"](@\/server\/[^'"]+|\.{1,2}\/[^'"]*server\/[^'"]+)['"]/g)) {
        if (m[1] !== '@/server/api') offenders.push(`${f.path} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── Rule 7: the pre-F3 permission helpers stay deleted ────────────────────────

describe('architecture: removed permission helpers (rule 7)', () => {
  it('hasCapability, hasCompanyCapability, canEndAccess and isAssetEditable are not called anywhere', () => {
    const offenders = files
      .filter(f => /\b(hasCapability|hasCompanyCapability|canEndAccess|isAssetEditable)\(/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });
});

// ── Rule 3: the simulated clock ───────────────────────────────────────────────

describe('architecture: time comes from clock.ts (rule 3)', () => {
  const allowed = (p: string) =>
    p === 'src/lib/clock.ts' ||
    p.startsWith('src/server/seed/') ||
    p.startsWith('src/server/telemetry/');

  it('no Date.now() or new Date() outside clock/seed/telemetry', () => {
    const offenders = files
      .filter(f => !allowed(f.path))
      .filter(f => /Date\.now\(\)/.test(f.text) || /new Date\(\)/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });
});

// ── Rule 4: brand words ───────────────────────────────────────────────────────

describe('architecture: brand words (rule 4)', () => {
  it('src/ never says the banned words', () => {
    const offenders: string[] = [];
    for (const f of srcFiles) {
      if (/\bdevice\b/i.test(f.text) || /dozr/i.test(f.text)) offenders.push(f.path);
    }
    expect(offenders).toEqual([]);
  });

  it('app/ says the banned words only as the sanctioned "device time" tooltip', () => {
    const offenders: string[] = [];
    for (const f of files.filter(f => f.path.startsWith('app/'))) {
      const cleaned = f.text.replace(/device time/gi, '');
      if (/\bdevice\b/i.test(cleaned) || /dozr/i.test(cleaned)) offenders.push(f.path);
    }
    expect(offenders).toEqual([]);
  });
});

// ── Rule 1: one permission gate ───────────────────────────────────────────────

describe('architecture: components do not touch data modules (rule 1)', () => {
  const gate = /from ['"]@(\/store|\/server\/seed\/|\/server\/telemetry\/)/;

  it('UI-kit components never import store, seed or telemetry', () => {
    const offenders = srcFiles
      .filter(f => f.path.startsWith('src/components/ui/'))
      .filter(f => gate.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });

  // Ratchet: app routes still read the in-memory seed directly. Every file here
  // is a known deviation from rule 1 recorded in reviews/STATUS-REVIEW.md; the
  // list must only shrink. (F2 moved the shell, the demo bar and the features
  // panel onto src/hooks, so no component is listed now.)
  // Remove an entry when the file moves onto the API layer — never add one.
  const KNOWN_DIRECT_DATA_IMPORTS: string[] = [];

  it('the direct-import ratchet never grows', () => {
    const offenders = srcFiles
      .filter(f => f.path.startsWith('src/components/'))
      .filter(f => gate.test(f.text))
      .map(f => f.path)
      .sort();
    const grew = offenders.filter(p => !KNOWN_DIRECT_DATA_IMPORTS.includes(p));
    expect(grew).toEqual([]);
    // every pinned file must still be listed (keep the list honest)
    for (const p of offenders) expect(KNOWN_DIRECT_DATA_IMPORTS).toContain(p);
  });
});

// ── Rule 5: screens read state through hooks (F2) ──────────────────────────────
// getState() reads do not re-render when the value changes, so a screen can show
// stale data after a change. Components and app routes read through @/hooks or
// useDb (the lint rule in eslint.config.mjs is the first line; this is the backstop).

describe('architecture: no getState() in screens (rule 5)', () => {
  it('app/ and src/components/ never call getState()', () => {
    const offenders = files
      .filter(f => f.path.startsWith('app/') || f.path.startsWith('src/components/'))
      .filter(f => /\bgetState\b/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });
});
