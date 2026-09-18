'use client';

import Link from 'next/link';

import { StateBlock } from '@/components/ui';
import { useI18n } from '@/lib/i18n/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="public">
      <main className="public-main" id="main">
        <div className="public-inner" style={{ maxWidth: 600 }}>
          <StateBlock kind="unknown" title={t('pending.unknownTitle')} action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href="/">{t('nav.home')}</Link></div>}>
            {t('pending.unknownBody', { path: '—' })}
          </StateBlock>
        </div>
      </main>
    </div>
  );
}
