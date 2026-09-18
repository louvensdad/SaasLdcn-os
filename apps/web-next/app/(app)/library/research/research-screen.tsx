'use client';

import { Signal } from '@/components/signal';
import { GapChip, Notice, Source } from '@/components/ui';
import { useI18n } from '@/lib/i18n/i18n';

/**
 * The backend's own trust vocabulary (`app/registry/trusted_source_registry.py`), ordered by the rank it
 * assigns in a conflict. This is the contract's vocabulary, not a list of sources: the registry's CONTENT
 * has no HTTP endpoint, so this screen shows what the words mean and refuses to invent the rows (G3).
 */
const SOURCE_CLASSES = [
  { id: 'SECURITY_AUTHORITY', rank: 6, family: 'proof' },
  { id: 'OFFICIAL', rank: 5, family: 'proof' },
  { id: 'VENDOR_SECURITY', rank: 5, family: 'proof' },
  { id: 'STANDARD', rank: 5, family: 'proof' },
  { id: 'PRIMARY', rank: 4, family: 'pulse' },
  { id: 'TRUSTED_SECONDARY', rank: 3, family: 'caution' },
  { id: 'COMMUNITY', rank: 1, family: 'caution' },
  { id: 'UNKNOWN', rank: 1, family: 'unknown' },
  { id: 'BLOCKED', rank: 0, family: 'stop' },
] as const;

/** The severities a real OSV finding can carry, from `generation-validation.contract.ts`. */
const SEVERITIES = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN'] as const;

export function ResearchScreen() {
  const { t } = useI18n();

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('research.title')}</h1>
          <p className="lede">{t('research.lede')}</p>
        </div>
      </div>

      <Notice family="unknown" title={t('research.gap.title')}>
        {t('research.gap.body')}
        <GapChip id="G3" detail={t('research.gap.detail')} />
      </Notice>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('research.trust.title')}</h2>
          <span className="meta">{t('research.trust.meta')}</span>
        </div>
        <p className="body ink2">{t('research.trust.lede')}</p>
        {/* A legend, not a reading: these glyphs explain what each word means, they do not report a verdict. */}
        <div className="list" data-legend="">
          {SOURCE_CLASSES.map((entry) => (
            <div className="li" key={entry.id}>
              <Signal family={entry.family} label={entry.id} />
              <span className="li-title mono">{entry.id}</span>
              <span className="meta mono">{t('research.trust.rank', { rank: entry.rank })}</span>
              <span className="li-sub">{t(`research.trust.${entry.id}`)}</span>
            </div>
          ))}
        </div>
        <p className="meta">{t('research.trust.note')}</p>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('research.dependency.title')}</h2>
        </div>
        <p className="body ink2">{t('research.dependency.lede')}</p>
        <div className="chips">
          {SEVERITIES.map((severity) => <span className="chip mono" key={severity}>{severity}</span>)}
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('research.dependency.where')}</p>
        <Source>{t('research.dependency.source')}</Source>
      </section>

      <p className="meta" style={{ marginTop: 16 }}>{t('research.note')}</p>
    </>
  );
}
