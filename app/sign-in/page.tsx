'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useStore } from '@/store';
import { signIn } from '@/server/api';

export default function SignInPage() {
  const router = useRouter();
  const store = useStore;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn(email.trim().toLowerCase(), password);

    if (result.success && result.data) {
      store.getState().setSession(result.data.session);
      if (result.data.session.isKasper) {
        router.replace('/console');
      } else {
        router.replace('/app');
      }
    } else {
      setError(result.error ?? 'Sign in failed.');
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

          <h1 className="text-xl font-semibold text-ink text-center mb-1">Sign in</h1>
          <p className="text-sm text-grey-500 text-center mb-6">Enter your email to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="sara@kasper.ae"
                className="w-full px-3 py-2.5 text-sm bg-surface border border-line rounded-lg focus:outline-none focus:border-ink transition-colors"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Any password works"
                className="w-full px-3 py-2.5 text-sm bg-surface border border-line rounded-lg focus:outline-none focus:border-ink transition-colors"
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" fullWidth size="md" loading={loading}>
              Sign in
            </Button>
          </form>

          <div className="mt-6 text-center">
            {showForgot ? (
              <p className="text-sm text-grey-500">
                We&apos;ve sent a reset link to your email.
                <br />
                <span className="text-xs text-grey-500 italic">Kasper staff use two-factor in production.</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-sm text-grey-500 hover:text-ink transition-colors"
              >
                Forgot password?
              </button>
            )}
          </div>

          <p className="mt-6 text-[10px] text-grey-500 text-center font-mono bg-paper/50 rounded px-3 py-2 border border-line">
            Prototype — dummy data only. All accounts use any password.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-paper-2 border-t border-line py-3 px-4">
        <p className="text-[10px] text-grey-500 text-center font-mono">
          KASPER GPS · Equipment tracking & rental management
        </p>
      </footer>
    </div>
  );
}
