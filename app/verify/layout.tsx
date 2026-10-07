import type { Metadata } from 'next';
import React from 'react';

// Public verify page: no app shell, noindex.
export const metadata: Metadata = {
  title: 'Verify a certificate — Kasper GPS',
  description: 'Check a Monthly Utilisation Certificate issued by Kasper GPS',
  robots: { index: false, follow: false },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
