// In-app notifications (the bell).
// Used when a TrackerRequest is paired or declined, so the requesting Tenant
// Admin sees the outcome (spec 11.9 Requests).

import type { Notification, Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { overdueInvoiceAlerts } from '@/server/billing';
import * as clock from '@/lib/clock';

let notifSeq = 0;

export function notifyUser(userId: string, text: string, href?: string): Notification {
  const notification: Notification = {
    id: `ntf-${++notifSeq}`,
    userId,
    at: new Date(clock.now()).toISOString(),
    text,
    read: false,
    href,
  };
  seed.notifications.push(notification);
  return notification;
}

export function notificationsFor(userId: string): Notification[] {
  return seed.notifications
    .filter(n => n.userId === userId)
    .sort((a, b) => toMs(b.at) - toMs(a.at));
}

export function unreadCount(userId: string): number {
  return seed.notifications.filter(n => n.userId === userId && !n.read).length;
}

export function markNotificationRead(userId: string, id: string): void {
  const n = seed.notifications.find(x => x.id === id && x.userId === userId);
  if (n) n.read = true;
}

export function markAllRead(userId: string): void {
  for (const n of seed.notifications) if (n.userId === userId) n.read = true;
}

/**
 * Overdue invoice alerts (Phase 2 `invoice_overdue`, spec 11.17): shown to the
 * invoice issuer until it is paid or voided. Derived, so they can't go stale.
 */
export function derivedNotifications(session: Session | null): Notification[] {
  if (!session) return [];
  return overdueInvoiceAlerts(session).map(alert => ({
    id: `ntf-${alert.invoiceId}`,
    userId: session.userId,
    at: clock.now(),
    text: alert.text,
    read: false,
    href: '/app/billing',
  }));
}

export function sessionNotifications(session: Session | null): Notification[] {
  if (!session) return [];
  return [...derivedNotifications(session), ...notificationsFor(session.userId)]
    .sort((a, b) => toMs(b.at) - toMs(a.at));
}

/** Bell count for the top bar: stored unread plus any overdue-invoice alerts. */
export function bellNotifications(session: Session | null): Notification[] {
  return sessionNotifications(session);
}

export function bellUnreadCount(session: Session | null): number {
  if (!session) return 0;
  return unreadCount(session.userId) + derivedNotifications(session).length;
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}
