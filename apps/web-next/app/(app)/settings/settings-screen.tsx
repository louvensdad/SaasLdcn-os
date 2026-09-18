'use client';

import Link from 'next/link';

import { Signal } from '@/components/signal';
import { useI18n } from '@/lib/i18n/i18n';

const SECTIONS = ['ai', 'plan', 'account', 'workspace', 'preferences', 'integrations'] as const;

export function SettingsScreen() {
  const { t } = useI18n();
  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.title')}</h1>
          <p className="lede">{t('settings.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="list">
          {SECTIONS.map((section) => (
            <Link className="li li-link" key={section} href={`/settings/${section}`}>
              <Signal family="idle" label={t(`settings.section.${section}`)} />
              <span className="li-title">{t(`settings.section.${section}`)}</span>
              <span className="meta">{t('common.open')}</span>
              <span className="li-sub">{t(`settings.body.${section}`)}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
