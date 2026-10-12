import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Table } from './Table';
import { RowMenu } from './RowMenu';

type Row = { id: string; code: string; hours: string };
const rows: Row[] = [
  { id: 'a', code: 'EX-04', hours: '1,284' },
  { id: 'b', code: 'BD-02', hours: '96' },
];

describe('Table', () => {
  it('has a sticky header, a caption and end-aligned mono numbers', () => {
    render(
      <Table<Row>
        caption="Engine hours"
        keyField="id"
        rows={rows}
        columns={[
          { key: 'code', header: 'Asset', mono: true, render: r => r.code },
          { key: 'hours', header: 'Hours', numeric: true, render: r => r.hours },
        ]}
      />
    );
    const table = screen.getByRole('table', { name: 'Engine hours' });
    expect(table.querySelector('thead')!.className).toMatch(/sticky/);
    const cell = screen.getByText('1,284');
    expect(cell.className).toMatch(/text-end/);
    expect(cell.className).toMatch(/font-mono/);
    expect(cell.className).toMatch(/tabular-nums/);
    expect(screen.getByRole('columnheader', { name: 'Hours' }).className).toMatch(/text-end/);
  });

  it('can turn the sticky header off', () => {
    render(<Table<Row> stickyHeader={false} keyField="id" rows={rows} columns={[{ key: 'c', header: 'C', render: r => r.code }]} />);
    expect(screen.getByRole('table').querySelector('thead')!.className).not.toMatch(/sticky/);
  });

  it('shows the empty message', () => {
    render(<Table<Row> keyField="id" rows={[]} emptyMessage="No assets" columns={[]} />);
    expect(screen.getByText('No assets')).toBeInTheDocument();
  });

  it('defaults the empty message', () => {
    render(<Table<Row> keyField="id" rows={[]} columns={[]} />);
    expect(screen.getByText('No items yet')).toBeInTheDocument();
  });

  it('adds a ⋯ menu per row, only where the row has actions', () => {
    const onSelect = vi.fn();
    const onRowClick = vi.fn();
    render(
      <Table<Row>
        keyField="id"
        rows={rows}
        onRowClick={onRowClick}
        columns={[{ key: 'c', header: 'Asset', render: r => r.code }]}
        rowMenu={r => (r.id === 'a' ? [{ id: 'log', label: 'Log service', onSelect }] : [])}
        rowMenuLabel={r => `Actions for ${r.code}`}
      />
    );
    expect(screen.queryByRole('button', { name: 'Actions for BD-02' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for EX-04' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log service' }));
    expect(onSelect).toHaveBeenCalledOnce();
    // Opening the menu must not also open the row.
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('calls onRowClick for a row click', () => {
    const onRowClick = vi.fn();
    render(<Table<Row> keyField="id" rows={rows} onRowClick={onRowClick} columns={[{ key: 'c', header: 'C', render: r => r.code }]} />);
    fireEvent.click(screen.getByText('BD-02'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });
});

describe('RowMenu', () => {
  const items = [
    { id: 'view', label: 'View', onSelect: vi.fn() },
    { id: 'void', label: 'Void', onSelect: vi.fn(), destructive: true },
  ];

  it('opens, moves with arrows, and closes on Esc back to the button', () => {
    render(<RowMenu items={items} label="Actions for C-1" />);
    const button = screen.getByRole('button', { name: 'Actions for C-1' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(button);
    const menu = screen.getByRole('menu');
    const [view, voidItem] = within(menu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(view);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(voidItem);
    expect(voidItem.className).toMatch(/text-bad-ink/);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(view);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(voidItem);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes on a click outside', () => {
    render(<div><RowMenu items={items} /><p>outside</p></div>);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens from the keyboard with ArrowDown', () => {
    render(<RowMenu items={items} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('renders nothing when the user has no actions', () => {
    const { container } = render(<RowMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
