'use client';

import React, { useEffect, useCallback } from 'react';
import clsx from 'clsx';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  position?: 'right' | 'left' | 'bottom';
  children: React.ReactNode;
  closeOnOverlay?: boolean;
  showClose?: boolean;
  className?: string;
}

const widthStyles = {
  sm: 'w-[360px]',
  md: 'w-[480px]',
  lg: 'w-[640px]',
  xl: 'w-full max-w-2xl',
};

export function Sheet({
  open,
  onClose,
  title,
  width = 'md',
  position = 'right',
  children,
  closeOnOverlay = true,
  showClose = true,
  className = '',
}: SheetProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const isRight = position === 'right';
  const isLeft = position === 'left';
  const isBottom = position === 'bottom';

  return (
    <div className="fixed inset-0 z-50 flex" onClick={closeOnOverlay ? onClose : undefined}>
      {/* Overlay for right/left */}
      {!isBottom && (
        <div className={clsx('flex-1 bg-ink/30 backdrop-blur-sm transition-opacity', open && 'opacity-100')} />
      )}

      {/* Sheet panel */}
      <div
        className={clsx(
          'relative flex flex-col bg-surface shadow-2xl',
          widthStyles[width],
          isRight ? 'flex-shrink-0 ml-auto transition-transform duration-200' : '',
          isLeft ? 'flex-shrink-0 mr-auto transition-transform duration-200' : '',
          isBottom ? 'flex-shrink-0 mx-auto mt-16 w-full max-w-lg transition-transform duration-200' : '',
          open ? (isRight ? 'translate-x-0' : isLeft ? 'translate-x-0' : 'translate-y-0') : '',
          className
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
            {title && (
              <h2 className="text-base font-semibold text-ink">{title}</h2>
            )}
            {showClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-paper-2 text-grey-500 hover:text-ink transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
