'use client';

// Language switch used in the customer user menu and in the demo bar.
// The demo-bar copy is always English (the bar is prototype tooling) so
// reviewers can flip Arabic on the public tracking/verify pages without
// signing in. Console and /dev stay English — switchLocale still writes
// the cookie so the next customer screen comes up in Arabic.

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocaleSwitch, useT } from '@/i18n';

export function LanguageToggle({ variant }: { variant: 'demo' | 'menu' }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { locale, href, switchLocale } = useLocaleSwitch();

  const onClick = () => {
    switchLocale();
    if (href !== (pathname ?? '')) {
      router.push(href);
    } else {
      router.refresh();
    }
  };

  if (variant === 'demo') {
    return (
      <button
        type="button"
        aria-label="Language"
        onClick={onClick}
        className="flex-shrink-0 px-2 py-1 text-[10px] font-mono rounded-lg border border-[#2a2c30] bg-[#1a1b20] text-paper hover:text-yellow hover:border-yellow-dark/40 transition-colors whitespace-nowrap"
      >
        {locale === 'ar' ? 'EN' : 'عربي'}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={t('shell.language', 'Language')}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-grey-700 hover:bg-paper-2 transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1" />
        <path
          d="M7 1v2M7 11v2M1 7h2M11 7h2M3.5 3.5l1.5 1.5M9.5 9.5l1.5 1.5M3.5 10.5l1.5-1.5M9.5 4.5l1.5-1.5"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
      {t('shell.language', 'Language')}
      <span className="ms-auto text-xs text-grey-500">
        {locale === 'ar' ? 'عربي / EN' : 'EN / عربي'}
      </span>
    </button>
  );
}
