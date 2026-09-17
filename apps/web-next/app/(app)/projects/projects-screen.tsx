'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';

import { MissionLine } from '@/components/mission-line';
import { Icon, Signal } from '@/components/signal';
import { Badge, GapChip, Skeleton, Source, StateBlock } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor, isRunning } from '@/lib/status';
import { projectLine } from '@/lib/work/mission-line';
import { useWork } from '@/lib/work/use-work';

/** Everything being built, one row per project with its mission line; a row opens onto the missions behind it. */
export function ProjectsScreen() {
  const { t, locale } = useI18n();
  const { projects, unreadable, pending } = useWork();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.projects')}</span>
            <GapChip id="G5" detail={t('projects.gap')} />
          </div>
          <h1 className="title">{t('projects.title')}</h1>
          <p className="lede">{t('projects.lede')}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-primary" href="/new">{t('command.startWork')}</Link>
        </div>
      </div>

      {unreadable.length > 0 ? <p className="meta">{t('command.unreadable', { sources: unreadable.join(' · ') })}</p> : null}

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('projects.count', { count: projects.length })}</h2>
        </div>
        {pending ? <Skeleton lines={5} /> : null}
        {!pending && projects.length === 0 ? (
          <StateBlock kind="empty" title={t('projects.empty')}>{t('projects.emptyBody')}</StateBlock>
        ) : null}
        {projects.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  <th>{t('projects.col.project')}</th>
                  <th className="proj-line">{t('projects.col.line')}</th>
                  <th>{t('projects.col.state')}</th>
                  <th>{t('projects.col.room')}</th>
                  <th className="r">{t('projects.col.missions')}</th>
                  <th>{t('projects.col.updated')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((row) => {
                  const expanded = open.has(row.key);
                  const detailId = `missions-${row.key}`;
                  return (
                    <Fragment key={row.key}>
                      <tr>
                        <td>
                          <button
                            className="iconbtn proj-toggle"
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={detailId}
                            aria-label={t(expanded ? 'projects.collapse' : 'projects.expand', { project: row.name })}
                            onClick={() => toggle(row.key)}
                          >
                            <Icon name="chevron" />
                          </button>
                        </td>
                        <td>
                          <Link href={`/p/${encodeURIComponent(row.key)}`}><strong>{row.name}</strong></Link>
                          <div className="id">{t(`projects.origin.${row.origin}`)}<span className="dev-only"> · {row.key}</span></div>
                        </td>
                        <td className="proj-line"><MissionLine points={projectLine(row.room, row.latest)} label={row.name} /></td>
                        <td><Badge value={row.state} family={familyFor(row.state)} live={isRunning(row.state)} /></td>
                        <td>{row.roomState ? <span className="mono">{row.roomState}</span> : <span className="meta">—</span>}</td>
                        <td className="r">{row.missions}</td>
                        <td className="meta nowrap">{formatWhen(row.at, locale)}</td>
                      </tr>
                      {expanded ? (
                        <tr className="proj-detail" id={detailId}>
                          <td colSpan={7}>
                            {row.jobs.length === 0 ? <p className="meta" style={{ paddingTop: 10 }}>{t('projects.noMission')}</p> : (
                              <ul className="proj-missions">
                                {row.jobs.map((job) => (
                                  <li key={job.id}>
                                    <Signal family={familyFor(job.status)} live={!job.archived && isRunning(job.status)} label={job.status} />
                                    <span>
                                      <Link className="mono" href={`/p/${encodeURIComponent(row.key)}/missions/${encodeURIComponent(job.id)}`}>{job.status}</Link>
                                      <span className="meta"> · {t('project.missions.stage', { stage: job.currentStage })} · {t('command.evidence.build', { status: job.buildStatus })}</span>
                                    </span>
                                    <span className="meta nowrap">{formatWhen(job.finishedAt ?? job.startedAt, locale)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('command.board.tail')}</p>
        <Source>GET /api/project-rooms · GET /api/meta-factory/jobs · GET /api/projects</Source>
      </section>
    </>
  );
}
