// Guided walkthroughs (spec §11.2 demo bar item 7): every §13 scenario has
// numbered steps and a final "what you should see" step.

import { describe, it, expect } from 'vitest';
import { walkthroughSteps } from '@/components/demo/walkthroughs';

describe('walkthroughs', () => {
  it('covers every scenario S1–S50 with steps', () => {
    for (let id = 1; id <= 50; id++) {
      const steps = walkthroughSteps(id);
      expect(steps.length, `S${id} steps`).toBeGreaterThanOrEqual(2);
      const last = steps[steps.length - 1];
      expect(last.text, `S${id} last step`).toMatch(/^What you should see: .+/);
    }
  });

  it('keeps highlights as simple CSS selectors', () => {
    for (let id = 1; id <= 50; id++) {
      for (const s of walkthroughSteps(id)) {
        if (s.highlight) expect(s.highlight).toMatch(/^[a-zA-Z0-9_\-.[\]=#:/"]+$/);
      }
    }
  });
});
