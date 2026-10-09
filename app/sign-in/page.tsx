'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { signIn } from '@/server/api';
import { storeActions } from '@/hooks';
import { useT } from '@/i18n';

/** How long the welcome notice stays before the redirect. */
const NOTICE_MS = 1500;

export default function SignInPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const result = await signIn(email, password);

    if (result.success && result.data) {
      storeActions.setSession(result.data.session);
      const home = result.data.session.isKasper ? '/console' : '/app';
      if (result.data.notice) {
        // First sign-in of an invited user: greet them, then go on.
        setNotice(result.data.notice);
        await new Promise(resolve => setTimeout(resolve, NOTICE_MS));
      }
      router.replace(home);
    } else {
      setError(result.error ?? t('sign_in.errors.failed', 'Sign in failed.'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-ink text-paper flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="4" fill="#FFC400" />
            <text x="0" y="15" fontSize="13" fontFamily="monospace" fill="#141518" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold text-paper">Kasper</span>
        </div>
        <span className="text-[10px] font-mono text-grey-500 bg-paper/10 px-2 py-0.5 rounded">
          DEMO
        </span>
      </header>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8 justify-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="#141518" />
              <text x="0" y="24" fontSize="20" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
            </svg>
            <span className="text-lg font-semibold text-ink">Kasper GPS</span>
          </div>

          <h1 className="text-xl font-semibold text-ink text-center mb-1">{t('sign_in.title', 'Sign in')}</h1>
          <p className="text-sm text-grey-500 text-center mb-6">{t('sign_in.subtitle', 'Enter your email to continue.')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                {t('sign_in.email_label', 'Email')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('sign_in.email_placeholder', 'sara@kasper.ae')}
                className="w-full px-3 py-2.5 text-sm bg-surface border border-line rounded-lg focus:outline-none focus:border-ink transition-colors"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                {t('sign_in.password_label', 'Password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('sign_in.password_placeholder', 'Any password works')}
                className="w-full px-3 py-2.5 text-sm bg-surface border border-line rounded-lg focus:outline-none focus:border-ink transition-colors"
                disabled={loading}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2">
                {notice}
              </p>
            )}

            <Button type="submit" fullWidth size="md" loading={loading}>
              {t('sign_in.sign_in_button', 'Sign in')}
            </Button>
          </form>

          <div className="mt-6 text-center">
            {showForgot ? (
              <p className="text-sm text-grey-500">
                {t('sign_in.reset_sent', "We've sent a reset link to your email.")}
                <br />
                <span className="text-xs text-grey-500 italic">{t('sign_in.staff_2fa_note', 'Kasper staff use two-factor in production.')}</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-sm text-grey-500 hover:text-ink transition-colors"
              >
                {t('sign_in.forgot_password', 'Forgot password?')}
              </button>
            )}
          </div>

          <p className="mt-6 text-[10px] text-grey-500 text-center font-mono bg-paper/50 rounded px-3 py-2 border border-line">
            {t('sign_in.prototype_note', 'Prototype — dummy data only. All accounts use any password.')}
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-paper-2 border-t border-line py-3 px-4">
        <p className="text-[10px] text-grey-500 text-center font-mono">
          {t('sign_in.footer', 'KASPER GPS · Equipment tracking & rental management')}
        </p>
      </footer>
    </div>
  );
}
