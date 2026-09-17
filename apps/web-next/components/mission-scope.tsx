'use client';

import Link from 'next/link';

import { HeroLink } from '@/components/hero-link';
import { Icon } from '@/components/signal';
import { Notice, PageState } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import type { MissionScope } from '@/lib/project/mission-scope';

/** The mission a runtime or evidence screen reads for, as the way back to it. Nothing when no mission is named. */
export function ScopeMission({ scope, base }: { readonly scope: MissionScope; readonly base: string }) {
  const { t, locale } = useI18n();
  const mission = scope.kind === 'latest' || scope.kind === 'mission' ? scope.mission : null;
  if (!mission) return null;
  return (
    <HeroLink className="chip chip-link" href={`${base}/missions/${encodeURIComponent(mission.id)}`}>
      {t('scope.mission', { when: formatWhen(mission.createdAt, locale) })}
      <span className="dev-only mono">{mission.id}</span>
      <Icon name="chevron" />
    </HeroLink>
  );
}

/** Said only when the screen reads a project the project tabs would not open. */
export function ScopeNotice({ scope, latestHref }: { readonly scope: MissionScope; readonly latestHref: string }) {
  const { t } = useI18n();
  if (scope.kind !== 'mission' || !scope.earlier) return null;
  return (
    <Notice family="idle" title={t('scope.earlier.title')}>
      <span className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {t('scope.earlier.body')}
        <Link className="btn btn-quiet btn-sm" href={latestHref}>{t('scope.showLatest')}</Link>
      </span>
    </Notice>
  );
}

/** A named mission that could not be matched: the screen says which and why, and offers the latest instead. */
export function ScopeUnresolved({ scope, title, base, latestHref }: {
  readonly scope: Extract<MissionScope, { readonly kind: 'unresolved' }>;
  readonly title: string;
  readonly base: string;
  readonly latestHref: string;
}) {
  const { t } = useI18n();
  return (
    <PageState
      title={title}
      kind="unknown"
      stateTitle={t('scope.unresolved.title')}
      illustration="mission"
      action={(
        <div className="btn-row">
          <Link className="btn btn-ghost btn-sm" href={latestHref}>{t('scope.showLatest')}</Link>
          <Link className="btn btn-quiet btn-sm" href={`${base}/missions`}>{t('nav.missions')}</Link>
        </div>
      )}
    >
      {t(scope.reason === 'unreadable' ? 'scope.unresolved.unreadable' : 'scope.unresolved.foreign', { id: scope.missionId })}
    </PageState>
  );
}

/** A named mission that has not generated a project yet: nothing to read, and the way back to it. */
export function ScopeNoProject({ scope, title, emptyTitle, illustration, base, latestHref }: {
  readonly scope: Extract<MissionScope, { readonly kind: 'mission' }>;
  readonly title: string;
  readonly emptyTitle: string;
  readonly illustration: 'runtime' | 'evidence';
  readonly base: string;
  readonly latestHref: string;
}) {
  const { t, locale } = useI18n();
  return (
    <PageState
      title={title}
      kind="empty"
      stateTitle={emptyTitle}
      illustration={illustration}
      action={(
        <div className="btn-row">
          <Link className="btn btn-ghost btn-sm" href={`${base}/missions/${encodeURIComponent(scope.mission.id)}`}>{t('scope.openMission')}</Link>
          <Link className="btn btn-quiet btn-sm" href={latestHref}>{t('scope.showLatest')}</Link>
        </div>
      )}
    >
      {t('scope.noProject', { when: formatWhen(scope.mission.createdAt, locale) })}
    </PageState>
  );
}
