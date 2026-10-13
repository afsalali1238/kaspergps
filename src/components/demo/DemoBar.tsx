'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useDb, tamperWithMuc, runDueSchedules, clockPresets } from '@/server/api';
import * as clock from '@/lib/clock';
import { exportDemoState, importDemoState, resetDemoState } from '@/lib/demo-state';
import { useSession, useSwitches, useNow, useClockOffsetMs, useWalkthrough, useWalkthroughsDone, storeActions } from '@/hooks';
import { stripLocale } from '@/i18n';
import { WalkthroughCard } from '@/components/demo/WalkthroughCard';
import { SCENARIOS, startScenario, type Scenario } from '@/components/demo/scenarios';
import { signOutToRoles } from '@/components/auth/sign-out';
import { personaForUser } from '@/config/personas';
import { FeaturesPanel } from './FeaturesPanel';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { ArrowLeftRight, ChevronDown, Clock, ListChecks, Play, Wrench } from 'lucide-react';
import { OPEN_DEMO_CLOCK_EVENT } from './open-clock';

/** One shape for every demo-bar button (B3: restyled with the tokens). */
const DEMO_BTN =
  'inline-flex items-center gap-1 sm:gap-1.5 flex-shrink-0 h-7 bg-demo-surface px-1.5 sm:px-2 rounded-md hover:bg-demo-surface-2 transition-colors border border-demo-line whitespace-nowrap focus-visible:outline-2 focus-visible:outline-yellow';

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

  // The bar wraps onto more rows on a phone, so its real height (not a fixed 36 px)
  // sets the offset the page and the sticky header sit below.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const sync = () => document.documentElement.style.setProperty('--demo-bar-h', `${el.offsetHeight}px`);
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [publicPage, pillExpanded]);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  // The LIVE pill in the app bar opens this clock (B3).
  useEffect(() => {
    const open = () => {
      setPillExpanded(true);
      setClockOpen(true);
    };
    window.addEventListener(OPEN_DEMO_CLOCK_EVENT, open);
    return () => window.removeEventListener(OPEN_DEMO_CLOCK_EVENT, open);
  }, []);
  // Chunk R: Scenarios and Tools live under More; the bar keeps the clock, sales view, features and the role.
  const [moreOpen, setMoreOpen] = useState(false);
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
  // S20 and S41 only demonstrated the Phase switch, which is gone.
  const orderedScenarios = SCENARIOS.filter(s => s.id !== 20 && s.id !== 41).sort((a, b) => {
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

  // The walkthrough card is shared by the full bar and the public-page pill, so a
  // scenario that ends on a public page (a tracking link, the verify page) can finish.
  const walkthroughCard = walkthrough ? (
    <WalkthroughCard
      scenario={SCENARIOS.find(x => x.id === walkthrough.scenarioId) ?? { id: walkthrough.scenarioId, label: '', user: null, path: '/app' }}
      walkthrough={walkthrough}
      onSetStep={(stepIndex) => storeActions.setWalkthrough({ scenarioId: walkthrough.scenarioId, stepIndex })}
      onFinish={(id) => storeActions.markWalkthroughDone(id)}
      onDismiss={() => storeActions.setWalkthrough(null)}
    />
  ) : null;

  // Chunk R: the role picker (home page) has no demo bar: its own header carries the DEMO tag.
  if (pathname === '' || pathname === '/') return null;

  if (publicPage && !pillExpanded) {
    return (
      <>
        {walkthroughCard}
        <div className="fixed top-2 right-2 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPillExpanded(true)}
            aria-label="Show the demo bar"
            className="demo-bar flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-md"
          >
            <span className="demo-tag text-[9px]">DEMO</span>
            <span className="text-[11px]">Prototype</span>
          </button>
          {/* Demo only: back to the role picker (chunk R). */}
          <Link href="/" className="rounded-full border border-demo-line bg-demo-surface px-2.5 py-1 text-[11px] text-paper shadow-md">← Back to roles</Link>
        </div>
      </>
    );
  }

  return (
    <div ref={barRef} className="demo-bar fixed top-0 left-0 right-0 z-50 px-2 sm:px-3 py-1.5 flex flex-wrap items-center gap-1 sm:gap-2">
      {/* DEMO tag */}
      <span className="demo-tag flex-shrink-0 text-[9px] hidden sm:inline">DEMO</span>

      {/* Chunk R: the role chip replaces View as. Switch role does what Log out does. */}
      {session && (
        <div className="flex-shrink-0 flex items-center gap-1.5 min-w-0">
          <span
            data-testid="role-chip"
            title={personaForUser(session.userId)?.title ?? 'Scenario user'}
            className="hidden sm:inline-flex items-center h-7 px-2 rounded-md bg-demo-surface-2 text-paper text-xs border border-demo-line whitespace-nowrap truncate max-w-[240px]"
          >
            {personaForUser(session.userId)?.title ?? 'Scenario user'}
          </span>
          <button
            type="button"
            aria-label="Switch role"
            onClick={() => signOutToRoles(path => router.replace(path))}
            className={clsx(DEMO_BTN, 'text-xs text-paper')}
          >
            <span className="hidden sm:inline">Switch role</span>
            <ArrowLeftRight size={13} aria-hidden className="sm:hidden shrink-0 text-paper/70" />
          </button>
        </div>
      )}

      {/* Clock */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setClockOpen(!clockOpen)}
          aria-label="Clock"
          aria-expanded={clockOpen}
          className={clsx(DEMO_BTN, 'font-mono text-[11px] text-paper')}
        >
          <Clock size={13} aria-hidden className="hidden sm:block shrink-0 text-paper/70" />
          {currentTimeStr}<span className="hidden sm:inline"> · {currentDateStr}</span>
        </button>
        {clockOpen && (
          <div className="absolute top-full right-0 mt-1 w-72 max-sm:fixed max-sm:inset-x-2 max-sm:top-[calc(var(--demo-bar-h)+4px)] max-sm:w-auto max-sm:mt-0 bg-demo-surface border border-demo-line rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50">
            <div className="p-2 border-b border-demo-line">
              <div className="text-[10px] text-paper/50 font-mono">Simulated clock · Dubai</div>
              <div className="text-sm text-paper mt-0.5">{currentDateStr} · {currentTimeStr}</div>
              {clockOffset !== 0 && (
                <div className="text-[10px] text-yellow/80 font-mono">
                  {clockOffset > 0 ? '+' : '−'}{Math.abs(Math.round(clockOffset / 3600000))} h from real time
                </div>
              )}
            </div>
            <div className="p-2 flex flex-wrap gap-1 border-b border-demo-line">
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
                    <span className="text-paper/60 font-mono flex-shrink-0">{preset.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Phase and Show hidden were removed (owner, 12 Oct): the demo always shows every
          phase, and actions a user can't take are simply absent, as in the product. */}

      {/* Sales view */}
      <button
        aria-label={`Sales view: ${switches.salesView ? 'ON' : 'OFF'}`}
        onClick={() => storeActions.setDemoSwitches({ salesView: !switches.salesView })}
        className={clsx(
          DEMO_BTN, 'font-mono text-[11px]',
          switches.salesView ? 'text-paper' : 'text-paper/70 hover:text-paper'
        )}
      >
        <span className="hidden sm:inline">Sales view: {switches.salesView ? 'ON' : 'OFF'}</span>
        <span className="sm:hidden">Sales {switches.salesView ? '●' : '○'}</span>
      </button>

      {/* Features button */}
      <button
        onClick={() => setFeaturesOpen(!featuresOpen)}
        aria-label="Features"
        className={clsx(DEMO_BTN, 'text-xs text-paper')}
      >
        <ListChecks size={13} aria-hidden className="shrink-0 text-paper/70" />
        <span className="hidden sm:inline">Features</span>
      </button>

      {/* Features panel */}
      {featuresOpen && <FeaturesPanel onClose={() => setFeaturesOpen(false)} />}

      {/* More: Scenarios and Tools (chunk R) */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          aria-label="More"
          aria-expanded={moreOpen}
          className={clsx(DEMO_BTN, 'text-xs text-paper')}
        >
          More
          <ChevronDown size={12} aria-hidden className="shrink-0 text-paper/70" />
        </button>
        {moreOpen && (
          <div className="absolute top-full right-0 mt-1 w-80 max-sm:fixed max-sm:inset-x-2 max-sm:top-[calc(var(--demo-bar-h)+4px)] max-sm:w-auto max-sm:mt-0 bg-demo-surface border border-demo-line rounded-lg shadow-2xl shadow-black/50 overflow-hidden z-50">
            <button
              type="button"
              aria-label="Scenarios"
              aria-expanded={scenariosOpen}
              onClick={() => setScenariosOpen(!scenariosOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-paper/90 hover:bg-white/5 border-b border-demo-line"
            >
              <span className="flex items-center gap-2"><Play size={13} aria-hidden className="text-paper/70" />Scenarios</span>
              <ChevronDown size={12} aria-hidden className={clsx('text-paper/60 transition-transform', scenariosOpen && 'rotate-180')} />
            </button>
            {scenariosOpen && (
              <div className="border-b border-demo-line">
                <div className="px-3 pt-2 pb-1 text-[10px] text-paper/50 font-mono">Guided walkthroughs</div>
                <div className="max-h-[min(50vh,480px)] overflow-y-auto p-2 space-y-0.5">
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
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-start gap-2 ${notForUser ? 'text-paper/60' : 'text-paper/80'}`}
                  >
                    <span className="text-yellow/80 font-medium flex-shrink-0 mt-0.5">
                      S{s.id}{done ? ' ✓' : ''}
                    </span>
                    <span>
                      {s.label}
                      {/* One line under the title, so at least 10 scenarios fit the menu (J5.6).
                          A scenario for someone else switches to them in the same click. */}
                      <span className={`block text-[10px] ${notForUser ? 'text-yellow/70' : 'text-paper/60'}`}>
                        {who
                          ? notForUser
                            ? `runs as ${who.name} — click to switch to ${who.name.split(' ')[0]}`
                            : `runs as ${who.name}`
                          : 'keeps the current user'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

              </div>
            )}
            <button
              type="button"
              aria-label="Tools"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(!toolsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-paper/90 hover:bg-white/5"
            >
              <span className="flex items-center gap-2"><Wrench size={13} aria-hidden className="text-paper/70" />Tools</span>
              <ChevronDown size={12} aria-hidden className={clsx('text-paper/60 transition-transform', toolsOpen && 'rotate-180')} />
            </button>
            {toolsOpen && (
              <div>
                <div className="px-3 pt-2 pb-1 text-[10px] text-paper/50 font-mono">Developer tools</div>
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
              <div className="border-t border-demo-line pt-1 mt-1">
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
                    router.replace('/');
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
        )}
      </div>

      {/* Language — demo bar stays English, but this flips the product UI. */}
      <LanguageToggle variant="demo" />

      {/* Prototype label */}
      <span className="flex-shrink-0 text-[9px] text-paper/60 font-mono ms-auto hidden lg:inline">
        Prototype · dummy data
      </span>
      {walkthroughCard}
    </div>
  );
}

// ── Clock button sub-component ──────────────────────────────────────────────────

function ClockButton({ label, onClick, isReset }: { label: string; onClick: () => void; isReset?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2 py-1 text-[10px] font-mono rounded hover:bg-white/5 transition-colors border border-demo-line',
        isReset ? 'bg-yellow/10 text-yellow border-yellow-dark/40' : 'bg-demo-surface-2 text-paper'
      )}
    >
      {label}
    </button>
  );
}
