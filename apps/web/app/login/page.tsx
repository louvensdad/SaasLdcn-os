'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import { useLocaleStore } from '@/stores/use-locale-store';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLocale();
  const locale = useLocaleStore((state) => state.interfaceLocale);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const initialize = useAuthStore((state) => state.initialize);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [router, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({
          email,
          password,
          full_name: fullName,
          locale,
          privacy_policy_accepted: privacyAccepted,
        });
      }
      router.replace('/dashboard');
    } catch {
      // The store exposes the API error below.
    }
  }

  const pending = status === 'loading';

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div className="grid-pattern pointer-events-none absolute inset-0 opacity-[0.08]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] blur-3xl" />

      <Card className="relative w-full max-w-md space-y-6 p-7" surface="primary">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--accent)]">
              {t('product.name')}
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-[color:var(--text)]">
              {t(mode === 'login' ? 'auth.login.title' : 'auth.register.title')}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              {t(mode === 'login' ? 'auth.login.description' : 'auth.register.description')}
            </p>
          </div>
          <LocaleSelector />
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {mode === 'register' ? (
            <label className="grid gap-2 text-sm text-[color:var(--text)]">
              <span>{t('auth.fullName')}</span>
              <Input
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </label>
          ) : null}

          <label className="grid gap-2 text-sm text-[color:var(--text)]">
            <span>{t('auth.email')}</span>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="grid gap-2 text-sm text-[color:var(--text)]">
            <span>{t('auth.password')}</span>
            <Input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {mode === 'register' ? (
            <label className="flex gap-3 text-sm leading-6 text-[color:var(--muted)]">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(event) => setPrivacyAccepted(event.target.checked)}
                required
                className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
              />
              <span>{t('auth.privacyAcceptance')}</span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={pending || (mode === 'register' && !privacyAccepted)}
          >
            {pending
              ? t('auth.processing')
              : t(mode === 'login' ? 'auth.login.submit' : 'auth.register.submit')}
          </Button>
        </form>

        <button
          type="button"
          className="focus-ring w-full rounded-lg py-2 text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {t(mode === 'login' ? 'auth.login.switch' : 'auth.register.switch')}
        </button>
      </Card>
    </main>
  );
}
