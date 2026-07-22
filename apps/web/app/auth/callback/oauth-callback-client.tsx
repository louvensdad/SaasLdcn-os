'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/use-auth-store';
import styles from './oauth-callback.module.css';

export function OAuthCallbackClient() {
  const router = useRouter();
  const search = useSearchParams();
  const retry = useAuthStore((state) => state.retry);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
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
    ? 'A validação de segurança expirou ou não corresponde a este navegador.'
    : reason === 'provider_denied'
      ? 'O acesso foi cancelado no provedor.'
      : reason === 'not_configured'
        ? 'Este provedor ainda não foi configurado pelo administrador.'
        : error ?? 'Não foi possível concluir a autenticação social.';

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite" aria-busy={!failed && !authenticated}>
        <div className={styles.signal} data-state={failed ? 'error' : authenticated ? 'success' : 'loading'}>
          {failed ? <TriangleAlert aria-hidden="true" /> : authenticated ? <CheckCircle2 aria-hidden="true" /> : <Loader2 aria-hidden="true" />}
        </div>
        <p className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> AI CODEBASE · SECURE SESSION</p>
        <h1>{failed ? 'Autenticação não concluída' : authenticated ? 'Sessão confirmada' : 'Confirmando sua identidade'}</h1>
        <p className={styles.description}>
          {failed ? message : authenticated ? 'Acesso liberado. Abrindo o dashboard…' : 'Validando a sessão e preparando seu workspace.'}
        </p>
        <div className={styles.steps} aria-label="Etapas da autenticação">
          <span data-active="true">Provider</span><i /><span data-active={oauthResult === 'success'}>Sessão</span><i /><span data-active={authenticated}>Dashboard</span>
        </div>
        {failed ? <button type="button" onClick={() => router.replace('/login')}>Voltar para o login</button> : null}
      </section>
    </main>
  );
}
