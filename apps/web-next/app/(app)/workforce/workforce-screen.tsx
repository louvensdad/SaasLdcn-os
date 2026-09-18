'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Pill, SortTh, TableFoot, Toolbar, useTableView } from '@/components/operate';
import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function WorkforceScreen() {
  const { t } = useI18n();
  const [team, setTeam] = useState<string>('all');
  const roles = useQuery({ queryKey: ['role-map'], queryFn: api.roleMap, retry: false });
  const certifications = useQuery({ queryKey: ['certifications'], queryFn: api.certifications, retry: false });

  const teams = useMemo(
    () => [...new Set((roles.data?.seats ?? []).map((seat) => seat.team_key))].sort(),
    [roles.data],
  );
  const seats = (roles.data?.seats ?? []).filter((seat) => team === 'all' || seat.team_key === team);
  const certified = certifications.data ?? [];
  /* 157 seats is a list nobody reads top to bottom: it is searched, ordered and paged. */
  const view = useTableView(seats, {
    search: (seat) => `${seat.title} ${seat.seat} ${seat.role} ${seat.team_key} ${seat.competencies.join(' ')}`,
    sorters: {
      seat: (seat) => seat.title,
      team: (seat) => seat.team_key,
      competencies: (seat) => seat.competencies.length,
      reports: (seat) => seat.reports_to ?? null,
    },
    initialSort: ['seat', 'asc'],
    resetOn: team,
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.workforce')}</span></div>
          <h1 className="title">{t('workforce.title')}</h1>
          <p className="lede">{t('workforce.lede')}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-ghost" href="/workforce/planner">{t('workforce.planner')}</Link>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('workforce.seats.title')}</h2>
          <span className="meta">{t('workforce.seats.meta', { seats: roles.data?.seats.length ?? 0, roles: roles.data?.roles.length ?? 0 })}</span>
        </div>
        <Toolbar view={view} placeholder={t('workforce.searchPlaceholder')}>
          <Pill pressed={team === 'all'} onClick={() => setTeam('all')}>{t('workforce.seats.all')}</Pill>
          {teams.map((key) => <Pill key={key} pressed={team === key} onClick={() => setTeam(key)}>{key}</Pill>)}
        </Toolbar>
        {roles.isPending ? <Skeleton shape="table" rows={5} columns={5} /> : null}
        {roles.isError ? <StateBlock kind="error" title={t('workforce.seats.unreadable')} /> : null}
        {seats.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <SortTh column="seat" label={t('workforce.col.seat')} view={view} />
                  <SortTh column="team" label={t('workforce.col.team')} view={view} />
                  <SortTh column="competencies" label={t('workforce.col.competencies')} view={view} />
                  <SortTh column="reports" label={t('workforce.col.reports')} view={view} />
                  <th>{t('workforce.col.reviews')}</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((seat) => (
                  <tr key={`${seat.team_key}-${seat.seat}`}>
                    <td>
                      <strong>{seat.title}</strong>
                      <div className="id">{seat.seat}{seat.role !== seat.seat ? ` · ${seat.role}` : ''}</div>
                    </td>
                    <td className="id">{seat.team_key}</td>
                    <td>
                      <span className="chips">
                        {seat.competencies.slice(0, 4).map((item) => <span className="chip mono" key={item}>{item}</span>)}
                        {seat.competencies.length > 4 ? <span className="meta">+{seat.competencies.length - 4}</span> : null}
                      </span>
                    </td>
                    <td className="id">{seat.reports_to ?? '—'}</td>
                    <td className="id">{seat.review_of ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TableFoot view={view} />
          </div>
        ) : null}
        {seats.length > 0 && view.matched === 0 ? (
          <StateBlock kind="empty" title={t('toolbar.noMatch', { query: view.query })}>{t('toolbar.noMatchBody', { total: String(view.total) })}</StateBlock>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('workforce.seats.note')}</p>
        <Source>GET /api/companies/roles</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('workforce.certifications.title')}</h2>
          <span className="meta">{t('workforce.certifications.meta', { count: certified.length })}</span>
        </div>
        {certifications.isPending ? <Skeleton shape="list" rows={4} /> : null}
        {certifications.isError ? <StateBlock kind="error" title={t('workforce.certifications.unreadable')} /> : null}
        {certified.length > 0 ? (
          <div className="list">
            {certified.map((certification) => (
              <div className="li" key={certification.definition_id}>
                <Signal family={familyFor(certification.state)} label={certification.title} />
                <span className="li-title">{certification.title}</span>
                <span className="meta">
                  <Badge value={certification.state} family={familyFor(certification.state)} />
                  {certification.would_have_refused ? <Badge value="WOULD_REFUSE" family="caution" /> : null}
                </span>
                <span className="li-sub">
                  <span className="mono">{certification.mode} · {certification.source}</span> · {certification.reason}
                  {' · '}
                  {t('workforce.certifications.evidence', {
                    runs: certification.evidence.runs,
                    successes: certification.evidence.successes,
                    failures: certification.evidence.failures,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('workforce.certifications.note')}</p>
        <Source>GET /api/companies/certifications</Source>
      </section>
    </>
  );
}
