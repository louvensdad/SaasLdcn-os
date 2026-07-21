'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, GraduationCap, ShieldCheck, Wallet, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { useLocale } from '@/hooks/use-locale';
import { billingCatalogClient, type PlanView, type SubscriptionView, type TrialView } from '@/lib/api/billing-catalog';
import { studentEligibilityClient, type StudentVerificationView } from '@/lib/api/student-eligibility';
import { tenantsClient } from '@/lib/api/tenants';
import { useAuthStore } from '@/stores/use-auth-store';

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function formatPrice(priceCents: number | null, currency: string, undefinedLabel: string): string {
  if (priceCents === null) return undefinedLabel;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
}

// Public route (vault: "Rotas públicas: /{locale}/pricing") -- visible to
// signed-out visitors too. Trial/subscription/student-verification state is
// only fetched once an authenticated session is confirmed.
export default function PricingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const authenticated = authStatus === 'authenticated';

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [trial, setTrial] = useState<TrialView | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [studentVerification, setStudentVerification] = useState<StudentVerificationView | null>(null);
  const [studentDocument, setStudentDocument] = useState('');
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyPlanCode, setBusyPlanCode] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  async function load() {
    try {
      const plansResult = await billingCatalogClient.plans();
      setPlans(plansResult);
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught, t('pricing.error.description')));
      return;
    }
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
    } catch (caught) {
      setLoadError(errorMessage(caught, t('pricing.error.description')));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

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
      setLoadError(null);
      void load();
    } catch (caught) {
      setLoadError(errorMessage(caught, t('pricing.error.description')));
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

  async function handleSubmitStudentDocument() {
    if (!studentDocument.trim()) return;
    setStudentBusy(true);
    setStudentError(null);
    try {
      const record = await studentEligibilityClient.submit({ student_document: studentDocument.trim() });
      setStudentVerification(record);
      setStudentDocument('');
    } catch (caught) {
      setStudentError(errorMessage(caught, t('pricing.student.error')));
    } finally {
      setStudentBusy(false);
    }
  }

  const studentResubmittable =
    studentVerification === null || ['REJECTED', 'REVALIDATION_REQUIRED', 'EXPIRED'].includes(studentVerification.student_status);

  return (
    <div className="space-y-8">
      <SectionHeader title={t('pricing.title')} description={t('pricing.description')} />

      {loadError ? <PageError title={t('pricing.error.title')} description={loadError} onRetry={() => void load()} /> : null}

      {authenticated && trial ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div className="flex items-center gap-3">
            {trialActive ? <Clock className="h-5 w-5 text-[color:var(--accent)]" aria-hidden /> : <XCircle className="h-5 w-5 text-[color:var(--muted)]" aria-hidden />}
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">
                {trialActive ? t('pricing.trial.active') : trialExpired ? t('pricing.trial.expired') : t('pricing.trial.status')}
              </p>
              {trialActive && trialExpiresIn !== null ? (
                <p className="text-xs text-[color:var(--muted)]">{t('pricing.trial.hoursRemaining', { hours: String(trialExpiresIn) })}</p>
              ) : null}
              {trialExpired ? <p className="text-xs text-[color:var(--muted)]">{t('pricing.trial.expiredDescription')}</p> : null}
            </div>
          </div>
          <Badge tone={trialActive ? 'success' : 'neutral'}>{trial.status}</Badge>
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

      {!plans ? (
        <Card className="p-6"><p className="text-sm text-[color:var(--muted)]">{t('pricing.loading')}</p></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = authenticated && subscription?.plan_code === plan.code;
            return (
              <Card key={plan.code} className="flex flex-col gap-4 p-6">
                <div>
                  <p className="ds-caption text-[color:var(--muted)]">{plan.audience}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[color:var(--text)]">{plan.name}</h3>
                  <p className="mt-2 text-2xl font-bold text-[color:var(--text)]">
                    {formatPrice(plan.price_cents, plan.currency, t('pricing.commercialPolicy'))}
                    {plan.price_cents !== null ? <span className="text-sm font-normal text-[color:var(--muted)]"> {t('pricing.perMonth')}</span> : null}
                  </p>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--success)]" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="space-y-1 border-t border-[color:var(--border)] pt-3 text-xs text-[color:var(--muted)]">
                  {Object.entries(plan.limits).filter(([, value]) => value !== null).map(([code, value]) => (
                    <p key={code}>{code}: <span className="font-semibold text-[color:var(--text)]">{value}</span></p>
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

      {authenticated ? (
        <Card className="flex flex-col gap-3 p-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('pricing.student.title')}</p>
              <p className="text-xs text-[color:var(--muted)]">{t('pricing.student.description')}</p>
            </div>
          </div>

          {studentVerification ? (
            <p className="text-xs text-[color:var(--muted)]">
              {t('pricing.student.status', { status: studentVerification.student_status })}
              {studentVerification.student_notes ? ` — ${studentVerification.student_notes}` : ''}
            </p>
          ) : null}

          {studentResubmittable ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={studentDocument}
                onChange={(event) => setStudentDocument(event.target.value)}
                placeholder={t('pricing.student.documentPlaceholder')}
                className="min-w-[240px] flex-1 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm text-[color:var(--text)]"
              />
              <Button type="button" variant="secondary" loading={studentBusy} onClick={() => void handleSubmitStudentDocument()}>
                {t('pricing.student.submit')}
              </Button>
            </div>
          ) : null}
          {studentError ? <p className="text-xs text-[color:var(--danger)]">{studentError}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
