// H2.1 — the button variants must use utilities that exist in the built CSS.
// `background-*` is not a Tailwind class, so those buttons rendered invisible.
import { describe, it, expect } from 'vitest';
import { variantStyles } from './Button';

describe('Button variants', () => {
  it('every variant sets its background with a bg- utility', () => {
    for (const [variant, classes] of Object.entries(variantStyles)) {
      expect(classes.split(' ').some(c => c.startsWith('bg-')), `${variant} has no bg- class`).toBe(true);
    }
  });

  it('no variant uses the non-existent background- prefix', () => {
    for (const [variant, classes] of Object.entries(variantStyles)) {
      expect(classes, variant).not.toMatch(/\bbackground-/);
    }
  });
});
