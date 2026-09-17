'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { PublicHead } from '@/components/public-head';
import { Live, Source, StateBlock } from '@/components/ui';
import { useI18n } from '@/lib/i18n/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { useSession } from '@/lib/session/session';

/** The four reasons the backend redirects with (apps/api/app/routes/auth.py oauth_start / oauth_callback). */
const REASONS: Readonly<Record<string, readonly [MessageKey, MessageKey]>> = {
  provider_denied: ['oauth.provider_denied.title', 'oauth.provider_denied.body'],
  invalid_state: ['oauth.invalid_state.title', 'oauth.invalid_state.body'],
  not_configured: ['oauth.not_configured.title', 'oauth.not_configured.body'],
  exchange_failed: ['oauth.exchange_failed.title', 'oauth.exchange_failed.body'],
};

export function CallbackScreen() {
  const { t } = useI18n();
  const { state } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const result = search.get('oauth');
  const reason = search.get('reason') ?? '';

  // On success the backend already set the refresh cookie; the session provider turns it into a session on load.
  useEffect(() => {
    if (result === 'success' && state.status === 'signed-in') router.replace('/select-workspace');
  }, [result, state.status, router]);

  let body;
  if (result === 'success' && state.status !== 'signed-out') {
    body = (
      <div className="auth-card" style={{ maxWidth: 600, margin: '24px auto 0' }} aria-busy="true">
        <span className="label">{t('oauth.label')}</span>
        <h1 className="title">{t('oauth.finishing.title')}</h1>
        <p className="body ink2">{t('oauth.finishing.body')}</p>
        <Live state="live">POST /api/auth/refresh</Live>
      </div>
    );
  } else {
    const [title, text] = result === 'success' ? (['oauth.session.title', 'oauth.session.body'] as const) : REASONS[reason] ?? (['oauth.unknown.title', 'oauth.unknown.body'] as const);
    body = (
      <div className="stack-lg" style={{ maxWidth: 600, margin: '24px auto 0' }}>
        <h1 className="sr-only">{t('oauth.label')}</h1>
        <StateBlock
          kind="error"
          title={t(title)}
          action={
            <div className="btn-row">
              <Link className="btn btn-primary" href="/signin">{t('oauth.tryAgain')}</Link>
              <Link className="btn btn-ghost" href="/signin">{t('oauth.useEmail')}</Link>
            </div>
          }
        >
          {t(text)} <Source>{`/auth/callback?oauth=${result ?? '—'}${reason ? `&reason=${reason}` : ''}`}</Source>
        </StateBlock>
      </div>
    );
  }

  return (
    <div className="public">
      <PublicHead />
      <main className="public-main" id="main">
        <div className="public-inner">{body}</div>
      </main>
    </div>
  );
}
