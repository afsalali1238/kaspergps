'use client';

// CopyButton — copies a value (IMEI, SIM, tracking link) to the clipboard and
// says so (A10).
//
//   <span className="font-mono">{tracker.imei}</span>
//   <CopyButton value={tracker.imei} label={`Copy IMEI ${tracker.imei}`} />
//
// The result is announced through a polite live region. If the browser blocks
// the clipboard, it reads "Copy failed" instead of pretending it worked.

import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import { useT } from '@/i18n';
import { focusRing } from './tones';

interface CopyButtonProps {
  value: string;
  /** Accessible name, e.g. "Copy IMEI". Defaults to "Copy". */
  label?: string;
  /** Show the word next to the icon (default: icon only). */
  showText?: boolean;
  className?: string;
}

type State = 'idle' | 'copied' | 'failed';

const RESET_MS = 1600;

export function CopyButton({ value, label, showText = false, className = '' }: CopyButtonProps) {
  const t = useT();
  const [state, setState] = useState<State>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), RESET_MS);
  };

  const word =
    state === 'copied' ? t('ui.copied', 'Copied') : state === 'failed' ? t('ui.copy_failed', 'Copy failed') : t('ui.copy', 'Copy');

  return (
    <>
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? t('ui.copy', 'Copy')}
      className={clsx(
        'inline-flex min-h-10 min-w-10 sm:min-h-8 sm:min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs transition-colors hover:bg-surface-2',
        state === 'copied' ? 'text-ok-ink' : state === 'failed' ? 'text-bad-ink' : 'text-slate hover:text-ink',
        focusRing,
        className
      )}
      data-state={state}
    >
      {state === 'copied' ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
      {showText && <span>{word}</span>}
    </button>
    <span className="sr-only" role="status" aria-live="polite">
      {state === 'idle' ? '' : word}
    </span>
    </>
  );
}
