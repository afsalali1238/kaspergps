'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import clsx from 'clsx';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, variant }]);
    setTimeout(() => {
      setToasts(t => t.filter(toast => toast.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(t => t.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-green/10', border: 'border-green/30', icon: 'text-green' },
  error: { bg: 'bg-red/10', border: 'border-red/30', icon: 'text-red' },
  info: { bg: 'bg-paper border-line', border: 'border-line', icon: 'text-grey-700' },
  warning: { bg: 'bg-amber/10', border: 'border-amber/30', icon: 'text-amber-dark' },
};

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => {
        const style = variantStyles[t.variant];
        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg border shadow-lg text-sm font-medium',
              style.bg,
              style.border,
              'animate-in fade-in slide-in-from-bottom-2',
              'max-w-sm text-center'
            )}
          >
            <span className={clsx('w-4 h-4 rounded-full flex items-center justify-center', style.icon)}>
              {t.variant === 'success' && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6l2.5 2.5L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {t.variant === 'error' && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v6M6 10v0M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {t.variant === 'info' && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 4v3M6 8h0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {t.variant === 'warning' && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2l4 7H2l4-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </span>
            {t.message}
            <button
              onClick={() => removeToast(t.id)}
              className="ml-1 text-grey-500 hover:text-ink transition-colors"
              aria-label="Dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
