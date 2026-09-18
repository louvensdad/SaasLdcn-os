'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';

import { MissionLine } from '@/components/mission-line';
import { Pill, SortTh, TableFoot, Toolbar, useTableView } from '@/components/operate';
import { Icon, Signal } from '@/components/signal';
import { Badge, GapChip, Skeleton, Source, StateBlock } from '@/components/ui';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useStatusLabel } from '@/lib/i18n/status-label';
import { familyFor, isRunning } from '@/lib/status';
import { projectLine } from '@/lib/work/mission-line';
import { useWork } from '@/lib/work/use-work';

/** Everything being built, one row per project with its mission line; a row opens onto the missions behind it. */
export function ProjectsScreen() {
  const { t, locale } = useI18n();
  const say = useStatusLabel();
  const { projects, unreadable, pending } = useWork();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  /* Only what is still moving, or everything. A filter is a question about the list, so it sits
     above it and survives opening a row. */
  const [running, setRunning] = useState(false);
  const shown = running ? projects.filter((row) => isRunning(row.state)) : projects;
  const view = useTableView(shown, {
    search: (row) => `${row.name} ${row.key} ${row.state}`,
    sorters: {
      project: (row) => row.name,
      state: (row) => row.state,
      missions: (row) => row.missions,
      updated: (row) => row.at ?? '',
    },
    initialSort: ['updated', 'desc'],
    resetOn: running,
  });

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
        {pending ? <Skeleton shape="table" rows={3} columns={6} /> : null}
        {!pending && projects.length === 0 ? (
          <StateBlock kind="empty" title={t('projects.empty')}>{t('projects.emptyBody')}</StateBlock>
        ) : null}
        {projects.length > 0 ? (
          <>
            <Toolbar view={view} placeholder={t('projects.searchPlaceholder')}>
              <Pill pressed={!running} onClick={() => setRunning(false)}>{t('projects.filter.all')}</Pill>
              <Pill pressed={running} onClick={() => setRunning(true)}>{t('projects.filter.running')}</Pill>
            </Toolbar>
            {view.matched === 0 ? (
              <StateBlock kind="empty" title={t('toolbar.noMatch', { query: view.query })}>{t('toolbar.noMatchBody', { total: String(view.total) })}</StateBlock>
            ) : null}
            <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  <SortTh column="project" label={t('projects.col.project')} view={view} />
                  <th className="proj-line">{t('projects.col.line')}</th>
                  <SortTh column="state" label={t('projects.col.state')} view={view} />
                  <th>{t('projects.col.room')}</th>
                  <SortTh column="missions" label={t('projects.col.missions')} view={view} align="right" />
                  <SortTh column="updated" label={t('projects.col.updated')} view={view} />
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => {
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
                        <td>{row.roomState ? <span>{say(row.roomState)}<span className="src">{row.roomState}</span></span> : <span className="meta">—</span>}</td>
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
                                      <Link href={`/p/${encodeURIComponent(row.key)}/missions/${encodeURIComponent(job.id)}`}>{say(job.status)}</Link>
                                      <span className="meta"> · {t('project.missions.stage', { stage: say(job.currentStage) })} · {t('command.evidence.build', { status: say(job.buildStatus) })}</span>
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
            <TableFoot view={view} />
            </div>
          </>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('command.board.tail')}</p>
        <Source>GET /api/project-rooms · GET /api/meta-factory/jobs · GET /api/projects</Source>
      </section>
    </>
  );
}
