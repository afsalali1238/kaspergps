import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, VARIANT_TONE } from './Badge';
import { StatusBadge } from './StatusBadge';
import { StatusDot } from './StatusDot';
import { TONES } from './tones';

describe('Badge', () => {
  it('has one shape for every tone: mono, radius 3, tint and AA ink', () => {
    for (const tone of TONES) {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      const el = screen.getByText(tone);
      expect(el.className).toMatch(/font-mono/);
      expect(el.className).toMatch(/rounded-\[3px\]/);
      expect(el.dataset.tone).toBe(tone);
      unmount();
    }
  });

  it('maps the old variant API onto tones', () => {
    render(<Badge variant="red">Overdue</Badge>);
    expect(screen.getByText('Overdue').dataset.tone).toBe('bad');
    expect(VARIANT_TONE.green).toBe('ok');
    expect(VARIANT_TONE.amber).toBe('warn');
  });

  it('lets tone win over variant', () => {
    render(<Badge tone="info" variant="red">Zone</Badge>);
    expect(screen.getByText('Zone').dataset.tone).toBe('info');
  });

  it('never uses the non-existent background- prefix', () => {
    render(<Badge variant="yellow" dot>Accent</Badge>);
    expect(screen.getByText('Accent').outerHTML).not.toMatch(/\bbackground-/);
  });
});

describe('StatusBadge', () => {
  it('writes the status in words next to the dot', () => {
    render(<StatusBadge status="offline" />);
    const badge = screen.getByText('Offline').parentElement!;
    expect(badge.dataset.status).toBe('offline');
    expect(badge.className).toMatch(/rounded-\[3px\]/);
  });
});

describe('StatusDot', () => {
  it('is hidden from screen readers when the status is written beside it', () => {
    const { container } = render(<StatusDot status="live" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('is announced when it stands alone', () => {
    render(<StatusDot status="idle" label="Idle" />);
    expect(screen.getByRole('img', { name: 'Idle' }).className).toMatch(/bg-idle/);
  });

  it('takes a tone when there is no asset status', () => {
    const { container } = render(<StatusDot tone="bad" pulse />);
    expect(container.firstElementChild!.className).toMatch(/bg-bad/);
  });
});
