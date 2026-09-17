'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { PublicHead } from '@/components/public-head';
import { Icon } from '@/components/signal';
import { GapChip, Kv, Notice, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { currentAppUrl } from '@/lib/routes';

/** The backend serves the accepted policy VERSION, never the text — so this page says so instead of inventing terms. */
export function LegalScreen({ document }: { readonly document: 'privacy' | 'terms' }) {
  const { t } = useI18n();
  const policy = useQuery({ queryKey: ['policy'], queryFn: api.policy, retry: false });

  return (
    <div className="public">
      <PublicHead />
      <main className="public-main" id="main">
        <div className="public-inner">
          <div className="page-head">
            <div className="grow">
              <div className="eyebrow">
                <span className="label">{t('legal.eyebrow')}</span>
                <GapChip id="G22" detail={t('legal.gap')} />
              </div>
              <h1 className="title">{t(`legal.${document}.title`)}</h1>
              <p className="lede">{t(`legal.${document}.lede`)}</p>
            </div>
          </div>

          <section className="sec">
            <Kv
              pairs={[
                [t('legal.version'), policy.data ? <span key="v" className="mono">{policy.data.version}</span> : <span key="v" className="meta">{t('signin.policyLoading')}</span>],
              ]}
            />
            <Notice family="caution" title={t('legal.noText.title')}>{t('legal.noText.body')}</Notice>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <a className="btn btn-primary ext-mark" href={currentAppUrl(document === 'privacy' ? '/privacy' : '/terms')}>
                {t('legal.read')} <Icon name="external" />
              </a>
              <Link className="btn btn-ghost" href={document === 'privacy' ? '/legal/terms' : '/legal/privacy'}>
                {t(document === 'privacy' ? 'legal.terms.title' : 'legal.privacy.title')}
              </Link>
            </div>
            <Source>GET /api/auth/policy</Source>
          </section>
        </div>
      </main>
    </div>
  );
}
