'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

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
          <div className="actions seg" role="group" aria-label={t('workforce.seats.filter')}>
            <button type="button" aria-pressed={team === 'all'} onClick={() => setTeam('all')}>{t('workforce.seats.all')}</button>
            {teams.map((key) => (
              <button key={key} type="button" aria-pressed={team === key} onClick={() => setTeam(key)}>{key}</button>
            ))}
          </div>
        </div>
        {roles.isPending ? <Skeleton lines={6} /> : null}
        {roles.isError ? <StateBlock kind="error" title={t('workforce.seats.unreadable')} /> : null}
        {seats.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('workforce.col.seat')}</th>
                  <th>{t('workforce.col.team')}</th>
                  <th>{t('workforce.col.competencies')}</th>
                  <th>{t('workforce.col.reports')}</th>
                  <th>{t('workforce.col.reviews')}</th>
                </tr>
              </thead>
              <tbody>
                {seats.map((seat) => (
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
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('workforce.seats.note')}</p>
        <Source>GET /api/companies/roles</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('workforce.certifications.title')}</h2>
          <span className="meta">{t('workforce.certifications.meta', { count: certified.length })}</span>
        </div>
        {certifications.isPending ? <Skeleton lines={4} /> : null}
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
