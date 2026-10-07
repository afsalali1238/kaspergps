'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clocklib from '@/lib/clock';

import { ANCHOR_MS } from '@/server/seed/data';
import { tamperWithMuc } from '@/server/muc';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { resolveEtaForLink } from '@/server/links';
import { OFFLINE_AFTER_SEC } from '@/config/thresholds';
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

// ── Jump to presets (spec 10.3) — computed from the seed ──────────────────────

interface ClockPreset {
  label: string;
  hint: string;
  at: number;
}

function bookingFor(code: string, status: string) {
  const asset = seed.assets.find(a => a.code === code);
  if (!asset) return null;
  return seed.bookings.find(b => b.assetId === asset.id && b.status === status) ?? null;
}

function jumpToPresets(): ClockPreset[] {
  const out: ClockPreset[] = [];
  const now = clocklib.now();

  const add = (label: string, at: number | null | undefined) => {
    if (at === null || at === undefined || !Number.isFinite(at)) return;
    out.push({ label, hint: clocklib.formatDubaiTime(at), at });
  };

  const ex07Start = bookingFor('EX-07', 'scheduled')?.start;
  const ex07Ms = ex07Start ? new Date(ex07Start).getTime() : null;
  add('EX-07 rental starts', ex07Ms);
  add('1 min before EX-07 rental starts', ex07Ms === null ? null : ex07Ms - 60000);

  const ex04 = bookingFor('EX-04', 'active');
  add('EX-04 rental ends', ex04 ? new Date(ex04.end).getTime() : null);

  const fb12Asset = seed.assets.find(a => a.code === 'FB-12');
  const fb12Link = seed.trackingLinks.find(l => l.assetId === fb12Asset?.id && l.revokedAt === undefined);
  if (fb12Link) add('FB-12 link expires', toMs(fb12Link.expiresAt));

  const tp22Asset = seed.assets.find(a => a.code === 'TP-22');
  const tp22Link = seed.trackingLinks.find(l => l.assetId === tp22Asset?.id);
  if (tp22Link) add('TP-22 24-hour link expires', toMs(tp22Link.expiresAt));

  const wt08 = seed.assets.find(a => a.code === 'WT-08');
  if (wt08) {
    const readings = getReadingsForAsset(wt08, now - 3600000, now);
    const last = readings.length > 0 ? new Date(readings[readings.length - 1].deviceTime).getTime() : null;
    add('WT-08 goes offline', last === null ? null : last + OFFLINE_AFTER_SEC * 1000);
  }

  if (fb12Asset && fb12Link) {
    const booking = seed.bookings.find(b => b.id === fb12Link.bookingId);
    const readings = getReadingsForAsset(fb12Asset, now - 3600000, now);
    const last = readings.length > 0 ? readings[readings.length - 1] : null;
    if (booking?.destination && last) {
      const eta = resolveEtaForLink(
        fb12Link, fb12Asset,
        { lat: last.lat, lng: last.lng, deviceTime: last.deviceTime },
        booking.destination.name, booking.destination, now
      );
      add('FB-12 arrives at Al Habtoor site', eta.state === 'arrived' ? now : eta.etaAt);
    }
  }

  add('Start of last month', startOfLastMonthDubai());
  add('End of last month', startOfThisMonthDubai() - 60000);

  const overdueInvoice = seed.invoices.find(i => i.status === 'unpaid' || i.status === 'part_paid' || i.status === 'overdue');
  if (overdueInvoice) add(`${overdueInvoice.number} becomes overdue`, toMs(overdueInvoice.dueAt));

  return out;
}

function startOfThisMonthDubai(): number {
  const d = clocklib.dubaiMsToDate(clocklib.now());
  return clocklib.isoFromDubai(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00`
  );
}

function startOfLastMonthDubai(): number {
  const d = clocklib.dubaiMsToDate(clocklib.now());
  const m = d.getMonth() === 0 ? 12 : d.getMonth();
  const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  return clocklib.isoFromDubai(`${y}-${String(m).padStart(2, '0')}-01T00:00:00`);
}

function toMs(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'number' ? v : new Date(v).getTime();
}

// ── Tools ──────────────────────────────────────────────────────────────────────

function toolsItems(): { label: string; desc: string; href?: string }[] {
  return [
    { label: '/dev/ui', desc: 'UI kit showcase', href: '/dev/ui' },
    { label: '/dev/seed', desc: 'Seed data tables', href: '/dev/seed' },
    { label: '/dev/access', desc: 'Access explorer', href: '/dev/access' },
    { label: '/dev/bookings', desc: 'Booking simulator', href: '/dev/bookings' },
    { label: '/dev/audit', desc: 'Audit log (Demo view)', href: '/dev/audit' },
    { label: '/dev/outbox', desc: 'Email outbox (simulated)', href: '/dev/outbox' },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemoBar() {
  const router = useRouter();
  const session = useStore.getState().session;

  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
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

  const clockOffset = gs().clockOffsetMs;
  const currentTimeStr = clocklib.formatDubaiTime(clocklib.now());
  const currentDateStr = clocklib.formatDubaiDate(clocklib.now());

  const jumpTo = (targetMs: number) => {
    useStore.getState().setClockOffsetMs(targetMs - ANCHOR_MS);
    clocklib.setOffsetMs(targetMs - ANCHOR_MS);
    window.dispatchEvent(new CustomEvent('kasper:clock-changed'));
    router.refresh();
  };
  const shiftBy = (deltaMs: number) => jumpTo(clocklib.now() + deltaMs);

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
    <div className="demo-bar fixed top-0 left-0 right-0 z-50 px-3 py-2 flex items-center gap-2 overflow-x-auto" style={{ height: '36px' }}>
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
      {/* Clock */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setClockOpen(!clockOpen)}
          className="flex-shrink-0 bg-[#1a1b20] text-paper text-[10px] font-mono px-2 py-1 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
        >
          {currentTimeStr} · {currentDateStr}
        </button>
        {clockOpen && (
          <div className="absolute top-full right-0 mt-1 w-72 bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
            <div className="p-2 border-b border-[#2a2c30]">
              <div className="text-[10px] text-paper/50 font-mono">Simulated clock · Dubai</div>
              <div className="text-sm text-paper mt-0.5">{currentDateStr} · {currentTimeStr}</div>
              {clockOffset !== 0 && (
                <div className="text-[10px] text-yellow/80 font-mono">
                  {clockOffset > 0 ? '+' : '−'}{Math.abs(Math.round(clockOffset / 3600000))} h from real time
                </div>
              )}
            </div>
            <div className="p-2 flex flex-wrap gap-1 border-b border-[#2a2c30]">
              <ClockButton label="−1 d" onClick={() => shiftBy(-86400000)} />
              <ClockButton label="−1 h" onClick={() => shiftBy(-3600000)} />
              <ClockButton label="+1 h" onClick={() => shiftBy(3600000)} />
              <ClockButton label="+1 d" onClick={() => shiftBy(86400000)} />
              <ClockButton label="+1 w" onClick={() => shiftBy(7 * 86400000)} />
              <ClockButton label="Reset to now" onClick={() => jumpTo(ANCHOR_MS)} isReset />
            </div>
            <div className="p-2">
              <div className="text-[10px] text-paper/50 font-mono mb-1">Jump to</div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {jumpToPresets().map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => jumpTo(preset.at)}
                    className="w-full text-left px-2 py-1 text-[11px] text-paper/80 hover:bg-white/5 rounded transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{preset.label}</span>
                    <span className="text-paper/40 font-mono flex-shrink-0">{preset.hint}</span>
                  </button>
                ))}
              </div>
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
                    if (!resetArmed) {
                      setResetArmed(true);
                      return;
                    }
                    // Prototype data lives in memory, so a reload puts every screen
                    // back to the seeded day one. Switches and clock go back too —
                    // the signed-in user stays signed in.
                    useStore.getState().setDemoSwitches({ phase: 'later', showHidden: false, salesView: false });
                    clocklib.resetOffset();
                    useStore.getState().resetClock();
                    setResetArmed(false);
                    setToolsOpen(false);
                    window.location.reload();
                  }}
                  className={
                    resetArmed
                      ? 'w-full text-left px-3 py-1.5 text-xs bg-red/10 text-red hover:bg-red/20 transition-colors'
                      : 'w-full text-left px-3 py-1.5 text-xs text-red/80 hover:bg-red/10 transition-colors'
                  }
                >
                  {resetArmed ? 'Click again — this clears every demo change' : 'Reset demo data'}
                </button>
                <button
                  onClick={() => {
                    const target = seed.mucs.find(m => m.number === 'MUC-2026-09-EX-04-01') ?? seed.mucs[0];
                    if (!target) return;
                    const result = tamperWithMuc(target.number);
                    setToolsOpen(false);
                    if (result.ok) {
                      window.alert(`${result.message}\n\nOpening the verify page…`);
                      // Client-side navigation: the tamper lives in memory, so a
                      // full reload would quietly restore the sealed payload.
                      router.push(`/verify/${target.number}`);
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-amber/80 hover:bg-amber/10 transition-colors"
                >
                  Tamper with a stored certificate
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
                    a.download = 'kasper-demo-state-' + clocklib.dubaiToIso(clocklib.now()).slice(0,10) + '.json';
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
