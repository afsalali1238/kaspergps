'use client';

// Guided walkthrough card (demo bar item 7): numbered steps in a small floating
// card, pulsing yellow ring around the element to click, self-ticking steps,
// and a final step that states what the reviewer should see.

import React, { useEffect, useMemo, useState } from 'react';
import { walkthroughSteps } from '@/components/demo/walkthroughs';

interface WalkthroughState {
  scenarioId: number;
  stepIndex: number;
}

interface WalkthroughCardProps {
  scenario: { id: number; label: string };
  walkthrough: WalkthroughState;
  onSetStep: (index: number) => void;
  onFinish: (scenarioId: number) => void;
  onDismiss: () => void;
}

function Ring({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect(r);
          return;
        }
      }
      setRect(null);
    };
    measure();
    const interval = window.setInterval(measure, 500);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [selector]);

  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[120] rounded-lg animate-pulse"
      style={{
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        outline: '3px solid #FFC400',
        boxShadow: '0 0 0 6px rgba(255, 196, 0, 0.25)',
      }}
    />
  );
}

export function WalkthroughCard({ scenario, walkthrough, onSetStep, onFinish, onDismiss }: WalkthroughCardProps) {
  const steps = useMemo(() => walkthroughSteps(scenario.id), [scenario.id]);
  const [selfTicked, setSelfTicked] = useState<Set<number>>(new Set());
  const stepIndex = Math.min(walkthrough.stepIndex, steps.length - 1);

  // Self-ticking steps: watch for the doneWhen text on the page.
  useEffect(() => {
    const check = () => {
      const next = new Set(selfTicked);
      let changed = false;
      steps.forEach((s, i) => {
        if (s.doneWhen && !next.has(i) && document.body.innerText.includes(s.doneWhen)) {
          next.add(i);
          changed = true;
        }
      });
      if (changed) setSelfTicked(next);
    };
    check();
    const interval = window.setInterval(check, 1000);
    return () => window.clearInterval(interval);
  }, [steps, selfTicked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const setStep = (i: number) => onSetStep(Math.max(0, Math.min(i, steps.length - 1)));
  const finish = () => onFinish(scenario.id);

  const last = stepIndex === steps.length - 1;

  return (
    <>
      {steps[stepIndex]?.highlight && <Ring selector={steps[stepIndex].highlight!} />}

      <div
        className="demo-tour fixed bottom-14 right-4 z-[130] w-80 bg-[#1a1b20] text-paper border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
        data-testid="walkthrough-card"
      >
        <div className="px-3 py-2 border-b border-[#2a2c30] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-paper/50 font-mono">Walkthrough · S{scenario.id}</div>
            <div className="text-xs text-paper/90">{scenario.label}</div>
          </div>
          <button
            onClick={finish}
            className="text-[10px] text-paper/60 hover:text-paper border border-[#2a2c30] rounded px-1.5 py-0.5"
          >
            End tour
          </button>
        </div>

        <div className="px-3 py-2 max-h-56 overflow-y-auto">
          {steps.map((s, i) => {
            const done = i < stepIndex || selfTicked.has(i);
            return (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-full text-left flex items-start gap-2 py-1 ${i === stepIndex ? '' : 'opacity-60'} hover:opacity-100 transition-opacity`}
              >
                <span
                  className={`flex-shrink-0 w-4 h-4 mt-0.5 rounded-full text-[9px] font-semibold flex items-center justify-center ${
                    i === stepIndex
                      ? 'bg-yellow text-ink'
                      : done
                        ? 'bg-green text-white'
                        : 'bg-white/10 text-paper/60'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={`text-xs leading-4 ${i === stepIndex ? 'text-paper' : 'text-paper/70'}`}>{s.text}</span>
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2 border-t border-[#2a2c30] flex items-center justify-between">
          <button
            onClick={() => setStep(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="text-[10px] text-paper/60 hover:text-paper disabled:opacity-30 border border-[#2a2c30] rounded px-2 py-1"
          >
            ← Back
          </button>
          <span className="text-[10px] text-paper/40">
            {stepIndex + 1} / {steps.length}
          </span>
          {last ? (
            <button
              onClick={finish}
              className="text-[10px] bg-yellow text-ink font-semibold rounded px-2 py-1"
            >
              Finish
            </button>
          ) : (
            <button
              onClick={() => setStep(stepIndex + 1)}
              className="text-[10px] bg-yellow text-ink font-semibold rounded px-2 py-1"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </>
  );
}
