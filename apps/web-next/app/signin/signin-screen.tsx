'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { PublicHead } from '@/components/public-head';
import { Signal } from '@/components/signal';
import { SignInStory } from '@/components/story';
import { GapChip, Notice, Source, StateBlock } from '@/components/ui';
import { api, oauthStartUrl } from '@/lib/api/api';
import { ApiError } from '@/lib/api/http';
import { useI18n } from '@/lib/i18n/i18n';
import { isLocale, LOCALE_LABEL, LOCALES, type Locale } from '@/lib/i18n/locales';
import { currentAppUrl } from '@/lib/routes';
import { safeNext, useSession } from '@/lib/session/session';

type Failure = 'credentials' | 'taken' | 'invalid' | 'consent' | 'offline' | 'generic';

function failureOf(caught: unknown): { readonly kind: Failure; readonly code: string } {
  if (!(caught instanceof ApiError)) return { kind: 'generic', code: 'unexpected' };
  if (caught.offline) return { kind: 'offline', code: caught.code };
  if (caught.status === 401) return { kind: 'credentials', code: caught.code };
  if (caught.status === 409) return { kind: 'taken', code: caught.code };
  if (caught.status === 422) return { kind: 'invalid', code: caught.code };
  if (caught.status === 400) return { kind: 'consent', code: caught.code };
  return { kind: 'generic', code: caught.code };
}

const PROVIDERS = [['google', 'Google'], ['github', 'GitHub']] as const;

export function SignInScreen() {
  const { t, locale, setLocale } = useI18n();
  const { state, signIn } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const register = search.get('mode') === 'register';
  const notice = search.get('state');
  const next = safeNext(search.get('next'));
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: api.policy });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountLocale, setAccountLocale] = useState<Locale>(locale);
  const [consent, setConsent] = useState(false);
  const [failure, setFailure] = useState<{ readonly kind: Failure; readonly code: string } | null>(null);
  const [pending, setPending] = useState(false);

  const afterSignIn = `/select-workspace?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    if (state.status === 'signed-in') router.replace(afterSignIn);
  }, [state.status, router, afterSignIn]);

  useEffect(() => setFailure(null), [register]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    try {
      const auth = register
        ? await api.register({ email: email.trim(), password, full_name: fullName.trim(), locale: accountLocale, privacy_policy_accepted: consent })
        : await api.login({ email: email.trim(), password });
      if (register) setLocale(accountLocale);
      signIn(auth);
      router.replace(afterSignIn);
    } catch (caught) {
      setFailure(failureOf(caught));
    } finally {
      setPending(false);
    }
  };

  const tabHref = (mode: 'signin' | 'register') => {
    const params = new URLSearchParams();
    if (mode === 'register') params.set('mode', 'register');
    if (search.get('next')) params.set('next', next);
    const query = params.toString();
    return `/signin${query ? `?${query}` : ''}`;
  };

  let message = null;
  if (failure?.kind === 'credentials') {
    message = <StateBlock kind="error" title={t('signin.error.credentials.title')}>{t('signin.error.credentials.body')} <Link href={`/signin?state=forgot`}>{t('signin.forgot')}</Link></StateBlock>;
  } else if (failure?.kind === 'taken') {
    message = <StateBlock kind="error" title={t('signin.error.taken.title')}>{t('signin.error.taken.body')} <GapChip id="G16" detail="POST /api/auth/register answers 409 auth.email_taken" /></StateBlock>;
  } else if (failure) {
    const text = failure.kind === 'invalid' ? t('signin.error.invalid') : failure.kind === 'consent' ? t('signin.error.consent') : failure.kind === 'offline' ? t('signin.error.offline') : t('signin.error.generic', { code: failure.code });
    message = <StateBlock kind="error" title={text} />;
  } else if (!register && notice === 'expired') {
    message = <Notice family="stop" title={t('signin.expired.title')}>{t('signin.expired.body')}</Notice>;
  } else if (!register && notice === 'forgot') {
    message = <Notice family="idle" title={t('signin.forgot.title')}>{t('signin.forgot.body')} <GapChip id="G15" detail="No password reset or e-mail verification in the backend" /></Notice>;
  }

  const version = policy.data?.version;
  const points = [
    ['proof', 'signin.point.key.title', 'signin.point.key.body'],
    ['proof', 'signin.point.evidence.title', 'signin.point.evidence.body'],
    ['hand', 'signin.point.decide.title', 'signin.point.decide.body'],
    ['proof', 'signin.point.learn.title', 'signin.point.learn.body'],
  ] as const;

  return (
    <div className="public">
      <PublicHead />
      <main className="public-main" id="main">
        <div className="public-inner">
          <div className="auth">
            <div className="stack-lg" style={{ paddingTop: 12 }}>
              <span className="label">{t('signin.eyebrow')}</span>
              <h1 className="display">{t('signin.title')}</h1>
              <p className="lede">{t('signin.lede')}</p>
              <SignInStory />
              <div className="list" style={{ maxWidth: 520 }}>
                {points.map(([family, title, body]) => (
                  <div className="li" key={title}>
                    <Signal family={family} label={t(title)} />
                    <span className="li-title">{t(title)}</span>
                    <span className="li-sub">{t(body)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="auth-card">
              <div className="tabs" role="tablist" style={{ marginBottom: 4 }}>
                <Link className="tab" role="tab" aria-selected={!register} href={tabHref('signin')}>{t('signin.tab.signin')}</Link>
                <Link className="tab" role="tab" aria-selected={register} href={tabHref('register')}>{t('signin.tab.register')}</Link>
              </div>
              <form className="stack" onSubmit={submit} aria-label={register ? t('signin.tab.register') : t('signin.tab.signin')}>
                <div aria-live="polite">{message}</div>
                {register ? (
                  <div className="field">
                    <label htmlFor="rg-name">{t('signin.fullName')}</label>
                    <input id="rg-name" type="text" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="auth-email">{t('signin.email')}</label>
                  <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="auth-password">{t('signin.password')}</label>
                  <input id="auth-password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
                  {register ? <span className="meta">{t('signin.passwordHint')}</span> : null}
                </div>
                {register ? (
                  <>
                    <div className="field">
                      <label htmlFor="rg-locale">{t('signin.language')}</label>
                      <select id="rg-locale" value={accountLocale} onChange={(event) => { if (isLocale(event.target.value)) setAccountLocale(event.target.value); }}>
                        {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_LABEL[code]} · {code}</option>)}
                      </select>
                    </div>
                    {policy.isError ? <StateBlock kind="error" title={t('signin.policyFailed')} /> : null}
                    <label className="check">
                      <input id="rg-consent" type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                      <span>
                        {t('signin.consent', { version: version ?? t('signin.policyLoading') })}{' '}
                        <a href={currentAppUrl('/privacy')} target="_blank" rel="noreferrer">{t('signin.privacy')}</a> · <a href={currentAppUrl('/terms')} target="_blank" rel="noreferrer">{t('signin.terms')}</a>
                      </span>
                    </label>
                  </>
                ) : (
                  <div className="row-between">
                    <Link className="meta" href="/signin?state=forgot">{t('signin.forgot')}</Link>
                    <span className="meta">{t('signin.renews')}</span>
                  </div>
                )}
                <button className="btn btn-primary" type="submit" style={{ height: 40 }} disabled={pending || (register && !version)}>
                  {register ? (pending ? t('signin.register.submitting') : t('signin.register.submit')) : pending ? t('signin.submitting') : t('signin.submit')}
                </button>
              </form>
              <div className="or">{t('signin.or')}</div>
              <div className="stack" style={{ gap: 8 }}>
                {PROVIDERS.map(([id, label]) => (
                  <a key={id} className="btn btn-ghost" style={{ width: '100%', height: 40 }} href={oauthStartUrl(id)}>{t('signin.provider', { provider: label })}</a>
                ))}
              </div>
              {version ? <p className="meta">{t('signin.providerNote', { version })}</p> : null}
              <Source>{register ? 'GET /api/auth/policy · POST /api/auth/register' : 'POST /api/auth/login · POST /api/auth/refresh · GET /api/auth/oauth/{provider}'}</Source>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
