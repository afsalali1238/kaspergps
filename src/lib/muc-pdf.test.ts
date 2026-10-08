// MUC certificate PDF includes the verify QR and code (spec §11.5, S36–S39).

import { describe, it, expect } from 'vitest';
import { buildMucPdf, mucVerifyUrl, mucFileName } from '@/lib/muc-pdf';
import { seed } from '@/server/seed/data';

describe('muc-pdf', () => {
  it('builds a real PDF for a sealed certificate', async () => {
    const muc = seed.mucs.find(m => m.status === 'sealed')!;
    expect(muc).toBeTruthy();
    const bytes = await buildMucPdf(muc);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('uses the per-number verify URL and a stable file name', () => {
    const muc = seed.mucs[0];
    expect(mucVerifyUrl(muc)).toBe(`https://kaspergps.ae/verify/${encodeURIComponent(muc.number)}`);
    expect(mucFileName(muc)).toContain(muc.number);
    expect(mucFileName(muc)).toMatch(/^Kasper_MUC_/);
  });
});
