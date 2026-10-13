import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { SideSheet } from './SideSheet';
import { BottomSheet } from './BottomSheet';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ kind }: { kind: 'side' | 'bottom' }) {
  const [open, setOpen] = useState(false);
  const Sheet = kind === 'side' ? SideSheet : BottomSheet;
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="EX-04" footer={<button>Apply</button>}>
        <a href="#x">First link</a>
      </Sheet>
    </>
  );
}

describe.each(['side', 'bottom'] as const)('%s sheet', kind => {
  it('is a labelled modal dialog that traps focus', () => {
    render(<Harness kind={kind} />);
    const opener = screen.getByText('Open');
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'EX-04' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const items = [screen.getByText('First link'), screen.getByText('Apply'), screen.getByRole('button', { name: 'Close' })];
    // Focus lands inside the sheet.
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Tab from the last focusable wraps to the first; Shift+Tab from the first wraps to the last.
    const order = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
    order[order.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(order[0]);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(order[order.length - 1]);
    expect(items.every(el => dialog.contains(el))).toBe(true);
  });

  it('closes on Esc and returns focus to the opener', () => {
    render(<Harness kind={kind} />);
    const opener = screen.getByText('Open');
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes from the × button and the backdrop', () => {
    render(<Harness kind={kind} />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('locks page scroll while open', () => {
    render(<Harness kind={kind} />);
    fireEvent.click(screen.getByText('Open'));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });
});

describe('ConfirmDialog', () => {
  it('starts on Cancel, and Esc cancels', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="End access for Lina?" body="She loses the map at once." onConfirm={onConfirm} onCancel={onCancel} destructive confirmLabel="End access" />);
    const dialog = screen.getByRole('alertdialog', { name: 'End access for Lina?' });
    expect(dialog).toHaveAccessibleDescription('She loses the map at once.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms with the destructive button', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Void?" onConfirm={onConfirm} onCancel={() => {}} destructive confirmLabel="Void certificate" />);
    const confirm = screen.getByRole('button', { name: 'Void certificate' });
    expect(confirm.className).toMatch(/bg-bad-ink/);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('waits for an async confirm before it can be pressed again', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    render(<ConfirmDialog open title="Send?" onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    resolve();
    await vi.waitFor(() => expect(confirm).not.toBeDisabled());
  });

  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="x" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
