'use client';

import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import styles from './oauth-callback.module.css';

export function OAuthCallbackFallback() {
  const { t } = useLocale();
  return <main aria-busy="true">{t('oauth.callback.finalizing')}</main>;
}

export function OAuthCallbackClient() {
  const router = useRouter();
  const search = useSearchParams();
  const retry = useAuthStore((state) => state.retry);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const { t } = useLocale();
  const started = useRef(false);
  const oauthResult = search.get('oauth');
  const reason = search.get('reason');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (oauthResult !== 'success') return;
    void retry().then(() => {
      if (useAuthStore.getState().status === 'authenticated') router.replace('/dashboard');
    });
  }, [oauthResult, retry, router]);

  const failed = oauthResult !== 'success' || status === 'unauthenticated';
  const authenticated = status === 'authenticated';
  const message = reason === 'invalid_state'
    ? t('oauth.callback.reason.invalidState')
    : reason === 'provider_denied'
      ? t('oauth.callback.reason.providerDenied')
      : reason === 'not_configured'
        ? t('oauth.callback.reason.notConfigured')
        : error ?? t('oauth.callback.reason.generic');

  const title = failed
    ? t('oauth.callback.title.failed')
    : authenticated
      ? t('oauth.callback.title.authenticated')
      : t('oauth.callback.title.loading');
  const description = failed
    ? message
    : authenticated
      ? t('oauth.callback.description.authenticated')
      : t('oauth.callback.description.loading');

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite" aria-busy={!failed && !authenticated}>
        <div className={styles.signal} data-state={failed ? 'error' : authenticated ? 'success' : 'loading'}>
          {failed
            ? <TriangleAlert aria-hidden="true" />
            : authenticated
              ? <CheckCircle2 aria-hidden="true" />
              : <Loader2 aria-hidden="true" />}
        </div>
        <p className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> {t('oauth.callback.eyebrow')}</p>
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
        <div className={styles.steps} aria-label={t('oauth.callback.steps.aria')}>
          <span data-active="true">{t('oauth.callback.steps.provider')}</span>
          <i />
          <span data-active={oauthResult === 'success'}>{t('oauth.callback.steps.session')}</span>
          <i />
          <span data-active={authenticated}>{t('oauth.callback.steps.dashboard')}</span>
        </div>
        {failed ? (
          <button type="button" onClick={() => router.replace('/login')}>
            {t('oauth.callback.backToLogin')}
          </button>
        ) : null}
      </section>
    </main>
  );
}
