// Shared tone vocabulary for the UI kit (UI-UPGRADE §4).
//
// One set of six tones, used by Badge, StatusDot, KpiCell, MetricTile and
// ProgressBar so a "warn" looks the same everywhere. Classes are full literal
// strings so Tailwind can see them; every colour is a token from globals.css.

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent';

export const TONES: readonly Tone[] = ['ok', 'warn', 'bad', 'info', 'neutral', 'accent'];

/** Text that sits on a white or tinted surface (AA-safe inks). */
export const toneText: Record<Tone, string> = {
  ok: 'text-ok-ink',
  warn: 'text-warn-ink',
  bad: 'text-bad-ink',
  info: 'text-info-ink',
  neutral: 'text-slate',
  accent: 'text-ink',
};

/** The 9% tint behind a badge or a highlighted cell. */
export const toneTint: Record<Tone, string> = {
  ok: 'bg-ok-tint',
  warn: 'bg-warn-tint',
  bad: 'bg-bad-tint',
  info: 'bg-info-tint',
  neutral: 'bg-surface-2',
  accent: 'bg-accent-tint',
};

/** Solid fill: dots, bar fills, sparkline strokes (via bg-/text- currentColor). */
export const toneFill: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  info: 'bg-info',
  neutral: 'bg-muted',
  accent: 'bg-accent',
};

/** Solid colour as currentColor, for SVG strokes. */
export const toneStroke: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-info',
  neutral: 'text-muted',
  accent: 'text-accent',
};

/** Hairline border in the tone. */
export const toneBorder: Record<Tone, string> = {
  ok: 'border-ok/30',
  warn: 'border-warn/40',
  bad: 'border-bad/30',
  info: 'border-info/30',
  neutral: 'border-line',
  accent: 'border-accent/60',
};

/**
 * Keyboard focus ring. The spec names the accent for focus, but yellow on white
 * is about 1.6:1, below the 3:1 a focus indicator needs, so the ring is ink with
 * an accent halo.
 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink focus-visible:shadow-[0_0_0_4px_var(--accent-tint)]';

/** The same ring drawn inside the element, for cells in a scrolling strip or table. */
export const focusRingInset =
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink';
