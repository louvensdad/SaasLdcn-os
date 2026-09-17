'use client';

import { HeroLink } from '@/components/hero-link';
import { Icon, Signal } from '@/components/signal';
import { Source } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { currentAppUrl } from '@/lib/routes';
import type { Decision } from '@/lib/work/decisions';

/** One thing only a person can move forward: what it is, why it is waiting, and where it is decided. */
export function DecisionCard({ decision }: { readonly decision: Decision }) {
  const { t, tDynamic, locale } = useI18n();
  const title = tDynamic(`inbox.rule.${decision.rule}`, { project: decision.project });
  return (
    <article className="decision">
      <Signal family="hand" label={title} />
      <div className="decision-body">
        <div className="decision-kicker">
          {t(`inbox.filter.${decision.kind}`)} · <span className="mono">{decision.state}</span>
        </div>
        <h3 className="decision-title">{title}</h3>
        <p className="decision-why">{tDynamic(`inbox.why.${decision.rule}`, { state: decision.state })}</p>
        <div className="decision-meta">
          <span className="meta">{t('inbox.at', { when: formatWhen(decision.at, locale) })}</span>
          <Source>{decision.source}</Source>
        </div>
        <div className="decision-actions">
          {decision.href ? (
            <HeroLink className="btn btn-hand btn-sm" href={decision.href} hero={(link) => link.closest('.decision')?.querySelector<HTMLElement>('.decision-title')}>{t('inbox.decide')}</HeroLink>
          ) : (
            /* Only a change request whose generated project has no mission lands here: nothing in this app can
               resolve it to a project screen, so the decision is taken where it already lives. */
            <a className="btn btn-hand btn-sm ext-mark" href={currentAppUrl(decision.current)}>
              {t('inbox.decideThere')} <Icon name="external" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
