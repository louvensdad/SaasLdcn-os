'use client';

import { useQuery } from '@tanstack/react-query';

import { Signal } from '@/components/signal';
import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatCount, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function PlanScreen() {
  const { t, locale } = useI18n();
  const trial = useQuery({ queryKey: ['trial'], queryFn: api.trial, retry: false });
  const subscription = useQuery({ queryKey: ['subscription'], queryFn: api.subscription, retry: false });
  const usage = useQuery({ queryKey: ['billing-usage'], queryFn: api.billingUsage, retry: false });
  const entitlements = useQuery({ queryKey: ['entitlements'], queryFn: api.entitlements, retry: false });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.plan.title')}</h1>
          <p className="lede">{t('settings.plan.lede')}</p>
        </div>
      </div>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('settings.plan.subscription.title')}</h2>
            {subscription.data ? <Badge value={subscription.data.status} family={familyFor(subscription.data.status)} /> : null}
          </div>
          {subscription.isPending ? <Skeleton lines={3} /> : null}
          {!subscription.isPending && !subscription.data ? (
            <StateBlock kind="empty" title={t('settings.plan.subscription.none')}>{t('settings.plan.subscription.noneBody')}</StateBlock>
          ) : null}
          {subscription.data ? (
            <Kv
              pairs={[
                [t('settings.plan.subscription.plan'), <span key="p" className="mono">{subscription.data.plan_code}</span>],
                [t('settings.plan.subscription.started'), formatWhen(subscription.data.started_at, locale)],
                [t('settings.plan.subscription.period'), subscription.data.current_period_end ? formatWhen(subscription.data.current_period_end, locale) : '—'],
                [t('settings.plan.subscription.cancelled'), subscription.data.cancelled_at ? formatWhen(subscription.data.cancelled_at, locale) : t('settings.plan.subscription.notCancelled')],
              ]}
            />
          ) : null}
          <Source>GET /api/billing/subscription</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('settings.plan.trial.title')}</h2>
            {trial.data ? <Badge value={trial.data.status} family={familyFor(trial.data.status)} /> : null}
          </div>
          {trial.isPending ? <Skeleton lines={3} /> : null}
          {!trial.isPending && !trial.data ? (
            <StateBlock kind="empty" title={t('settings.plan.trial.none')}>{t('settings.plan.trial.noneBody')}</StateBlock>
          ) : null}
          {trial.data ? (
            <Kv
              pairs={[
                [t('settings.plan.trial.started'), formatWhen(trial.data.started_at, locale)],
                [t('settings.plan.trial.expires'), formatWhen(trial.data.expires_at, locale)],
                [t('settings.plan.trial.converted'), trial.data.converted_at ? formatWhen(trial.data.converted_at, locale) : t('common.notYet')],
              ]}
            />
          ) : null}
          <Source>GET /api/billing/trial</Source>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.plan.entitlements.title')}</h2>
          <span className="meta">{t('settings.plan.entitlements.meta', { count: entitlements.data?.length ?? 0 })}</span>
        </div>
        {entitlements.isPending ? <Skeleton lines={3} /> : null}
        {entitlements.data && entitlements.data.length > 0 ? (
          <div className="list">
            {entitlements.data.map((entitlement) => (
              <div className="li" key={entitlement.resource_type}>
                <Signal family={entitlement.allowed ? 'proof' : 'caution'} label={entitlement.resource_type} />
                <span className="li-title mono">{entitlement.resource_type}</span>
                <span className="meta num">
                  {formatCount(entitlement.used, locale)}
                  {entitlement.monthly_limit == null ? ` / ${t('settings.plan.entitlements.unlimited')}` : ` / ${formatCount(entitlement.monthly_limit, locale)}`}
                </span>
                <span className="li-sub">
                  {entitlement.allowed ? t('settings.plan.entitlements.allowed') : t('settings.plan.entitlements.blocked')}
                  {' · '}
                  {t('settings.plan.entitlements.period', { when: formatWhen(entitlement.period_start, locale, false) })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('settings.plan.entitlements.note')}</p>
        <Source>GET /api/billing/entitlements</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.plan.usage.title')}</h2>
          {usage.data ? <span className="meta">{t('settings.plan.usage.since', { when: formatWhen(usage.data.period_start, locale, false) })}</span> : null}
        </div>
        {usage.isPending ? <Skeleton lines={3} /> : null}
        {usage.data && usage.data.items.length > 0 ? (
          <div className="facts">
            {usage.data.items.map((item) => (
              <div className="fact" key={item.resource_type}>
                <span className="label">{item.resource_type}</span>
                <div className="v num">{formatCount(item.quantity, locale)} <small>{item.unit}</small></div>
              </div>
            ))}
          </div>
        ) : null}
        {usage.data && usage.data.items.length === 0 ? <p className="meta">{t('settings.plan.usage.none')}</p> : null}
        <Source>GET /api/billing/usage</Source>
      </section>
    </>
  );
}
