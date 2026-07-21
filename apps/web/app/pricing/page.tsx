'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Clock, GraduationCap, LayoutDashboard, Wallet, XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AccordionItem } from '@/components/ui/accordion';
import { Modal } from '@/components/ui/modal';
import { PageError } from '@/components/feedback/error-system';
import { CurrentSubscriptionCard } from '@/components/billing/current-subscription-card';
import { CancelSubscriptionModal } from '@/components/billing/cancel-subscription-modal';
import { SubscribeConfirmationModal } from '@/components/billing/subscribe-confirmation-modal';
import { PlanComparisonTable } from '@/components/billing/plan-comparison-table';
import { StudentVerificationModal } from '@/components/billing/student-verification-modal';
import { useLocale } from '@/hooks/use-locale';
import { PlanAccessError, billingCatalogClient, type PlanView, type SubscriptionView, type TrialView } from '@/lib/api/billing-catalog';
import { studentEligibilityClient, type StudentVerificationView } from '@/lib/api/student-eligibility';
import { tenantsClient } from '@/lib/api/tenants';
import { useAuthStore } from '@/stores/use-auth-store';
import { useShellStore } from '@/stores/use-shell-store';
import { useUiStore } from '@/stores/use-ui-store';

const PLAN_ORDER = ['STUDENT', 'BASIC', 'ADVANCED', 'PRO'];
const RESUBMITTABLE_STATUSES = ['REJECTED', 'REVALIDATION_REQUIRED', 'EXPIRED'];

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

function planShortDescription(t: (key: string) => string, code: string): string {
  const key = `pricing.shortDescription.${code}`;
  const label = t(key);
  return label === key ? '' : label;
}

function formatPrice(t: (key: string) => string, priceCents: number | null, currency: string): string {
  if (priceCents === null) return t('pricing.plan.priceUndefined');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
}

function formatLimitValue(code: string, value: number | null, configurableLabel: string): string {
  if (value === null) return configurableLabel;
  if (code === 'storage_bytes') return `${Math.round(value / 1024 ** 3)} GB`;
  return String(value);
}

export default function PricingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const setTopbarConfig = useShellStore((state) => state.setTopbarConfig);
  const addToast = useUiStore((state) => state.addToast);
  const authStatus = useAuthStore((state) => state.status);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const authenticated = authStatus === 'authenticated';

  const [plansState, setPlansState] = useState<PlansState>({ status: 'loading' });
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [trial, setTrial] = useState<TrialView | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [studentVerification, setStudentVerification] = useState<StudentVerificationView | null>(null);

  const [subscribeModalPlan, setSubscribeModalPlan] = useState<PlanView | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [detailsPlan, setDetailsPlan] = useState<PlanView | null>(null);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  // Breadcrumb + back-to-Dashboard wiring (item 1/2): the shell's topbarConfig
  // mechanism already existed (stores/use-shell-store.ts) but had no consumer
  // yet -- this page is the first. Cleared on unmount so leaving restores the
  // route-default Topbar title/subtitle.
  useEffect(() => {
    setTopbarConfig({
      title: t('billing.title'),
      subtitle: t('billing.description'),
      breadcrumb: [
        { label: t('navigation.dashboard.label'), href: '/dashboard' },
        { label: t('navigation.settings.label'), href: '/settings' },
        t('billing.title'),
      ],
    });
    return () => setTopbarConfig(null);
  }, [setTopbarConfig, t]);

  function goBack() {
    // window.history.length is NOT a reliable "is there a real previous page"
    // signal -- it is already >1 after a single fresh navigation (the browser's
    // initial blank entry counts). document.referrer being same-origin is the
    // actual safe signal that router.back() lands somewhere inside this app.
    const cameFromThisApp = typeof document !== 'undefined' && document.referrer.startsWith(window.location.origin);
    if (cameFromThisApp) router.back();
    else router.push('/dashboard');
  }

  const loadPlans = useCallback(async (mode: 'initial' | 'retry') => {
    setPlansState({ status: mode === 'retry' ? 'retrying' : 'loading' });
    try {
      const result = await billingCatalogClient.plans();
      const ordered = [...result].sort((a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code));
      setPlansState(ordered.length === 0 ? { status: 'empty' } : { status: 'success', plans: ordered });
    } catch {
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

  const currentPlan = plansState.status === 'success' ? plansState.plans.find((plan) => plan.code === subscription?.plan_code) ?? null : null;
  const studentResubmittable = studentVerification === null || RESUBMITTABLE_STATUSES.includes(studentVerification.student_status);

  async function confirmSubscribe() {
    if (!organizationId || !subscribeModalPlan) return;
    setSubscribing(true);
    try {
      const updated = await billingCatalogClient.subscribe({ plan_code: subscribeModalPlan.code, organization_id: organizationId });
      setSubscription(updated);
      setSubscribeModalPlan(null);
      addToast({ tone: 'success', title: t('billing.subscribeModal.successTitle', { plan: subscribeModalPlan.name }) });
    } catch (caught) {
      addToast({
        tone: 'error',
        title: t('billing.subscribeModal.failureTitle'),
        description: caught instanceof PlanAccessError ? caught.message : t('billing.subscribeModal.failureDescription'),
      });
    } finally {
      setSubscribing(false);
    }
  }

  async function confirmCancel() {
    if (!organizationId) return;
    setCancelling(true);
    try {
      const updated = await billingCatalogClient.cancel(organizationId);
      setSubscription(updated);
      setCancelModalOpen(false);
      addToast({ tone: 'success', title: t('billing.cancelModal.successTitle') });
    } catch {
      addToast({ tone: 'error', title: t('billing.cancelModal.failureTitle') });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Dashboard/Settings/account access is NOT duplicated here for
          authenticated users -- the Sidebar + Topbar breadcrumb (both now
          actually render on this route, which was the whole point of this
          fix) already provide them. Duplicating the same links again here
          would be exactly the "informações repetidas" this redesign was
          meant to remove. "Voltar" is the one affordance neither of those
          can provide, since it is contextual to how THIS page was reached. */}
      <Button type="button" variant="ghost" onClick={goBack} aria-label={t('billing.navigation.back')} className="w-fit px-2">
        <ArrowLeft className="h-4 w-4" />
        {t('billing.navigation.back')}
      </Button>

      <div>
        <h1 className="ds-page-title text-[color:var(--text)]">{t('billing.title')}</h1>
        <p className="ds-body mt-2 max-w-3xl text-[color:var(--muted)]">{t('billing.description')}</p>
      </div>

      {authenticated && subscription ? (
        <CurrentSubscriptionCard
          subscription={subscription}
          plan={currentPlan}
          onChangePlan={() => document.getElementById('plan-grid')?.scrollIntoView({ behavior: 'smooth' })}
          onCancel={() => setCancelModalOpen(true)}
        />
      ) : null}

      {authenticated && trial ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            {trialActive ? <Clock className="h-5 w-5 text-[color:var(--accent)]" aria-hidden /> : <XCircle className="h-5 w-5 text-[color:var(--muted)]" aria-hidden />}
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">
                {trialActive ? t('trial.status.active') : trialExpired ? t('trial.expired.title') : t('trial.status.notStarted')}
              </p>
              {trialActive && trialExpiresIn !== null ? (
                <p className="text-xs text-[color:var(--muted)]">{t('trial.remainingTime', { hours: String(trialExpiresIn) })}</p>
              ) : null}
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

      <div id="plan-grid">
        {plansState.status === 'loading' || plansState.status === 'retrying' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label={t('billing.loading')}>
            {[0, 1, 2, 3].map((index) => (
              <Card key={index} className="flex flex-col gap-3 p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-9 w-full" />
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plansState.plans.map((plan) => {
              const isCurrent = authenticated && subscription?.plan_code === plan.code;
              const shortDescription = planShortDescription(t, plan.code);
              return (
                <Card key={plan.code} data-testid={`plan-card-${plan.code}`} className="relative flex flex-col gap-3 p-5" surface={plan.code === 'PRO' ? 'accent' : 'secondary'}>
                  <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
                    {isCurrent ? <Badge tone="accent">{t('pricing.plan.current')}</Badge> : null}
                    {plan.code === 'PRO' ? <Badge tone="success">{t('pricing.plan.badgeMostComplete')}</Badge> : null}
                    {plan.code === 'STUDENT' ? <Badge tone="warning">{t('pricing.plan.badgeStudentOnly')}</Badge> : null}
                  </div>
                  <div>
                    <p className="ds-caption text-[color:var(--muted)]">{plan.audience}</p>
                    <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{plan.name}</h3>
                    <p className="mt-1.5 text-xl font-bold text-[color:var(--text)]">
                      {formatPrice(t, plan.price_cents, plan.currency)}
                      {plan.price_cents !== null ? <span className="text-xs font-normal text-[color:var(--muted)]"> {t('pricing.perMonth')}</span> : null}
                    </p>
                    {shortDescription ? <p className="mt-1 text-xs text-[color:var(--muted)]">{shortDescription}</p> : null}
                  </div>
                  <ul className="space-y-1">
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--success)]" aria-hidden />
                        {planFeatureLabel(t, feature)}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setDetailsPlan(plan)}
                    className="focus-ring w-fit text-xs font-semibold text-[color:var(--accent)] hover:underline"
                  >
                    {t('billing.pricing.viewAllFeatures')}
                  </button>
                  {plan.code === 'STUDENT' ? (
                    authenticated ? (
                      <Button type="button" variant="secondary" onClick={() => setStudentModalOpen(true)}>
                        <GraduationCap className="h-4 w-4" aria-hidden />
                        {t('billing.student.verify')}
                        {studentVerification ? (
                          <Badge tone={studentVerification.student_status === 'VERIFIED' ? 'success' : studentResubmittable ? 'warning' : 'neutral'} className="ml-1">
                            {t(`studentVerification.status.${studentVerification.student_status === 'PENDING_VERIFICATION' ? 'pending' : studentVerification.student_status === 'VERIFIED' ? 'verified' : studentVerification.student_status === 'REJECTED' ? 'rejected' : studentVerification.student_status === 'REVALIDATION_REQUIRED' ? 'revalidationRequired' : 'expired'}`)}
                          </Badge>
                        ) : null}
                      </Button>
                    ) : null
                  ) : null}
                  {authenticated ? (
                    <Button
                      type="button"
                      variant={isCurrent ? 'secondary' : 'primary'}
                      disabled={isCurrent || !organizationId || (plan.code === 'STUDENT' && studentVerification?.student_status !== 'VERIFIED')}
                      onClick={() => setSubscribeModalPlan(plan)}
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

      {plansState.status === 'success' ? <PlanComparisonTable plans={plansState.plans} /> : null}

      <Card className="flex flex-col gap-3 p-5">
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

      <div className="flex justify-center pb-2">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')}>
          <LayoutDashboard className="h-4 w-4" />
          {t('billing.navigation.backToDashboard')}
        </Button>
      </div>

      <Modal
        open={detailsPlan !== null}
        onClose={() => setDetailsPlan(null)}
        title={detailsPlan ? t('billing.pricing.viewAllFeaturesTitle', { plan: detailsPlan.name }) : ''}
        maxWidthClassName="max-w-lg"
      >
        {detailsPlan ? (
          <div className="space-y-4">
            <div>
              <p className="ds-caption mb-2">{t('billing.pricing.featuresLabel')}</p>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {detailsPlan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--success)]" aria-hidden />
                    {planFeatureLabel(t, feature)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-[color:var(--border)] pt-3">
              <p className="ds-caption mb-2">{t('billing.pricing.limitsLabel')}</p>
              <ul className="space-y-1">
                {Object.entries(detailsPlan.limits).map(([code, value]) => (
                  <li key={code} className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                    <span>{planLimitLabel(t, code)}</span>
                    <span className="font-semibold text-[color:var(--text)]">{formatLimitValue(code, value, t('billing.compare.configurable'))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>

      <SubscribeConfirmationModal
        plan={subscribeModalPlan}
        onClose={() => setSubscribeModalPlan(null)}
        onConfirm={() => void confirmSubscribe()}
        busy={subscribing}
      />

      {subscription ? (
        <CancelSubscriptionModal
          open={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          onConfirm={() => void confirmCancel()}
          busy={cancelling}
          planName={currentPlan?.name ?? subscription.plan_code}
        />
      ) : null}

      <StudentVerificationModal
        open={studentModalOpen}
        onClose={() => setStudentModalOpen(false)}
        verification={studentVerification}
        onSubmitted={setStudentVerification}
      />
    </div>
  );
}
