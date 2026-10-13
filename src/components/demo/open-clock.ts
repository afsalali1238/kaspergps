// The LIVE pill in the app and console bars opens the demo clock in the demo bar.
// They live in different trees, so they talk through one window event.
export const OPEN_DEMO_CLOCK_EVENT = 'kasper:open-demo-clock';

export function openDemoClock(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_DEMO_CLOCK_EVENT));
}
