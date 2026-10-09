// The sign-in checks (F2): the sign-in form and the demo bar's View as share
// signInAs, so one test set covers both. Refusals keep the session unchanged.

import { describe, it, expect, beforeEach } from 'vitest';
import { signIn, signInAs } from './api';
import { db, resetDb } from '@/server/db';

const DEACTIVATED = 'Your account is no longer active. Contact your company admin.';
const SUSPENDED = "Your company's account is suspended. Contact Kasper.";
const EMPTY = 'Email or password is incorrect.';

describe('sign-in checks', () => {
  beforeEach(() => {
    resetDb();
  });

  it('an empty email or password is refused like a wrong password', async () => {
    expect(await signIn('', 'demo')).toMatchObject({ success: false, error: EMPTY });
    expect(await signIn('omar@alnoor.ae', '')).toMatchObject({ success: false, error: EMPTY });
    expect(await signIn('   ', '')).toMatchObject({ success: false, error: EMPTY });
  });

  it('an active user signs in, with the email in any case', async () => {
    const result = await signIn('  OMAR@alnoor.ae ', 'demo');
    expect(result.success).toBe(true);
    expect(result.data?.session.userId).toBe('u-omar');
    expect(result.data?.notice).toBeUndefined();
  });

  it('a deactivated user is refused by signIn and by signInAs', async () => {
    expect(await signIn('karim@marina.ae', 'demo')).toMatchObject({ success: false, error: DEACTIVATED });
    expect(signInAs('u-karim')).toMatchObject({ success: false, error: DEACTIVATED });
  });

  it('a user of a suspended company is refused', async () => {
    db.setState(s => ({ tenants: s.tenants.map(t => (t.id === 't-palm' ? { ...t, status: 'suspended' as const } : t)) }));
    const palmUser = db.getState().users.find(u => u.tenantId === 't-palm' && u.status === 'active')!;
    expect(signInAs(palmUser.id)).toMatchObject({ success: false, error: SUSPENDED });
  });

  it('an invited user is activated on first sign-in, with a welcome notice', () => {
    db.setState(s => ({ users: s.users.map(u => (u.id === 'u-omar' ? { ...u, status: 'invited' as const } : u)) }));
    const result = signInAs('u-omar');
    expect(result.success).toBe(true);
    expect(result.data?.notice).toBe('Welcome to Kasper, Omar.');
    expect(db.getState().users.find(u => u.id === 'u-omar')?.status).toBe('active');
  });

  it('an unknown user is refused', () => {
    expect(signInAs('u-nobody')).toMatchObject({ success: false });
  });
});
