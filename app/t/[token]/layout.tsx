import type { Metadata } from 'next';

// The public tracking page is never indexed and never leaks a referrer (spec 11.6).
// Metadata lives in the layout because the page itself is a client component.
export const metadata: Metadata = {
  title: 'Track your asset — Kasper GPS',
  description: 'Live GPS tracking for your rental equipment',
  robots: { index: false, follow: false },
  other: { referrer: 'no-referrer' },
};

export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
