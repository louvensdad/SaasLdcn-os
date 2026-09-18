'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useProject } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';

export function ChangesScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const base = `/p/${encodeURIComponent(projectKey)}/engineering/changes`;
  const changes = useQuery({ queryKey: ['change-requests'], queryFn: api.changeRequests, retry: false });

  /* A change request is filed against the generated project or the room, depending on where it started. */
  const ids = new Set([projectKey, project.generatedProjectId].filter(Boolean) as string[]);
  const mine = (changes.data ?? []).filter((change) => ids.has(change.project_id));

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.changes')}</span><span className="chip mono">{projectKey}</span></div>
          <h1 className="title">{t('changes.title')}</h1>
          <p className="lede">{t('changes.lede')}</p>
        </div>
      </div>

      {changes.isPending ? <Skeleton lines={4} /> : null}
      {changes.isError ? <StateBlock kind="error" title={t('changes.unreadable')} /> : null}
      {!changes.isPending && mine.length === 0 ? (
        <StateBlock kind="empty" title={t('changes.none')}>{t('changes.noneBody')}</StateBlock>
      ) : null}

      {mine.length > 0 ? (
        <div className="list">
          {mine.map((change) => (
            <Link className="li li-link" key={change.change_request_id} href={`${base}/${encodeURIComponent(change.change_request_id)}`}>
              <Signal family={familyFor(change.status)} label={change.intent} />
              <span className="li-title">{change.intent}</span>
              <span className="meta"><Badge value={change.status} family={familyFor(change.status)} /></span>
              <span className="li-sub">
                <span className="mono">{change.change_request_id}</span> · {formatWhen(change.updated_at, locale)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
      <p className="meta" style={{ marginTop: 12 }}>{t('changes.note')}</p>
      <Source>GET /api/change-requests</Source>
    </>
  );
}
