'use client';

import React from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'yellow';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-[#1a1b20] active:scale-[0.98]',
  secondary: 'bg-paper-2 text-ink border border-line hover:bg-paper hover:border-grey-500 active:scale-[0.98]',
  ghost: 'bg-transparent text-grey-700 hover:bg-paper-2 hover:text-ink',
  danger: 'bg-red text-white hover:bg-[#b83a3a] active:scale-[0.98]',
  yellow: 'bg-yellow text-ink hover:bg-[#e6b800] active:scale-[0.98]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1.5 rounded-md gap-1.5',
  md: 'text-sm px-3.5 py-2 rounded-lg gap-2 font-medium',
  lg: 'text-base px-5 py-2.5 rounded-lg gap-2 font-medium',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-medium cursor-pointer select-none transition-all',
        'focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.1 0 2 3.1 2 8h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
