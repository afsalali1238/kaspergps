'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clocklib from '@/lib/clock';
import { readLanguageCookie, type Language } from '@/lib/language';

import { ANCHOR_MS } from '@/server/seed/data';
import type { Session } from '@/domain/types';
import { FeaturesPanel } from './FeaturesPanel';

// ── Helpers ────────────────────────────────────────────────────────────────────

function roleShort(role: string): string {
  const map: Record<string, string> = {
    kasper_admin: 'Admin',
    kasper_ops: 'Ops',
    tenant_admin: 'Tenant',
    site_user: 'Site',
  };
  return map[role] ?? role;
}

// ── Scenarios ──────────────────────────────────────────────────────────────────

const SCENARIOS = [
  { id: 1, label: 'Omar · No-CAN fleet — only Tier 1 features', user: 'u-omar' },
  { id: 2, label: 'Khalid · EX-04 Engine & fuel (Tier 3)', user: 'u-khalid' },
  { id: 3, label: 'Khalid · GR-01 — fuel used, fuel level not measured', user: 'u-khalid' },
  { id: 4, label: 'Lina · Map — own + rented assets', user: 'u-lina' },
  { id: 13, label: 'Omar · FB-12 share link → revoke', user: 'u-omar' },
  { id: 17, label: 'Ravi · Pair tracker to LD-09', user: 'u-ravi' },
  { id: 20, label: 'Phase → Day one — hide all Phase 2', user: null },
];

function canRunScenario(s: typeof SCENARIOS[0], session: Session | null): boolean {
  if (!session) return false;
  if (s.user && s.user !== session.userId) {
    if (!session.isKasper) return false;
    return true; // Kasper can switch to anyone
  }
  return true;
}

function startScenario(id: number, router: ReturnType<typeof useRouter>, session: Session | null) {
  if (!session) return;
  switch (id) {
    case 1:
    case 4:
    default:
      router.push('/app');
      break;
    case 2:
    case 3:
      router.push('/app/assets/a-ex04');
      break;
    case 13:
      router.push('/app/assets/a-fb12');
      break;
    case 17:
      router.push('/console/trackers');
      break;
    case 20:
      useStore.getState().setDemoSwitches({ phase: 'day_one' });
      router.push('/app');
      break;
  }
}

// ── Jump to presets ────────────────────────────────────────────────────────────

function makePreset(label: string, targetMs: number) {
  return {
    label,
    jump: () => {
      // Absolute target, applied through the store so every screen re-renders
      // with the new simulated time (spec 9: one clock for the whole app).
      useStore.getState().setClockOffsetMs(targetMs - clocklib.getAnchor());
    },
  };
}

function jumpToPresets(): { label: string; jump: () => void }[] {
  const now = clocklib.now();
  const thisMonthStart = clocklib.startOfDubaiMonth(now);
  return [
    makePreset('Now', now),
    makePreset('−1 hour', now - 3600000),
    makePreset('−1 day', now - 86400000),
    makePreset('+1 hour', now + 3600000),
    makePreset('+1 day', now + 86400000),
    makePreset('Start of last month', clocklib.startOfDubaiMonth(thisMonthStart - 1)),
    makePreset('End of last month', thisMonthStart - 60000),
    makePreset('FB-12 link expires (7 Oct 00:00)', ANCHOR_MS + 14 * 3600000),
    makePreset('EX-07 rental starts (7 Oct 08:00)', ANCHOR_MS + 22 * 3600000),
  ];
}

// ── Tools ──────────────────────────────────────────────────────────────────────

function toolsItems(): { label: string; desc: string; href?: string }[] {
  return [
    { label: '/dev/ui', desc: 'UI kit showcase', href: '/dev/ui' },
    { label: '/dev/seed', desc: 'Seed data tables', href: '/dev/seed' },
    { label: '/dev/access', desc: 'Access explorer', href: '/dev/access' },
    { label: '/dev/bookings', desc: 'Booking simulator', href: '/dev/bookings' },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemoBar() {
  const router = useRouter();
  const session = useStore.getState().session;

  // Read straight from the cookie and re-read whenever it changes: DemoBar sits
  // outside LanguageProvider, and the language toggle is on the customer screens.
  const [demoLanguage, setDemoLanguage] = useState<Language>('en');
  useEffect(() => {
    const read = () => setDemoLanguage(readLanguageCookie());
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    const poll = window.setInterval(read, 1000); // the toggle itself is on the screens below
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
      window.clearInterval(poll);
    };
  }, []);
  const demoDir = demoLanguage === 'ar' ? 'rtl' : 'ltr';

  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.demoSwitches) useStore.getState().setDemoSwitches(data.demoSwitches);
        if (data.clockOffsetMs != null) useStore.getState().setClockOffsetMs(data.clockOffsetMs);
        if (data.session) useStore.getState().setSession(data.session);
      } catch (err) {
        console.error('Invalid demo state file:', err);
      }
    };
    reader.readAsText(file);
    setToolsOpen(false);
  };

  const [searchQuery, setSearchQuery] = useState('');

  const gs = useStore.getState;
  const phase = gs().demoSwitches.phase;
  const showHidden = gs().demoSwitches.showHidden;
  const salesView = gs().demoSwitches.salesView;

  const activeSession = session;

  // Group users by company
  const usersByCompany = [
    { name: 'Kasper', users: seed.users.filter(u => u.role === 'kasper_admin' || u.role === 'kasper_ops') },
    { name: 'Al Noor Transport', users: seed.users.filter(u => u.tenantId === 't-alnoor') },
    { name: 'Emirates Earthmovers', users: seed.users.filter(u => u.tenantId === 't-emirates') },
    { name: 'Gulf Lift Rentals', users: seed.users.filter(u => u.tenantId === 't-gulflift') },
    { name: 'Marina Builders', users: seed.users.filter(u => u.tenantId === 't-marina') },
    { name: 'Palm Contracting', users: seed.users.filter(u => u.tenantId === 't-palm') },
  ].filter(g => g.users.length > 0);

  const filteredUsers = usersByCompany
    .map(g => ({
      ...g,
      users: g.users.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter(g => g.users.length > 0);

  const currentTimeStr = clocklib.formatDubaiTime(clocklib.now());
  const currentDateStr = clocklib.formatDubaiDate(clocklib.now());

  const selectUser = useCallback((userId: string) => {
    const user = seed.users.find(u => u.id === userId);
    if (!user) return;
    // Build a session for this user
    const newSession: Session = {
      userId: user.id,
      user,
      tenantId: user.tenantId,
      siteIds: user.siteIds,
      role: user.role,
      isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
    };
    useStore.getState().setSession(newSession);
    setViewAsOpen(false);
    if (user.role === 'kasper_admin' || user.role === 'kasper_ops') {
      router.replace('/console');
    } else {
      router.replace('/app');
    }
  }, [router]);

  return (
    <div
      dir={demoDir}
      className="demo-bar fixed top-0 left-0 right-0 z-50 px-3 py-2 flex items-center gap-2 overflow-x-auto"
      style={{ height: '36px' }}
    >
      {/* The demo bar sits outside the shell, so it mirrors itself. It stays in
          English except for a small tag when the demo language is Arabic. */}
      {demoLanguage === 'ar' && (
        <span className="flex-shrink-0 text-[9px] text-paper/60 border border-paper/20 rounded px-1">
          عربي
        </span>
      )}
      {/* DEMO tag */}
      <span className="demo-tag flex-shrink-0 text-[9px]">DEMO</span>

      {/* View as dropdown */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setViewAsOpen(!viewAsOpen)}
          className="flex items-center gap-1.5 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors whitespace-nowrap border border-[#2a2c30]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-paper/60">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {activeSession ? (
            <span className="truncate max-w-[120px]">
              {activeSession.user.name} · {roleShort(activeSession.user.role)}
            </span>
          ) : (
            <span className="text-paper/70">View as</span>
          )}
        </button>

        {viewAsOpen && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-[#2a2c30]">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search users…"
                className="w-full px-2.5 py-1.5 text-xs bg-[#22242a] text-paper border border-[#2a2c30] rounded-lg focus:outline-none focus:border-yellow placeholder:text-paper/40"
                autoFocus
              />
            </div>
            {/* Users */}
            <div className="max-h-80 overflow-y-auto">
              {filteredUsers.map(group => (
                <div key={group.name} className="border-b border-[#2a2c30]">
                  <div className="px-3 py-1.5 text-[10px] text-paper/50 font-mono uppercase tracking-wider">{group.name}</div>
                  {group.users.map(user => (
                    <button
                      key={user.id}
                      onClick={() => selectUser(user.id)}
                      className={clsx(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center justify-between gap-2',
                        user.id === activeSession?.userId && 'bg-yellow/10 text-yellow',
                        user.status === 'deactivated' && 'opacity-50',
                        user.status === 'invited' && 'bg-blue-500/10'
                      )}
                    >
                      <span className="truncate">
                        <span className="text-paper/90">{user.name}</span>
                      </span>
                      <span className="text-paper/50 flex-shrink-0">
                        {roleShort(user.role)}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Phase switch */}
      <div className="flex-shrink-0 flex items-center bg-[#1a1b20] border border-[#2a2c30] rounded-lg overflow-hidden">
        {(['day_one', 'phase2', 'later'] as const).map(p => (
          <button
            key={p}
            onClick={() => useStore.getState().setDemoSwitches({ phase: p })}
            className={clsx(
              'px-2 py-1 text-[10px] font-mono transition-colors',
              phase === p
                ? 'bg-yellow/10 text-yellow border-r border-yellow-dark/40'
                : 'bg-transparent text-paper/60 hover:text-paper'
            )}
          >
            {p === 'day_one' ? 'Day 1' : p === 'phase2' ? 'Phase 2' : 'Later'}
          </button>
        ))}
      </div>

      {/* Show hidden */}
      <button
        onClick={() => useStore.getState().setDemoSwitches({ showHidden: !showHidden })}
        className={clsx(
          'flex-shrink-0 px-2 py-1 text-[10px] font-mono rounded-lg border transition-colors',
          showHidden
            ? 'bg-yellow/10 text-yellow border-yellow-dark/40'
            : 'bg-[#1a1b20] text-paper/60 border-[#2a2c30] hover:text-paper'
        )}
      >
        {showHidden ? 'Show hidden: ON' : 'Show hidden: OFF'}
      </button>

      {/* Sales view */}
      <button
        onClick={() => useStore.getState().setDemoSwitches({ salesView: !salesView })}
        className={clsx(
          'flex-shrink-0 px-2 py-1 text-[10px] font-mono rounded-lg border transition-colors',
          salesView
            ? 'bg-[#1a1b20] text-paper border-[#2a2c30]'
            : 'bg-[#1a1b20] text-paper/60 border-[#2a2c30] hover:text-paper'
        )}
      >
        Sales view: {salesView ? 'ON' : 'OFF'}
      </button>

      {/* Features button */}
      <button
        onClick={() => setFeaturesOpen(!featuresOpen)}
        className="flex-shrink-0 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="mr-1 text-paper/60">
          <path d="M5 1a4 4 0 100 8 4 4 0 000-8zM2 8l3-3 3 3M2 5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Features
      </button>

      {/* Features panel */}
      {featuresOpen && <FeaturesPanel />}

      {/* Scenarios dropdown */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setScenariosOpen(!scenariosOpen)}
          className="flex-shrink-0 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="mr-1 text-paper/60">
            <path d="M5 1a4 4 0 100 8 4 4 0 000-8zM2 7l3-3 3 3M2 4h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Scenarios
        </button>
        {scenariosOpen && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
            <div className="p-2 border-b border-[#2a2c30]">
              <div className="text-[10px] text-paper/50 font-mono">Guided walkthroughs</div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
              {SCENARIOS.filter(s => canRunScenario(s, activeSession)).map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    startScenario(s.id, router, activeSession);
                    setScenariosOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                  <span className="text-yellow/80 font-medium">S{s.id}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Clock dropdown */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setClockOpen(!clockOpen)}
          className="flex items-center gap-1.5 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors whitespace-nowrap border border-[#2a2c30]"
          title="Simulated clock (Dubai)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-paper/60">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 3v2.2l1.6 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {currentTimeStr} · {currentDateStr}
        </button>
        {clockOpen && (
          <div className="absolute top-full right-0 mt-1 w-72 bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
            <div className="p-2 border-b border-[#2a2c30]">
              <div className="text-[10px] text-paper/50 font-mono">Simulated clock · Dubai</div>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
              {jumpToPresets().map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    preset.jump();
                    setClockOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="border-t border-[#2a2c30] p-2 flex flex-wrap gap-1">
              <ClockButton label="−1h" onClick={() => useStore.getState().setClockOffsetMs(clocklib.getOffsetMs() - 3600000)} />
              <ClockButton label="−1d" onClick={() => useStore.getState().setClockOffsetMs(clocklib.getOffsetMs() - 86400000)} />
              <ClockButton label="+1h" onClick={() => useStore.getState().setClockOffsetMs(clocklib.getOffsetMs() + 3600000)} />
              <ClockButton label="+1d" onClick={() => useStore.getState().setClockOffsetMs(clocklib.getOffsetMs() + 86400000)} />
              <ClockButton
                label="Reset"
                isReset
                onClick={() => {
                  clocklib.resetOffset();
                  useStore.getState().resetClock();
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tools dropdown */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setToolsOpen(!toolsOpen)}
          className="flex-shrink-0 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="mr-1 text-paper/60">
            <path d="M3 2l5 5-5 5M3 6l4 4M2 3a1 1 0 100 2 1 1 0 000-2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Tools
        </button>
        {toolsOpen && (
          <div className="absolute top-full right-0 mt-1 w-60 bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
            <div className="p-2 border-b border-[#2a2c30]">
              <div className="text-[10px] text-paper/50 font-mono">Developer tools</div>
            </div>
            <div className="max-h-60 overflow-y-auto p-2 space-y-0.5">
              {toolsItems().map(tool => (
                <button
                  key={tool.label}
                  onClick={() => {
                    if (tool.href) router.push(tool.href);
                    setToolsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 transition-colors"
                >
                  <span className="text-yellow/80 font-mono">{tool.label}</span>
                  <span className="text-paper/50 ml-2">{tool.desc}</span>
                </button>
              ))}
              <div className="border-t border-[#2a2c30] pt-1 mt-1">
                <button
                  onClick={() => {
                    if (window.confirm('Reset all demo data to the seed?')) {
                      clocklib.resetOffset();
                      useStore.getState().resetClock();
                      setToolsOpen(false);
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red/80 hover:bg-red/10 transition-colors"
                >
                  Reset demo data
                </button>
                <button
                  onClick={() => {
                    const state = useStore.getState();
                    const blob = new Blob([JSON.stringify({
                      demoSwitches: state.demoSwitches,
                      clockOffsetMs: state.clockOffsetMs,
                      session: state.session,
                    }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `kasper-demo-state-${clocklib.formatDubaiDate(clocklib.now()).replace(/ /g, '-')}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setToolsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 transition-colors"
                >
                  Export demo state (JSON)
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 transition-colors"
                >
                  Import demo state (JSON)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prototype label */}
      <span className="flex-shrink-0 text-[9px] text-paper/40 font-mono ml-auto hidden lg:inline">
        Prototype · dummy data
      </span>
    </div>
  );
}

// ── Clock button sub-component ──────────────────────────────────────────────────

function ClockButton({ label, onClick, isReset }: { label: string; onClick: () => void; isReset?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2 py-1 text-[10px] font-mono rounded hover:bg-white/5 transition-colors border border-[#2a2c30]',
        isReset ? 'bg-yellow/10 text-yellow border-yellow-dark/40' : 'bg-[#22242a] text-paper'
      )}
    >
      {label}
    </button>
  );
}
