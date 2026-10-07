// In-app notifications (the bell).
// Used when a TrackerRequest is paired or declined, so the requesting Tenant
// Admin sees the outcome (spec 11.9 Requests).

import type { Notification, Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
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

export function sessionNotifications(session: Session | null): Notification[] {
  return session ? notificationsFor(session.userId) : [];
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}
