'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useProject } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';

export function MissionsScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const base = `/p/${encodeURIComponent(projectKey)}`;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['jobs'] });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { readonly id: string; readonly archived: boolean }) => api.setJobArchived(id, archived),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => { setConfirming(null); return invalidate(); },
  });

  const rows = project.missions.filter((mission) => showArchived || !mission.archived);
  const archivedCount = project.missions.filter((mission) => mission.archived).length;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.missions')}</span><span className="chip mono">{projectKey}</span></div>
          <h1 className="title">{t('missions.title')}</h1>
          <p className="lede">{t('missions.lede')}</p>
        </div>
        <div className="btn-row">
          <label className="switch">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            <span>{t('missions.showArchived', { count: archivedCount })}</span>
          </label>
        </div>
      </div>

      {project.jobs.isError ? <StateBlock kind="error" title={t('missions.unreadable')} /> : null}
      {project.jobs.isPending ? <Skeleton lines={5} /> : null}
      {!project.jobs.isPending && rows.length === 0 ? (
        <StateBlock kind="empty" title={t('project.missions.none')}>{t('project.missions.noneBody')}</StateBlock>
      ) : null}

      {rows.length > 0 ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('missions.col.mission')}</th>
                <th>{t('missions.col.status')}</th>
                <th>{t('missions.col.build')}</th>
                <th className="r">{t('missions.col.progress')}</th>
                <th>{t('missions.col.started')}</th>
                <th>{t('missions.col.finished')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((mission) => (
                <tr key={mission.id}>
                  <td>
                    <Link href={`${base}/missions/${mission.id}`}><strong>{mission.projectName}</strong></Link>
                    <div className="id">{mission.id} · {mission.currentStage}</div>
                  </td>
                  <td>
                    <Badge value={mission.status} family={familyFor(mission.status)} live={mission.id === project.running?.id} />
                    {mission.archived ? <span className="chip">{t('missions.archived')}</span> : null}
                  </td>
                  <td><Badge value={mission.buildStatus} family={familyFor(mission.buildStatus)} /></td>
                  <td className="r">{mission.progress}%</td>
                  <td className="meta nowrap">{formatWhen(mission.startedAt, locale)}</td>
                  <td className="meta nowrap">{formatWhen(mission.finishedAt, locale)}</td>
                  <td className="r">
                    <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                      <Link className="btn btn-quiet btn-sm" href={`${base}/missions/${mission.id}`}>{t('common.open')}</Link>
                      <button
                        className="btn btn-quiet btn-sm"
                        type="button"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate({ id: mission.id, archived: !mission.archived })}
                      >
                        {mission.archived ? t('missions.unarchive') : t('missions.archive')}
                      </button>
                      {confirming === mission.id ? (
                        <>
                          <button className="btn btn-danger btn-sm" type="button" disabled={remove.isPending} onClick={() => remove.mutate(mission.id)}>
                            {t('missions.confirmDelete')}
                          </button>
                          <button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirming(null)}>{t('common.close')}</button>
                        </>
                      ) : (
                        <button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirming(mission.id)}>{t('missions.delete')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="meta" style={{ marginTop: 12 }}>{t('missions.deleteNote')}</p>
      <Source>GET /api/meta-factory/jobs · PATCH /api/meta-factory/jobs/{'{'}job_id{'}'}/archive · DELETE /api/meta-factory/jobs/{'{'}job_id{'}'}</Source>
    </>
  );
}
