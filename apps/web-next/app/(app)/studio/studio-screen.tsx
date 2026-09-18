'use client';

import Link from 'next/link';

import { Icon } from '@/components/signal';
import { useI18n } from '@/lib/i18n/i18n';

/** The two studios that exist. Both live here now; the row says which backend answers each. */
const SECTIONS = [
  { id: 'data', href: '/studio/data', source: 'GET /api/data-intelligence/sessions' },
  { id: 'automations', href: '/studio/automations', source: 'GET /api/automations' },
] as const;

export function StudioScreen() {
  const { t } = useI18n();
  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.studio')}</span></div>
          <h1 className="title">{t('studio.title')}</h1>
          <p className="lede">{t('studio.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="list">
          {SECTIONS.map((section) => (
            <div className="li" key={section.id}>
              <Icon name="chevron" className="sig" />
              <span className="li-title"><Link href={section.href}>{t(`studio.section.${section.id}`)}</Link></span>
              <span className="meta">
                <Link className="btn btn-quiet btn-sm" href={section.href}>{t('common.open')}</Link>
              </span>
              <span className="li-sub">{t(`studio.body.${section.id}`)}</span>
              <div className="chips"><span className="chip mono">{section.source}</span></div>
            </div>
          ))}
        </div>
      </section>

      <p className="meta" style={{ marginTop: 16 }}>{t('studio.note')}</p>
    </>
  );
}
