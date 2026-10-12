import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { SegmentedTabs } from './SegmentedTabs';
import { ProgressBar, clampPercent } from './ProgressBar';
import { Sparkline, sparkPoints } from './Sparkline';
import { CopyButton } from './CopyButton';
import { Panel } from './Panel';
import { EmptyState } from './EmptyState';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History' },
  { id: 'alerts', label: 'Alerts', count: 3 },
];

function TabsHarness() {
  const [v, setV] = useState('overview');
  return <SegmentedTabs label="Asset sections" tabs={tabs} value={v} onChange={setV} idPrefix="asset" />;
}

describe('SegmentedTabs', () => {
  it('is a tablist with one selected tab and roving tabindex', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tablist', { name: 'Asset sections' })).toBeInTheDocument();
    const overview = screen.getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(overview).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: /Alerts/ })).toHaveTextContent('3');
  });

  it('moves with the arrow keys and Home/End', () => {
    render(<TabsHarness />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'History' }));
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: /Alerts/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /Alerts/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('mirrors the arrows in Arabic', () => {
    document.documentElement.dir = 'rtl';
    try {
      render(<TabsHarness />);
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
      expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    } finally {
      document.documentElement.dir = 'ltr';
    }
  });

  it('scrolls sideways and has both edge fades', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tablist').className).toMatch(/overflow-x-auto/);
    const fades = document.querySelectorAll('[data-fade]');
    expect(fades).toHaveLength(2);
    // jsdom has no layout, so nothing overflows and both fades stay hidden.
    fades.forEach(f => expect(f.className).toMatch(/opacity-0/));
  });

  it('clicking a tab selects it', () => {
    render(<TabsHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ProgressBar', () => {
  it('reports its value and clamps the fill', () => {
    render(<ProgressBar label="Fuel level" value={140} valueLabel="140 L" max={100} />);
    const bar = screen.getByRole('progressbar', { name: 'Fuel level' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
    expect(screen.getByText('140 L')).toBeInTheDocument();
  });

  it('is an empty track that reads "Not measured" without a value', () => {
    render(<ProgressBar label="Fuel level" value={null} />);
    const bar = screen.getByRole('progressbar', { name: 'Fuel level' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('aria-valuetext', 'Not measured');
    expect(bar.firstElementChild).toBeNull();
    expect(screen.getByText('Not measured')).toBeInTheDocument();
  });

  it('clampPercent handles bad input', () => {
    expect(clampPercent(50, 200)).toBe(25);
    expect(clampPercent(-5, 100)).toBe(0);
    expect(clampPercent(5, 0)).toBe(0);
    expect(clampPercent(Number.NaN, 100)).toBe(0);
  });
});

describe('Sparkline', () => {
  it('draws a labelled line from finite points', () => {
    render(<Sparkline values={[1, 3, null, 2]} label="Fuel per day" />);
    const svg = screen.getByRole('img', { name: 'Fuel per day' });
    expect(svg.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(3);
  });

  it('draws nothing with fewer than two points', () => {
    const { container } = render(<Sparkline values={[4]} label="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps points inside the box and rounds them', () => {
    const pts = sparkPoints([0, 10, 5], 80, 24);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(80);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(24);
      expect(String(x)).not.toMatch(/\.\d{2,}/);
    }
    // A flat series sits in the middle, not on an edge.
    expect(sparkPoints([5, 5], 80, 24).every(([, y]) => y === 12)).toBe(true);
  });

  it('can shade the area', () => {
    render(<Sparkline values={[1, 2]} label="a" area />);
    expect(screen.getByRole('img').querySelector('polygon')).not.toBeNull();
  });
});

describe('CopyButton', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('copies the value and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<CopyButton value="356938035643809" label="Copy IMEI" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy IMEI' }));
    });
    expect(writeText).toHaveBeenCalledWith('356938035643809');
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('says so when the clipboard is blocked', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CopyButton value="x" showText />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
  });

  it('resets after a moment', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CopyButton value="x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByRole('button').dataset.state).toBe('copied');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button').dataset.state).toBe('idle');
  });
});

describe('Panel', () => {
  it('draws a header with title, eyebrow and actions', () => {
    render(
      <Panel title="Service plan" eyebrow="EX-04" actions={<button>Log</button>}>
        body
      </Panel>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Service plan' })).toBeInTheDocument();
    expect(screen.getByText('EX-04')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument();
  });

  it('stays a plain card without a title', () => {
    const { container } = render(<Panel>plain</Panel>);
    expect(container.querySelector('header')).toBeNull();
    expect(container.firstElementChild!.className).toMatch(/border-line/);
  });
});

describe('EmptyState', () => {
  it('says what is empty and offers the next step', () => {
    render(<EmptyState title="No alerts today" description="New alerts appear here." action={<button>Open rules</button>} />);
    expect(screen.getByRole('heading', { name: 'No alerts today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open rules' })).toBeInTheDocument();
  });
});
