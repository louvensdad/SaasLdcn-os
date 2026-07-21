'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, GraduationCap, ShieldCheck, Wallet, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccordionItem } from '@/components/ui/accordion';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { StudentDocumentUpload } from '@/components/billing/student-document-upload';
import { useLocale } from '@/hooks/use-locale';
import { billingCatalogClient, type PlanView, type SubscriptionView, type TrialView } from '@/lib/api/billing-catalog';
import { studentEligibilityClient, type StudentVerificationView } from '@/lib/api/student-eligibility';
import { tenantsClient } from '@/lib/api/tenants';
import { useAuthStore } from '@/stores/use-auth-store';

type PlansState =
  | { status: 'loading' }
  | { status: 'retrying' }
  | { status: 'success'; plans: PlanView[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

function planFeatureLabel(t: (key: string) => string, code: string): string {
  const key = `pricing.feature.${code}`;
  const label = t(key);
  return label === key ? code : label;
}

function planLimitLabel(t: (key: string) => string, code: string): string {
  const key = `pricing.limit.${code}`;
  const label = t(key);
  return label === key ? code : label;
}

function formatPrice(t: (key: string) => string, priceCents: number | null, currency: string): string {
  if (priceCents === null) return t('pricing.plan.priceUndefined');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
}

export default function PricingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const authenticated = authStatus === 'authenticated';

  const [plansState, setPlansState] = useState<PlansState>({ status: 'loading' });
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [trial, setTrial] = useState<TrialView | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [studentVerification, setStudentVerification] = useState<StudentVerificationView | null>(null);
  const [busyPlanCode, setBusyPlanCode] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  const loadPlans = useCallback(async (mode: 'initial' | 'retry') => {
    setPlansState({ status: mode === 'retry' ? 'retrying' : 'loading' });
    try {
      const result = await billingCatalogClient.plans();
      setPlansState(result.length === 0 ? { status: 'empty' } : { status: 'success', plans: result });
    } catch {
      // Never surface the raw network/HTTP error (e.g. "Failed to fetch") --
      // it is logged for diagnostics but the user only ever sees a safe,
      // localized, actionable message (correction brief, item 1).
      console.error('[pricing] failed to load plan catalog');
      setPlansState({ status: 'error', message: t('billing.loadError.description') });
    }
  }, [t]);

  useEffect(() => {
    void loadPlans('initial');
  }, [loadPlans]);

  const loadAccountContext = useCallback(async () => {
    if (!authenticated) {
      setOrganizationId(null);
      setTrial(null);
      setSubscription(null);
      setStudentVerification(null);
      return;
    }
    try {
      const organizations = await tenantsClient.organizations();
      const primary = organizations.find((org) => org.role === 'owner') ?? organizations[0] ?? null;
      const orgId = primary?.organization_id ?? null;
      setOrganizationId(orgId);
      const [trialResult, subscriptionResult, studentResult] = await Promise.all([
        billingCatalogClient.trial(),
        orgId ? billingCatalogClient.subscription(orgId) : Promise.resolve(null),
        studentEligibilityClient.get(),
      ]);
      setTrial(trialResult);
      setSubscription(subscriptionResult);
      setStudentVerification(studentResult);
    } catch {
      // Account context (trial/subscription/student status) is secondary to
      // the plan catalog above -- degrade silently rather than blocking the
      // whole page on a logged-in user's personal data failing to load.
      console.error('[pricing] failed to load account billing context');
    }
  }, [authenticated]);

  useEffect(() => {
    void loadAccountContext();
  }, [loadAccountContext]);

  const trialActive = trial?.status === 'ACTIVE';
  const trialExpired = trial?.status === 'EXPIRED';

  const trialExpiresIn = useMemo(() => {
    if (!trial || !trialActive) return null;
    const ms = new Date(trial.expires_at).getTime() - Date.now();
    if (ms <= 0) return null;
    return Math.max(1, Math.round(ms / 3_600_000));
  }, [trial, trialActive]);

  async function handleSubscribe(planCode: string) {
    if (!organizationId) return;
    setBusyPlanCode(planCode);
    try {
      const updated = await billingCatalogClient.subscribe({ plan_code: planCode, organization_id: organizationId });
      setSubscription(updated);
    } catch {
      console.error('[pricing] failed to subscribe to plan', planCode);
    } finally {
      setBusyPlanCode(null);
    }
  }

  async function handleCancel() {
    if (!organizationId) return;
    setCancelling(true);
    try {
      const updated = await billingCatalogClient.cancel(organizationId);
      setSubscription(updated);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <SectionHeader title={t('billing.title')} description={t('billing.description')} />

      {authenticated && trial ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div className="flex items-center gap-3">
            {trialActive ? <Clock className="h-5 w-5 text-[color:var(--accent)]" aria-hidden /> : <XCircle className="h-5 w-5 text-[color:var(--muted)]" aria-hidden />}
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">
                {trialActive ? t('trial.status.active') : trialExpired ? t('trial.expired.title') : t('trial.status.notStarted')}
              </p>
              {trialActive && trialExpiresIn !== null ? (
                <p className="text-xs text-[color:var(--muted)]">{t('trial.remainingTime', { hours: String(trialExpiresIn) })}</p>
              ) : null}
              {trialActive ? <p className="mt-1 text-xs text-[color:var(--muted)]">{t('trial.available.resources')}</p> : null}
              {trialExpired ? <p className="text-xs text-[color:var(--muted)]">{t('trial.expired.description')}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={trialActive ? 'success' : 'neutral'}>{trial.status}</Badge>
            {trialExpired ? (
              <Button type="button" variant="primary" onClick={() => document.getElementById('plan-grid')?.scrollIntoView({ behavior: 'smooth' })}>
                {t('trial.cta.choosePlan')}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {authenticated && subscription ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-[color:var(--success)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('pricing.subscription.current', { plan: subscription.plan_code })}</p>
              <p className="text-xs text-[color:var(--muted)]">{t('pricing.subscription.since', { date: subscription.started_at.slice(0, 10) })}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" loading={cancelling} onClick={() => void handleCancel()}>
            {t('pricing.subscription.cancel')}
          </Button>
        </Card>
      ) : null}

      <div id="plan-grid">
        {plansState.status === 'loading' || plansState.status === 'retrying' ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label={t('billing.loading')}>
            {[0, 1, 2, 3].map((index) => (
              <Card key={index} className="flex flex-col gap-4 p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : plansState.status === 'error' ? (
          <PageError
            title={t('billing.loadError.title')}
            description={plansState.message}
            actionLabel={t('billing.retry')}
            onRetry={() => void loadPlans('retry')}
          />
        ) : plansState.status === 'empty' ? (
          <Card className="p-6"><p className="text-sm text-[color:var(--muted)]">{t('billing.empty.description')}</p></Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plansState.plans.map((plan) => {
              const isCurrent = authenticated && subscription?.plan_code === plan.code;
              return (
                <Card key={plan.code} className="relative flex flex-col gap-4 p-6" surface={plan.code === 'PRO' ? 'accent' : 'secondary'}>
                  <div className="absolute right-4 top-4 flex flex-col items-end gap-1">
                    {isCurrent ? <Badge tone="accent">{t('pricing.plan.current')}</Badge> : null}
                    {plan.code === 'PRO' ? <Badge tone="success">{t('pricing.plan.badgeMostComplete')}</Badge> : null}
                    {plan.code === 'STUDENT' ? <Badge tone="warning">{t('pricing.plan.badgeStudentOnly')}</Badge> : null}
                  </div>
                  <div>
                    <p className="ds-caption text-[color:var(--muted)]">{plan.audience}</p>
                    <h3 className="mt-1 text-xl font-semibold text-[color:var(--text)]">{plan.name}</h3>
                    <p className="mt-2 text-2xl font-bold text-[color:var(--text)]">
                      {formatPrice(t, plan.price_cents, plan.currency)}
                      {plan.price_cents !== null ? <span className="text-sm font-normal text-[color:var(--muted)]"> {t('pricing.perMonth')}</span> : null}
                    </p>
                    {plan.code === 'STUDENT' ? <p className="mt-2 ds-caption">{t('pricing.student.verificationRequired')}</p> : null}
                  </div>
                  <ul className="flex-1 space-y-1.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--success)]" aria-hidden />
                        {planFeatureLabel(t, feature)}
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-1 border-t border-[color:var(--border)] pt-3 text-xs text-[color:var(--muted)]">
                    {Object.entries(plan.limits).filter(([, value]) => value !== null).map(([code, value]) => (
                      <p key={code}>{planLimitLabel(t, code)}: <span className="font-semibold text-[color:var(--text)]">{value}</span></p>
                    ))}
                  </div>
                  {authenticated ? (
                    <Button
                      type="button"
                      variant={isCurrent ? 'secondary' : 'primary'}
                      disabled={isCurrent || !organizationId}
                      loading={busyPlanCode === plan.code}
                      onClick={() => void handleSubscribe(plan.code)}
                    >
                      <Wallet className="h-4 w-4" aria-hidden />
                      {isCurrent ? t('pricing.plan.current') : t('pricing.plan.subscribe')}
                    </Button>
                  ) : (
                    <Button type="button" variant="primary" onClick={() => router.push('/login')}>
                      <Wallet className="h-4 w-4" aria-hidden />
                      {t('pricing.plan.signUp')}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {authenticated ? (
        <Card className="flex flex-col gap-3 p-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('pricing.student.title')}</p>
              <p className="text-xs text-[color:var(--muted)]">{t('pricing.student.description')}</p>
            </div>
          </div>
          <StudentDocumentUpload verification={studentVerification} onSubmitted={setStudentVerification} />
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3 p-6">
        <p className="text-sm font-semibold text-[color:var(--text)]">{t('billing.faq.title')}</p>
        <div className="space-y-2">
          <AccordionItem title={t('billing.faq.trial.question')}>
            <p className="ds-caption">{t('billing.faq.trial.answer')}</p>
          </AccordionItem>
          <AccordionItem title={t('billing.faq.student.question')}>
            <p className="ds-caption">{t('billing.faq.student.answer')}</p>
          </AccordionItem>
          <AccordionItem title={t('billing.faq.cancel.question')}>
            <p className="ds-caption">{t('billing.faq.cancel.answer')}</p>
          </AccordionItem>
        </div>
      </Card>
    </div>
  );
}
