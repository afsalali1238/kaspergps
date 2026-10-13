'use client';

// The home page (chunk R, owner decision 13 Oct): a login page where you pick a
// role. Each card is a persona (src/config/personas.ts) that signs in as one
// seeded account and lands on that role's home. No names, emails or passwords.
// A signed-in visitor sees a slim "Continue as …" bar, the only shortcut.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useDb, signInAs, fb12PublicPath } from '@/server/api';
import { storeActions, useSession } from '@/hooks';
import { useT } from '@/i18n';
import type { Session } from '@/domain/types';
import {
  CHIP_LABELS,
  HIRER_PERSONA,
  PERSONAS,
  PERSONA_GROUPS,
  personaForUser,
  type Persona,
  type PersonaChip,
} from '@/config/personas';

/** Where a signed-in role lands: the console for Kasper staff, the app for everyone else. */
export function homeFor(session: Session): string {
  return session.isKasper ? '/console' : '/app';
}

export function RolePicker() {
  const t = useT();
  const router = useRouter();
  const session = useSession();
  const users = useDb(s => s.users);
  const tenants = useDb(s => s.tenants);
  const [error, setError] = useState<string | null>(null);

  // The company name shown small on each card, as the screens show it in the top bar.
  const companyName = (userId: string): string => {
    const user = users.find(x => x.id === userId);
    if (!user) return '';
    if (user.tenantId === null) return 'Kasper';
    return tenants.find(x => x.id === user.tenantId)?.name ?? '';
  };

  const pick = (persona: Persona) => {
    setError(null);
    if (persona.userId === undefined) {
      // The outside hirer has no account: the tracking page opens with no session.
      storeActions.setWalkthrough(null);
      storeActions.setSession(null);
      const path = fb12PublicPath();
      if (path) router.push(path);
      return;
    }
    const result = signInAs(persona.userId);
    if (!result.success || !result.data) {
      setError(result.error ?? t('sign_in.errors.failed', 'Sign in failed.'));
      return;
    }
    storeActions.setWalkthrough(null);
    storeActions.setSession(result.data.session);
    // Every role starts at the seeded day, so the same steps give the same screens.
    storeActions.resetClock();
    router.replace(homeFor(result.data.session));
  };

  // The demo bar is not shown on this page, so the space it reserves at the top goes too.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--demo-bar-h', '0px');
    return () => {
      root.style.removeProperty('--demo-bar-h');
    };
  }, []);

  const current = session ? personaForUser(session.userId) : undefined;
  const continueTitle = current ? t(current.titleKey, current.title) : t('roles.continue_scenario', 'Scenario user');

  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <header className="bg-ink text-paper flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <rect width="20" height="20" rx="4" className="fill-yellow" />
            <text x="0" y="15" fontSize="13" fontFamily="monospace" className="fill-ink" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold text-paper">Kasper</span>
        </div>
        <span className="text-[10px] font-mono text-grey-500 bg-paper/10 px-2 py-0.5 rounded">DEMO</span>
      </header>

      <div className="flex-1 px-4 py-8">
        <div className="w-full max-w-[880px] mx-auto">
          <h1 className="text-xl font-semibold text-ink mb-1">{t('roles.title', 'Choose a role to explore')}</h1>
          <p className="text-sm text-grey-500 mb-6">
            {t('roles.lead', 'Prototype with dummy data. Log out any time to try another role.')}
          </p>

          {session && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="text-sm text-ink">
                {t('roles.continue_as', 'Continue as {role}', { role: continueTitle })}
              </span>
              <button
                type="button"
                onClick={() => router.replace(homeFor(session))}
                className="min-h-[48px] inline-flex items-center gap-1 text-sm font-medium text-ink underline underline-offset-4 px-2"
              >
                {t('roles.continue', 'Continue')} <ChevronRight size={14} aria-hidden className="rtl:rotate-180" />
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mb-4 text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {PERSONA_GROUPS.map(group => {
            const cards = group.key === 'public' ? [HIRER_PERSONA] : PERSONAS.filter(p => p.group === group.key);
            if (cards.length === 0) return null;
            return (
              <section key={group.key} aria-labelledby={`group-${group.key}`} className="mb-6">
                <h2 id={`group-${group.key}`} className="text-[10px] font-mono uppercase tracking-wider text-grey-500 mb-2">
                  {t(group.labelKey, group.label)}
                </h2>
                <ul className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2">
                  {cards.map(persona => (
                    <li key={persona.id}>
                      <button
                        type="button"
                        onClick={() => pick(persona)}
                        data-persona={persona.id}
                        className="group w-full min-h-[48px] text-start bg-surface border border-line rounded-lg px-4 py-3 hover:border-ink focus-visible:outline-2 focus-visible:outline-yellow transition-colors"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-heading text-[15px] font-semibold text-ink">
                            {t(persona.titleKey, persona.title)}
                          </span>
                          <ChevronRight size={16} aria-hidden className="mt-0.5 shrink-0 text-grey-500 group-hover:text-ink rtl:rotate-180" />
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {persona.chips.map(chip => (
                            <ChipBadge key={chip} chip={chip} label={t(CHIP_LABELS[chip].key, CHIP_LABELS[chip].label)} />
                          ))}
                        </span>
                        <span className="mt-2 block text-sm text-grey-700">{t(persona.blurbKey, persona.blurb)}</span>
                        {persona.userId && companyName(persona.userId) && (
                          <span className="mt-2 block font-mono text-[10px] text-grey-500">{companyName(persona.userId)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function ChipBadge({ chip, label }: { chip: PersonaChip; label: string }) {
  if (chip === 'kasper') {
    return <span className="inline-flex items-center rounded bg-ink px-1.5 py-px text-[10px] font-mono text-paper">{label}</span>;
  }
  return <Badge tone={CHIP_LABELS[chip].tone} className={clsx('text-[10px]')}>{label}</Badge>;
}
