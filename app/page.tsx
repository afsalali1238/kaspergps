'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/hooks';

export default function RootPage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session) {
      if (session.isKasper) {
        router.replace('/console');
      } else {
        router.replace('/app');
      }
    } else {
      router.replace('/sign-in');
    }
  }, [router, session]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="8" fill="#141518" />
          <text x="0" y="28" fontSize="22" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
        </svg>
        <span className="text-sm text-grey-500 font-mono">Kasper GPS</span>
      </div>
    </div>
  );
}
