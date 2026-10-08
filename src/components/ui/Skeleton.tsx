'use client';

import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export function Skeleton({ className = '', width, height, borderRadius }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-line rounded',
        className
      )}
      style={{
        width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : '100%',
        height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : '1em',
        borderRadius: borderRadius !== undefined ? (typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius) : '4px',
      }}
    />
  );
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={clsx('p-4 border border-line bg-surface rounded-xl', className)}>
      <div className="flex items-center gap-3 mb-3">
        <Skeleton width={40} height={40} borderRadius={8} />
        <div className="flex-1 space-y-1.5">
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={12} />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton width="100%" height={10} />
        <Skeleton width="75%" height={10} />
        <Skeleton width="50%" height={10} />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 py-2">
          <Skeleton width={32} height={32} borderRadius={6} />
          <div className="flex-1 space-y-1">
            <Skeleton width="70%" height={12} />
            <Skeleton width="40%" height={10} />
          </div>
          <Skeleton width={80} height={20} borderRadius={4} />
        </div>
      ))}
    </div>
  );
}
