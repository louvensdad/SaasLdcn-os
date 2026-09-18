'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Confirm } from '@/components/operate';
import { Signal } from '@/components/signal';
import { Badge, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useStatusLabel } from '@/lib/i18n/status-label';
import { familyFor } from '@/lib/status';

/** Statuses at which the backend accepts the PromptMaster approval (project_room_service.PROMPT_APPROVED_STATUSES). */
const CAN_APPROVE = new Set(['PROMPT_READY', 'UNDER_REVIEW']);
/** Statuses that come before there is anything to approve. Everything else is past the approval. */
const BEFORE_APPROVAL = new Set(['DRAFT', 'SPEC_GENERATING']);

export function RequirementsScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [adjustment, setAdjustment] = useState('');
  const [confirming, setConfirming] = useState(false);
  const say = useStatusLabel();

  const room = useQuery({ queryKey: ['room', projectKey], queryFn: () => api.room(projectKey), retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['room', projectKey] });
  const approve = useMutation({ mutationFn: () => api.approvePrompt(projectKey), onSuccess: refresh });
  const revise = useMutation({ mutationFn: () => api.revisePrompt(projectKey, adjustment.trim()), onSuccess: () => { setAdjustment(''); refresh(); } });

  if (room.isPending) return <Skeleton lines={6} />;
  if (!room.data) {
    return (
      <PageState title={t('nav.requirements')} kind="unknown" stateTitle={t('project.missing.title')}>
        {t('project.missing.body', { key: projectKey })}
      </PageState>
    );
  }

  const data = room.data;
  const versions = [...(data.prompt_master_versions ?? [])].sort((a, b) => b.version - a.version);
  const version = versions[0]?.version ?? 1;
  /* Three states, and the screen says which one it is in rather than greying a button and hoping the
     tooltip is found: the approval is open, it is not open yet, or it was already given. */
  const canApprove = Boolean(data.prompt_master_md) && CAN_APPROVE.has(data.status);
  const approved = Boolean(data.prompt_master_md) && !CAN_APPROVE.has(data.status) && !BEFORE_APPROVAL.has(data.status);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.requirements')}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
            {versions.length > 0 ? <span className="chip mono">v{versions[versions.length - 1]?.version}</span> : null}
          </div>
          <h1 className="title">{t('requirements.title')}</h1>
          <p className="lede">{t('requirements.lede')}</p>
        </div>
        <div className="btn-row">
          {approved ? (
            <Link className="btn btn-primary" href={`/p/${encodeURIComponent(projectKey)}/define/architecture`}>{t('requirements.decision.open')}</Link>
          ) : (
            <button className="btn btn-hand" type="button" disabled={!canApprove || approve.isPending} onClick={() => setConfirming(true)}>
              {approve.isPending ? t('requirements.approving') : t('requirements.approve')}
            </button>
          )}
        </div>
      </div>

      {approve.isError ? <Notice family="fault" title={t('requirements.failed')}>{String(approve.error)}</Notice> : null}

      {data.prompt_master_md ? (
        <div className="decision" style={{ marginBottom: 20 }}>
          <Signal family={approved ? 'proof' : 'hand'} />
          <div className="decision-body">
            <div className="decision-kicker">{t('nav.requirements')}</div>
            <p className="decision-title">
              {approved ? t('requirements.decision.approved') : canApprove ? t('requirements.decision.title') : t('requirements.decision.blocked')}
            </p>
            <p className="decision-why">
              {approved
                ? t('requirements.decision.approvedBody')
                : canApprove
                  ? t('requirements.decision.body', { version })
                  : t('requirements.approveWhen', { status: say(data.status) })}
            </p>
            <div className="decision-actions">
              {approved ? (
                <Link className="btn btn-primary" href={`/p/${encodeURIComponent(projectKey)}/define/architecture`}>{t('requirements.decision.open')}</Link>
              ) : (
                <button className="btn btn-hand" type="button" disabled={!canApprove || approve.isPending} onClick={() => setConfirming(true)}>
                  {approve.isPending ? t('requirements.approving') : t('requirements.approve')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <Confirm
          title={t('requirements.decision.title')}
          scope={t('requirements.decision.scope', { project: data.title, version })}
          confirmLabel={t('requirements.decision.confirm', { version })}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); approve.mutate(); }}
        />
      ) : null}

      {!data.prompt_master_md ? (
        <StateBlock kind="empty" title={t('requirements.none')}>{t('requirements.noneBody')}</StateBlock>
      ) : (
        <div className="grid g-main-side">
          <section className="sec">
            <div className="sec-head"><h2 className="h-sec">{t('requirements.document.title')}</h2></div>
            <pre className="code" style={{ whiteSpace: 'pre-wrap' }}>{data.prompt_master_md}</pre>
            <Source>GET /api/project-rooms/{'{'}room_id{'}'} · prompt_master_md</Source>
          </section>

          <div className="stack-lg">
            <section className="panel">
              <div className="panel-head">
                <h2 className="h-sub">{t('requirements.versions.title')}</h2>
                <span className="meta">{t('requirements.versions.meta', { count: versions.length })}</span>
              </div>
              <div className="panel-body">
                <div className="list">
                  {versions.slice().reverse().map((version) => (
                    <div className="li" key={version.version}>
                      <Signal family="proof" label={`v${version.version}`} />
                      <span className="li-title mono">v{version.version}</span>
                      <span className="meta nowrap">{formatWhen(version.generated_at, locale)}</span>
                      <span className="li-sub">{version.degraded ? t('requirements.versions.degraded') : t('requirements.versions.full')} · {version.sections.length} {t('requirements.versions.sections')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2 className="h-sub">{t('requirements.revise.title')}</h2></div>
              <div className="panel-body stack">
                <label className="field">
                  <span className="sr-only">{t('requirements.revise.label')}</span>
                  <textarea value={adjustment} onChange={(event) => setAdjustment(event.target.value)} rows={3} placeholder={t('requirements.revise.label')} />
                </label>
                <div className="btn-row">
                  <button className="btn btn-ghost" type="button" disabled={revise.isPending || !adjustment.trim()} onClick={() => revise.mutate()}>
                    {revise.isPending ? t('requirements.revise.running') : t('requirements.revise.run')}
                  </button>
                </div>
                <p className="meta">{t('requirements.revise.note')}</p>
                <Source>POST /api/project-rooms/{'{'}room_id{'}'}/revise-prompt</Source>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
