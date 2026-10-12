// B3: top navigation tabs (owner decision, 13 Oct: top bar like fleetx, no sidebar).
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TopTabs, type TopTab } from './TopTabs';

const tabs = (n: number, active = 0): TopTab[] =>
  Array.from({ length: n }, (_, i) => ({ href: `/p${i}`, label: `Page ${i}`, icon: null, active: i === active }));

describe('TopTabs', () => {
  it('marks only the active tab as the current page', () => {
    render(<TopTabs label="Pages" moreLabel="More" tabs={tabs(3, 1)} />);
    const nav = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(nav).getByRole('link', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Page 0' })).not.toHaveAttribute('aria-current');
  });

  it('has no More button when every tab fits', () => {
    render(<TopTabs label="Pages" moreLabel="More" tabs={tabs(4)} />);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('lists every tab under More when opened, and Escape closes it', () => {
    render(<TopTabs label="Pages" moreLabel="More" tabs={tabs(9, 8)} />);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    const group = screen.getByRole('group', { name: 'More' });
    expect(within(group).getAllByRole('link')).toHaveLength(9);
    expect(within(group).getByRole('link', { name: 'Page 8' })).toHaveAttribute('aria-current', 'page');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
  });

  it('keeps the first 4 tabs in the bar at every desktop width, and the 8th only under More', () => {
    render(<TopTabs label="Pages" moreLabel="More" tabs={tabs(9)} />);
    const nav = screen.getByRole('navigation', { name: 'Pages' });
    const bar = within(nav).getAllByRole('link');
    expect(bar[0].className).toMatch(/(^| )flex( |$)/);
    expect(bar[3].className).not.toMatch(/hidden/);
    expect(bar[7].className).toMatch(/(^| )hidden( |$)/);
    expect(bar[7].className).not.toMatch(/:flex/);
  });
});
