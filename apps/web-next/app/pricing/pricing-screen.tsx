'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { PublicHead } from '@/components/public-head';
import { Signal } from '@/components/signal';
import { Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';

export function PricingScreen() {
  const { t, locale } = useI18n();
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans, retry: false });

  const price = (cents: number | null, currency: string) =>
    cents === null
      ? t('pricing.custom')
      : new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(cents / 100);

  return (
    <div className="public">
      <PublicHead />
      <main className="public-main" id="main">
        <div className="public-inner">
          <div className="page-head">
            <div className="grow">
              <div className="eyebrow"><span className="label">{t('pricing.eyebrow')}</span></div>
              <h1 className="display">{t('pricing.title')}</h1>
              <p className="lede">{t('pricing.lede')}</p>
            </div>
          </div>

          {plans.isPending ? <Skeleton lines={4} /> : null}
          {plans.isError ? <StateBlock kind="error" title={t('pricing.unreadable')} /> : null}

          {plans.data && plans.data.length > 0 ? (
            <div className="plans">
              {plans.data.map((plan) => (
                <article className="plan" key={plan.code}>
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">{price(plan.price_cents, plan.currency)}</div>
                  <p className="meta">{plan.audience}</p>
                  <div className="list" style={{ marginTop: 10 }}>
                    {plan.features.map((feature) => (
                      <div className="li" key={feature}>
                        <Signal family="proof" label={feature} />
                        <span className="li-title">{feature}</span>
                      </div>
                    ))}
                  </div>
                  {Object.keys(plan.limits).length > 0 ? (
                    <div className="chips" style={{ marginTop: 10 }}>
                      {Object.entries(plan.limits).map(([resource, limit]) => (
                        <span className="chip mono" key={resource}>
                          {resource} · {limit === null ? t('settings.plan.entitlements.unlimited') : limit}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          <section className="sec">
            <p className="sentence">{t('pricing.byok')}</p>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <Link className="btn btn-primary" href="/signin?mode=register">{t('pricing.start')}</Link>
              <Link className="btn btn-ghost" href="/signin">{t('signin.tab.signin')}</Link>
            </div>
            <Source>GET /api/billing/plans</Source>
          </section>
        </div>
      </main>
    </div>
  );
}
