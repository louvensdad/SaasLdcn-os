'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/signal';
import { PageState } from '@/components/ui';
import { useI18n } from '@/lib/i18n/i18n';
import { currentAppUrl, destinationFor } from '@/lib/routes';

/** A destination of the approved design that this app does not have yet: say when it arrives and where it lives now. */
export default function PendingDestinationPage() {
  const pathname = usePathname();
  const { t } = useI18n();
  const destination = destinationFor(pathname);

  if (!destination || destination.built) {
    return (
      <PageState
        title={t('app.name')}
        kind="unknown"
        stateTitle={t('pending.unknownTitle')}
        action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href="/">{t('nav.home')}</Link></div>}
      >
        {t('pending.unknownBody', { path: pathname })}
      </PageState>
    );
  }

  const screen = t(destination.label);
  return (
    <div className="page-head">
      <div className="grow">
        <div className="eyebrow"><span className="label">{t('pending.eyebrow')}</span></div>
        <h1 className="title">{t('pending.title', { screen })}</h1>
        <p className="lede">{t('pending.body', { screen, wave: destination.wave })}</p>
      </div>
      <div className="btn-row">
        <a className="btn btn-primary ext-mark" href={currentAppUrl(destination.current)}>{t('pending.open')} <Icon name="external" /></a>
        <Link className="btn btn-ghost" href={`/learn/${destination.guide}`}>{t('pending.learn')}</Link>
      </div>
    </div>
  );
}
