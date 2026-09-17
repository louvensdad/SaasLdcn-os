'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { DecisionCard } from '@/components/decision-card';
import { EvidenceLine } from '@/components/evidence-line';
import { Signal } from '@/components/signal';
import { Badge, Kv, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { projectStations, type StationId } from '@/lib/project/stations';
import { useProject } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';
import { deriveDecisions } from '@/lib/work/decisions';

export function CockpitScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const { room, abstract, missions, latest, running, kernel, delivery, generatedProjectId } = project;
  const base = `/p/${encodeURIComponent(projectKey)}`;

  const stations = projectStations(project, (id: StationId) => t(`project.station.${id}`), base);
  const decisions = useMemo(() => {
    const summary = room.data
      ? [{
          room_id: room.data.room_id,
          title: room.data.title,
          status: room.data.status,
          delivery_type: room.data.delivery_type,
          locale: room.data.locale,
          degraded: room.data.degraded,
          has_prompt_master: Boolean(room.data.prompt_master_md),
          created_at: room.data.created_at,
          updated_at: room.data.updated_at,
        }]
      : [];
    return deriveDecisions({ rooms: summary, jobs: missions, changes: [] });
  }, [room.data, missions]);

  if (project.missing) {
    return (
      <PageState
        title={t('nav.project')}
        kind="unknown"
        stateTitle={t('project.missing.title')}
        action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href="/projects">{t('nav.projects')}</Link></div>}
      >
        {t('project.missing.body', { key: projectKey })}
      </PageState>
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('project.eyebrow')}</span>
            <span className="chip mono">{projectKey}</span>
            {room.data ? <span className="chip">{room.data.delivery_type}</span> : null}
            {room.data ? <Badge value={room.data.status} family={familyFor(room.data.status)} live={Boolean(running)} /> : null}
          </div>
          <h1 className="display" aria-busy={project.naming || undefined}>{project.name}</h1>
          {abstract.data?.abstract_state ? (
            <p className="lede">{t('project.abstract', { state: abstract.data.abstract_state })}</p>
          ) : null}
        </div>
        <div className="btn-row">
          {latest ? <Link className="btn btn-primary" href={`${base}/missions/${latest.id}`}>{t('project.openMission')}</Link> : null}
          <Link className="btn btn-ghost" href={`${base}/define/discovery`}>{t('project.openRoom')}</Link>
        </div>
      </div>

      {project.unreadable.length > 0 ? <p className="meta">{t('command.unreadable', { sources: project.unreadable.join(' · ') })}</p> : null}

      <section className="sec">
        {project.pending ? <Skeleton lines={2} /> : <EvidenceLine stations={stations} size="lg" />}
        <p className="meta" style={{ marginTop: 10 }}>{t('project.line.note')}</p>
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('project.next.title')}</h2></div>
        {decisions.length === 0 ? (
          <StateBlock kind="empty" title={t('project.next.none')}>{t('project.next.noneBody')}</StateBlock>
        ) : (
          <div className="stack">{decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}</div>
        )}
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('project.definition.title')}</h2>
            <div className="actions">
              <Link className="btn btn-quiet btn-sm" href={`${base}/define/requirements`}>{t('common.open')}</Link>
            </div>
          </div>
          {room.isPending ? <Skeleton lines={4} /> : null}
          {room.data ? (
            <>
              <Kv
                pairs={[
                  [t('project.definition.promptMaster'), room.data.prompt_master_versions.length > 0
                    ? <span key="pm" className="mono">v{room.data.prompt_master_versions[room.data.prompt_master_versions.length - 1]?.version}</span>
                    : <span key="pm" className="meta">{t('common.notYet')}</span>],
                  [t('project.definition.blueprint'), room.data.active_blueprint_version != null
                    ? <span key="bp" className="mono">v{room.data.active_blueprint_version}</span>
                    : <span key="bp" className="meta">{t('common.notYet')}</span>],
                  [t('project.definition.review'), room.data.engineering_review?.generation_readiness
                    ? <Badge key="rv" value={room.data.engineering_review.generation_readiness} family={familyFor(room.data.engineering_review.generation_readiness)} />
                    : <span key="rv" className="meta">{t('common.notYet')}</span>],
                  [t('project.definition.language'), <span key="lg" className="mono">{room.data.preferred_language ?? '—'}</span>],
                  [t('project.definition.profile'), <span key="pf" className="mono">{room.data.execution_profile ?? '—'}</span>],
                  [t('project.definition.questions'), String(room.data.open_questions.length)],
                ]}
              />
              <Source>GET /api/project-rooms/{'{'}room_id{'}'}</Source>
            </>
          ) : null}
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('project.missions.title')}</h2>
            <span className="meta">{t('project.missions.meta', { count: missions.length })}</span>
            <div className="actions"><Link className="btn btn-quiet btn-sm" href={`${base}/missions`}>{t('project.missions.all')}</Link></div>
          </div>
          {project.jobs.isPending ? <Skeleton lines={3} /> : null}
          {!project.jobs.isPending && missions.length === 0 ? (
            <StateBlock kind="empty" title={t('project.missions.none')}>{t('project.missions.noneBody')}</StateBlock>
          ) : null}
          {missions.length > 0 ? (
            <div className="list">
              {missions.slice(0, 4).map((mission) => (
                <Link className="li li-link" key={mission.id} href={`${base}/missions/${mission.id}`}>
                  <Signal family={familyFor(mission.status)} live={!mission.archived && mission.id === running?.id} label={mission.status} />
                  <span className="li-title mono">{mission.id}</span>
                  <span className="meta num">{formatWhen(mission.finishedAt ?? mission.startedAt, locale)}</span>
                  <span className="li-sub">
                    <span className="mono">{mission.status}</span> · {t('project.missions.stage', { stage: mission.currentStage })} · {t('command.evidence.build', { status: mission.buildStatus })}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('project.evidence.title')}</h2>
            <div className="actions"><Link className="btn btn-quiet btn-sm" href={`${base}/evidence`}>{t('project.evidence.open')}</Link></div>
          </div>
          {!generatedProjectId ? (
            <StateBlock kind="empty" title={t('project.evidence.none')}>{t('project.evidence.noneBody')}</StateBlock>
          ) : kernel.isPending ? <Skeleton lines={3} />
            : kernel.isError ? <StateBlock kind="error" title={t('project.evidence.unreadable')} />
              : kernel.data ? (
                <>
                  <Kv
                    pairs={[
                      [t('project.evidence.phase'), <Badge key="ph" value={kernel.data.kernel_phase} family={familyFor(kernel.data.kernel_phase)} />],
                      [t('project.evidence.state'), <Badge key="st" value={kernel.data.state} family={familyFor(kernel.data.state)} />],
                      [t('project.evidence.build'), kernel.data.build_verified ? t('project.evidence.buildYes') : t('project.evidence.buildNo')],
                      [t('project.evidence.blockers'), <span key="bl" className="num">{kernel.data.quality_gate_blocker_count}</span>],
                      [t('project.evidence.items'), <span key="ev" className="num">{kernel.data.evidence.filter((item) => item.available).length} / {kernel.data.evidence.length}</span>],
                    ]}
                  />
                  <p className="meta" style={{ marginTop: 8 }}>{kernel.data.reason}</p>
                  <Source>GET /api/meta-factory/{'{'}project_id{'}'}/engineering-kernel</Source>
                </>
              ) : null}
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('project.delivery.title')}</h2>
            <div className="actions"><Link className="btn btn-quiet btn-sm" href={`${base}/delivery`}>{t('project.delivery.open')}</Link></div>
          </div>
          {!generatedProjectId ? (
            <StateBlock kind="empty" title={t('project.delivery.none')}>{t('project.delivery.noneBody')}</StateBlock>
          ) : delivery.isPending ? <Skeleton lines={3} />
            : delivery.isError ? <StateBlock kind="error" title={t('project.delivery.unreadable')} />
              : delivery.data ? (
                <>
                  <Kv
                    pairs={[
                      [t('project.delivery.mode'), delivery.data.current_profile
                        ? <span key="md" className="mono">{delivery.data.current_profile.delivery_mode}</span>
                        : <span key="md" className="meta">{t('project.delivery.notChosen')}</span>],
                      [t('project.delivery.blocked'), delivery.data.blocked
                        ? <Badge key="bl" value="BLOCKED" family="caution" human={delivery.data.block_reason} />
                        : <Badge key="bl" value={delivery.data.kernel_phase} family={familyFor(delivery.data.kernel_phase)} />],
                      [t('project.delivery.options'), <span key="op" className="num">{delivery.data.options.length}</span>],
                    ]}
                  />
                  <Source>GET /api/meta-factory/{'{'}project_id{'}'}/delivery</Source>
                </>
              ) : null}
        </section>
      </div>
    </>
  );
}
