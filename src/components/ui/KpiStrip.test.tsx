import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n';
import { KpiCell, KpiStrip } from './KpiStrip';
import { MetricTile } from './MetricTile';

describe('KpiStrip and KpiCell', () => {
  it('shows label, value, context and source', () => {
    render(
      <KpiStrip label="Alerts summary">
        <KpiCell label="Critical" value="3" tone="bad" context="since 06:00" source="From alerts" />
      </KpiStrip>
    );
    expect(screen.getByRole('group', { name: 'Alerts summary' })).toBeInTheDocument();
    expect(screen.getByText('3').className).toMatch(/text-bad-ink/);
    expect(screen.getByText('since 06:00')).toBeInTheDocument();
    expect(screen.getByText('Source: From alerts')).toBeInTheDocument();
  });

  it('reads "Not measured" for a missing value and hides the source', () => {
    render(<KpiCell label="Fuel used today" value={null} source="ECU" />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText(/Source:/)).toBeNull();
  });

  it('keeps a real zero (zero is a measurement)', () => {
    render(<KpiCell label="Offline" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Not measured')).toBeNull();
  });

  it('is a toggle button when clickable', () => {
    const onClick = vi.fn();
    render(<KpiCell label="Warning" value="2" onClick={onClick} active />);
    const btn = screen.getByRole('button', { name: /Warning/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is not a button when it does nothing', () => {
    render(<KpiCell label="Formats" value="3" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('scrolls inside itself instead of widening the page', () => {
    render(<KpiStrip label="x"><KpiCell label="a" value="1" /></KpiStrip>);
    expect(screen.getByTestId('kpi-strip').className).toMatch(/overflow-x-auto/);
  });

  it('translates "Not measured" and the source line in Arabic', () => {
    render(
      <LocaleProvider locale="ar">
        <KpiCell label="x" value={null} />
        <KpiCell label="y" value="4" source="ECU" />
      </LocaleProvider>
    );
    expect(screen.queryByText('Not measured')).toBeNull();
    expect(screen.getByText(/ECU/).textContent).not.toMatch(/^Source/);
  });
});

describe('MetricTile', () => {
  it('shows value, unit and source', () => {
    render(<MetricTile label="Engine hours" value="1,284" unit="h" source="ECU" />);
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('h')).toBeInTheDocument();
    expect(screen.getByText('Source: ECU')).toBeInTheDocument();
  });

  it('reads "Not measured" without a value', () => {
    render(<MetricTile label="Fuel level" value={undefined} unit="%" source="ECU" />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText('%')).toBeNull();
    expect(screen.queryByText(/Source/)).toBeNull();
  });
});
