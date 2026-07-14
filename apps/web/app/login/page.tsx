'use client';

import { Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Github, Lock, Mail } from 'lucide-react';

import { ToastProvider } from '@/components/feedback/toast-provider';
import { apiEndpoints } from '@/lib/api/endpoints';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import { useLocaleStore } from '@/stores/use-locale-store';
import { useShellStore } from '@/stores/use-shell-store';
import { useUiStore } from '@/stores/use-ui-store';

import styles from './login.module.css';

const STAGES = ['idea', 'spec', 'contract', 'build', 'verify', 'ship'] as const;

// Seeded PRNG so the star field is identical on server and client renders —
// Math.random() here would desync hydration.
function mulberry32(seed: number) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomStar = mulberry32(20260710);
const STARS = Array.from({ length: 55 }, (_, index) => ({
  id: index,
  top: `${(randomStar() * 100).toFixed(2)}%`,
  left: `${(randomStar() * 100).toFixed(2)}%`,
  size: `${(1 + randomStar() * 2).toFixed(2)}px`,
  duration: `${(2.5 + randomStar() * 3).toFixed(2)}s`,
  delay: `${(randomStar() * 4).toFixed(2)}s`,
}));

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.95a9 9 0 0 0 0 8.08l3.02-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.96l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const locale = useLocaleStore((state) => state.interfaceLocale);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const initialize = useAuthStore((state) => state.initialize);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const themeId = useShellStore((state) => state.themeId);
  const setThemeId = useShellStore((state) => state.setThemeId);
  const addToast = useUiStore((state) => state.addToast);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(-1);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // A submit in progress plays its own pipeline animation before redirecting;
  // otherwise (e.g. a restored session on load) redirect the moment we're
  // authenticated.
  const animatingSubmit = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !animatingSubmit.current) router.replace('/platform');
  }, [router, status]);

  // The OAuth callback redirects back here (never straight to /platform): on
  // success the refresh cookie is already set and the `initialize()` effect
  // above picks up the session; on failure there's no session to pick up, so
  // surface the reason as a toast. Either way, strip the query string so a
  // page refresh doesn't re-trigger the toast.
  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (!oauthResult) return;
    if (oauthResult === 'error') {
      addToast({
        tone: 'error',
        title: t('login.social.unavailable.title'),
        description: t('login.social.unavailable.description'),
      });
    }
    router.replace('/login');
  }, [searchParams, addToast, router, t]);

  function runPipeline() {
    return new Promise<void>((resolve) => {
      let index = 0;
      setPipelineStage(0);
      const interval = setInterval(() => {
        index += 1;
        if (index >= STAGES.length) {
          window.clearInterval(interval);
          resolve();
          return;
        }
        setPipelineStage(index);
      }, 220);
    });
  }

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
      await runPipeline();
      addToast({
        tone: 'success',
        title: t('login.submit.toast.title'),
        description: t('login.submit.toast.description'),
      });
      router.replace('/platform');
    } catch {
      // The store exposes the API error below; nothing succeeded, so the
      // pipeline stays idle rather than animating a false confirmation.
      setPipelineStage(-1);
    }
  }

  function startOAuth(provider: 'google' | 'github') {
    // Full-page navigation, not a fetch: the backend redirects on to the
    // provider's consent screen, then back to /login.
    window.location.href = apiEndpoints.auth.oauthStart(provider);
  }

  const pending = status === 'loading';
  const busy = pending || pipelineStage >= 0;

  return (
    <div className={styles.shell} data-theme={themeId}>
      <ToastProvider />

      <div className={styles.cornerControls}>
        <button
          type="button"
          className={styles.themeToggle}
          aria-label={t(themeId === 'dark' ? 'login.theme.toggleToLight' : 'login.theme.toggleToDark')}
          onClick={() => setThemeId(themeId === 'dark' ? 'light' : 'dark')}
        >
          {themeId === 'dark' ? '🌙' : '☀️'}
        </button>
        <LocaleSelector compact />
      </div>

      <section className={styles.hero}>
        <div className={styles.starField} aria-hidden>
          {STARS.map((star) => (
            <span
              key={star.id}
              className={styles.star}
              style={{
                top: star.top,
                left: star.left,
                '--size': star.size,
                '--duration': star.duration,
                '--delay': star.delay,
              } as CSSProperties}
            />
          ))}
        </div>
        <div className={`${styles.orb} ${styles.orbOne}`} aria-hidden />
        <div className={`${styles.orb} ${styles.orbTwo}`} aria-hidden />
        <div className={`${styles.orb} ${styles.orbThree}`} aria-hidden />

        <div className={styles.heroContent}>
          <div className={styles.logo}>
            <span className={styles.logoRing}>
              <span className={styles.logoMark} />
            </span>
            <span className={styles.logoWord}>{t('product.name')}</span>
          </div>

          <p className={styles.eyebrow}>{t('login.hero.eyebrow')}</p>
          <h1 className={styles.title}>
            {t('login.hero.titleLead')}
            <span className={styles.titleAccent}>{t('login.hero.titleAccent')}</span>
          </h1>
          <p className={styles.subtitle}>{t('login.hero.subtitle')}</p>

          <ol className={styles.pipeline}>
            {STAGES.map((stage, index) => {
              const active = index <= pipelineStage;
              return (
                <li key={stage} className={styles.pipelineStep}>
                  <div className={styles.pipelineNode}>
                    <span className={styles.pipelineDot} data-active={active} />
                    <span className={styles.pipelineLabel} data-active={active}>
                      {t(`dashboard.stage.${stage}`)}
                    </span>
                  </div>
                  {index < STAGES.length - 1 ? (
                    <span className={styles.pipelineTrace} data-active={index < pipelineStage} aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <p className={styles.formEyebrow}>{t('product.name')}</p>
            <h2 className={styles.formTitle}>
              {t(mode === 'login' ? 'auth.login.title' : 'auth.register.title')}
            </h2>
            <p className={styles.formDescription}>
              {t(mode === 'login' ? 'auth.login.description' : 'auth.register.description')}
            </p>
          </div>

          <form className={styles.form} onSubmit={submit}>
            {mode === 'register' ? (
              <label className={styles.field} style={{ animationDelay: '0.05s' }}>
                <span>{t('auth.fullName')}</span>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon}><Mail size={16} /></span>
                  <input
                    className={styles.input}
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                </div>
              </label>
            ) : null}

            <label className={styles.field} style={{ animationDelay: '0.1s' }}>
              <span>{t('auth.email')}</span>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Mail size={16} /></span>
                <input
                  type="email"
                  className={styles.input}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </label>

            <label className={styles.field} style={{ animationDelay: '0.18s' }}>
              <span>{t('auth.password')}</span>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={16} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={t(showPassword ? 'login.form.hidePassword' : 'login.form.showPassword')}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {mode === 'register' ? (
              <label
                className={styles.field}
                style={{ animationDelay: '0.24s', display: 'flex', flexDirection: 'row', gap: '0.6rem', fontWeight: 400 }}
              >
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  required
                />
                <span>{t('auth.privacyAcceptance')}</span>
              </label>
            ) : null}

            {error ? (
              <p role="alert" className={styles.errorBanner}>
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className={styles.submit}
              style={{ animationDelay: '0.3s' }}
              disabled={busy || (mode === 'register' && !privacyAccepted)}
            >
              {pending
                ? t('auth.processing')
                : t(mode === 'login' ? 'auth.login.submit' : 'auth.register.submit')}
            </button>
          </form>

          <div className={styles.divider} style={{ animationDelay: '0.38s' }}>
            {t('login.form.orContinueWith')}
          </div>

          <div className={styles.socialRow} style={{ animationDelay: '0.44s' }}>
            <button type="button" className={styles.socialButton} onClick={() => startOAuth('google')}>
              <GoogleMark />
              {t('login.form.continueWithGoogle')}
            </button>
            <button type="button" className={styles.socialButton} onClick={() => startOAuth('github')}>
              <Github size={16} />
              {t('login.form.continueWithGithub')}
            </button>
          </div>

          <button
            type="button"
            className={styles.switchMode}
            style={{ animationDelay: '0.5s' }}
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {t(mode === 'login' ? 'auth.login.switch' : 'auth.register.switch')}
          </button>
        </div>
      </section>
    </div>
  );
}
