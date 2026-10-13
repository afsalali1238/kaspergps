'use client';

// useFocusTrap — keeps Tab inside an open dialog, closes on Esc, and hands
// focus back to whatever opened it. Shared by SideSheet, BottomSheet and
// ConfirmDialog.

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('data-focus-skip'));
}

interface Options {
  /** Element to focus first; defaults to the first focusable element. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Lock page scroll while open (default true). */
  lockScroll?: boolean;
}

export function useFocusTrap<T extends HTMLElement>(open: boolean, onClose: () => void, options: Options = {}) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const { initialFocus, lockScroll = true } = options;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = initialFocus?.current ?? focusableIn(root)[0] ?? root;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = focusableIn(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === head || !root.contains(active))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (active === tail || !root.contains(active))) {
        e.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, initialFocus, lockScroll]);

  return ref;
}
