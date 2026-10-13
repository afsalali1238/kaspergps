// "12 min ago" for an alert row; the exact Dubai time goes in the hover title.
// `now` comes from the caller (clock.now()), never Date.now().

type T = (key: string, fallback: string, vars?: Record<string, string | number>) => string;

export function relativeTime(t: T, ms: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
  if (minutes < 1) return t('alerts_page.rel.now', 'Just now');
  if (minutes < 60) return t('alerts_page.rel.minutes', '{n} min ago', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('alerts_page.rel.hours', '{n} h ago', { n: hours });
  const days = Math.floor(hours / 24);
  return days === 1
    ? t('alerts_page.rel.day', '1 day ago')
    : t('alerts_page.rel.days', '{n} days ago', { n: days });
}
