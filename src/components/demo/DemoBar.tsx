'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDb, tamperWithMuc, runDueSchedules, clockPresets } from '@/server/api';
import * as clock from '@/lib/clock';
import { exportDemoState, importDemoState, resetDemoState } from '@/lib/demo-state';
import { useSession, useSwitches, useNow, useClockOffsetMs, useWalkthrough, useWalkthroughsDone, storeActions } from '@/hooks';
import { stripLocale } from '@/i18n';
import { WalkthroughCard } from '@/components/demo/WalkthroughCard';
import { SCENARIOS, startScenario, type Scenario } from '@/components/demo/scenarios';
import { ViewAsMenu } from '@/components/demo/ViewAsMenu';
import { FeaturesPanel } from './FeaturesPanel';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';

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
  const session = useSession();
  const switches = useSwitches();
  const now = useNow();
  const walkthrough = useWalkthrough();
  const walkthroughsDone = useWalkthroughsDone();
  const mucs = useDb(s => s.mucs);
  // Presets depend on bookings, links, readings and invoices: recompute when any of them change.
  const dbSnapshot = useDb(s => s);

  // Public pages (tracking link, verify) show the bar as a small floating pill (spec 10.9).
  const pathname = stripLocale(usePathname() ?? '');
  const publicPage = pathname.startsWith('/t/') || pathname.startsWith('/verify/');
  const [pillExpanded, setPillExpanded] = useState(false);
  useEffect(() => {
    const collapsed = publicPage && !pillExpanded;
    if (collapsed) document.body.dataset.demoCollapsed = 'true';
    else delete document.body.dataset.demoCollapsed;
    return () => { delete document.body.dataset.demoCollapsed; };
  }, [publicPage, pillExpanded]);

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
        importDemoState(String(reader.result ?? ''));
        // The db and session are now the file's. Re-render the current page
        // from them without a full reload.
        router.refresh();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'That file could not be imported.');
      }
    };
    reader.readAsText(file);
    setToolsOpen(false);
  };

  // Scenarios for the current user first — starting any of them switches user.
  const orderedScenarios = [...SCENARIOS].sort((a, b) => {
    const rank = (s: Scenario) => (s.user === null || s.user === session?.userId ? 0 : 1);
    return rank(a) - rank(b) || a.id - b.id;
  });

  const presets = useMemo(() => (clockOpen ? clockPresets() : []), [clockOpen, dbSnapshot]);

  const clockOffset = useClockOffsetMs();
  const currentTimeStr = clock.formatDubaiTime(now);
  const currentDateStr = clock.formatDubaiDate(now);

  // Every clock move goes through the store (its only writer), then the
  // schedules that came due run and the page re-reads.
  const afterClockMove = () => {
    runDueSchedules();
    window.dispatchEvent(new CustomEvent('kasper:clock-changed'));
    router.refresh();
  };
  const jumpTo = (targetMs: number) => {
    storeActions.setClockOffsetMs(targetMs - clock.getAnchor());
    afterClockMove();
  };
  const shiftBy = (deltaMs: number) => jumpTo(clock.now() + deltaMs);
  // A preset closes the Jump-to menu once it has moved the clock.
  const jumpToPreset = (targetMs: number) => {
    jumpTo(targetMs);
    setClockOpen(false);
  };
  const resetToNow = () => {
    storeActions.resetClock();
    afterClockMove();
  };

  if (publicPage && !pillExpanded) {
    return (
      <button
        type="button"
        onClick={() => setPillExpanded(true)}
        aria-label="Show the demo bar"
        className="demo-bar fixed top-2 right-2 z-50 flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-md"
      >
        <span className="demo-tag text-[9px]">DEMO</span>
        <span className="text-[11px]">Prototype</span>
      </button>
    );
  }

  return (
    <div className="demo-bar fixed top-0 left-0 right-0 z-50 px-3 py-2 flex items-center gap-2 overflow-x-auto" style={{ height: 'var(--demo-bar-h)' }}>
      {/* DEMO tag */}
      <span className="demo-tag flex-shrink-0 text-[9px]">DEMO</span>

      <ViewAsMenu />

      {/* Clock */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setClockOpen(!clockOpen)}
          aria-label="Clock"
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
              <ClockButton label="Reset to now" onClick={resetToNow} isReset />
            </div>
            <div className="p-2">
              <div className="text-[10px] text-paper/50 font-mono mb-1">Jump to</div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {presets.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => jumpToPreset(preset.at)}
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
            onClick={() => storeActions.setDemoSwitches({ phase: p })}
            className={clsx(
              'px-2 py-1 text-[10px] font-mono transition-colors',
              switches.phase === p
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
        onClick={() => storeActions.setDemoSwitches({ showHidden: !switches.showHidden })}
        className={clsx(
          'flex-shrink-0 px-2 py-1 text-[10px] font-mono rounded-lg border transition-colors',
          switches.showHidden
            ? 'bg-yellow/10 text-yellow border-yellow-dark/40'
            : 'bg-[#1a1b20] text-paper/60 border-[#2a2c30] hover:text-paper'
        )}
      >
        {switches.showHidden ? 'Show hidden: ON' : 'Show hidden: OFF'}
      </button>

      {/* Sales view */}
      <button
        onClick={() => storeActions.setDemoSwitches({ salesView: !switches.salesView })}
        className={clsx(
          'flex-shrink-0 px-2 py-1 text-[10px] font-mono rounded-lg border transition-colors',
          switches.salesView
            ? 'bg-[#1a1b20] text-paper border-[#2a2c30]'
            : 'bg-[#1a1b20] text-paper/60 border-[#2a2c30] hover:text-paper'
        )}
      >
        Sales view: {switches.salesView ? 'ON' : 'OFF'}
      </button>

      {/* Features button */}
      <button
        onClick={() => setFeaturesOpen(!featuresOpen)}
        className="inline-flex items-center gap-1 flex-shrink-0 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-paper/60">
          <path d="M5 1a4 4 0 100 8 4 4 0 000-8zM2 8l3-3 3 3M2 5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Features
      </button>

      {/* Features panel */}
      {featuresOpen && <FeaturesPanel />}

      {/* Guided walkthrough card */}
      {walkthrough && (
        <WalkthroughCard
          scenario={SCENARIOS.find(x => x.id === walkthrough.scenarioId) ?? { id: walkthrough.scenarioId, label: '', user: null, path: '/app' }}
          walkthrough={walkthrough}
          onSetStep={(stepIndex) => storeActions.setWalkthrough({ scenarioId: walkthrough.scenarioId, stepIndex })}
          onFinish={(id) => storeActions.markWalkthroughDone(id)}
          onDismiss={() => storeActions.setWalkthrough(null)}
        />
      )}

      {/* Scenarios dropdown */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setScenariosOpen(!scenariosOpen)}
          className="inline-flex items-center gap-1 flex-shrink-0 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-paper/60">
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
              {orderedScenarios.map(s => {
                const who = s.user ? dbSnapshot.users.find(u => u.id === s.user) : null;
                const notForUser = s.user !== null && s.user !== session?.userId;
                const done = walkthroughsDone.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      startScenario(s, path => router.push(path));
                      storeActions.setWalkthrough({ scenarioId: s.id, stepIndex: 0 });
                      setScenariosOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-start gap-2 ${notForUser ? 'opacity-50' : 'text-paper/80'}`}
                  >
                    <span className="text-yellow/80 font-medium flex-shrink-0 mt-0.5">
                      S{s.id}{done ? ' ✓' : ''}
                    </span>
                    <span>
                      {s.label}
                      <span className="block text-[10px] text-paper/40">
                        {who ? `runs as ${who.name}` : 'keeps the current user'}
                      </span>
                      {notForUser && who && (
                        <span className="block text-[10px] text-yellow/70">
                          Not for this user — switch to {who.name.split(' ')[0]} to try this (click to switch)
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tools dropdown */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setToolsOpen(!toolsOpen)}
          className="inline-flex items-center gap-1 flex-shrink-0 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors border border-[#2a2c30] whitespace-nowrap"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-paper/60">
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
                    // Back to the seeded demo: every row, the switches and the clock.
                    // Reset also signs out, so the next screen is sign-in.
                    resetDemoState();
                    setResetArmed(false);
                    setToolsOpen(false);
                    router.replace('/sign-in');
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
                    const target = mucs.find(m => m.number === 'MUC-2026-09-EX-04-01') ?? mucs[0];
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
                    const blob = new Blob([exportDemoState()], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'kasper-demo-state-' + clock.dubaiToIso(clock.now()).slice(0, 10) + '.json';
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

      {/* Language — demo bar stays English, but this flips the product UI. */}
      <LanguageToggle variant="demo" />

      {/* Prototype label */}
      <span className="flex-shrink-0 text-[9px] text-paper/40 font-mono ms-auto hidden lg:inline">
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
