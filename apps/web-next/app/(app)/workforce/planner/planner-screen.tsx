'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { EvidenceLine } from '@/components/evidence-line';
import { Signal } from '@/components/signal';
import { Badge, Kv, Failure, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

type Slot = 'backend' | 'frontend' | 'data' | 'messaging' | 'mobile';

export function PlannerScreen() {
  const { t } = useI18n();
  const [missionRef, setMissionRef] = useState('planner-preview');
  const [components, setComponents] = useState<{ slot: Slot; language: string; framework: string }[]>([
    { slot: 'backend', language: 'python', framework: 'fastapi' },
    { slot: 'frontend', language: 'typescript', framework: 'nextjs' },
    { slot: 'data', language: 'postgres', framework: '' },
  ]);
  const [flags, setFlags] = useState({ realtime: false, auth: true, sensitive_data: false, multi_tenant: false });
  const [criticality, setCriticality] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');

  const plan = useMutation({
    mutationFn: () => api.planWorkforce({
      mission_ref: missionRef.trim() || 'planner-preview',
      components: components.filter((component) => component.language.trim()).map((component) => ({
        slot: component.slot,
        language: component.language.trim(),
        framework: component.framework.trim(),
        version_constraint: '',
      })),
      ...flags,
      criticality,
    }),
  });

  const result = plan.data;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.workforce')}</span></div>
          <h1 className="title">{t('planner.title')}</h1>
          <p className="lede">{t('planner.lede')}</p>
        </div>
        <div className="btn-row"><Link className="btn btn-ghost" href="/workforce">{t('planner.back')}</Link></div>
      </div>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('planner.stack.title')}</h2></div>
        <div className="form-grid">
          {components.map((component, index) => (
            <div className="field" key={component.slot}>
              <span className="field-label">{component.slot}</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  aria-label={t('planner.language', { slot: component.slot })}
                  value={component.language}
                  placeholder={t('planner.languagePlaceholder')}
                  onChange={(event) => {
                    const next = [...components];
                    next[index] = { ...component, language: event.target.value };
                    setComponents(next);
                  }}
                />
                <input
                  aria-label={t('planner.framework', { slot: component.slot })}
                  value={component.framework}
                  placeholder={t('planner.frameworkPlaceholder')}
                  onChange={(event) => {
                    const next = [...components];
                    next[index] = { ...component, framework: event.target.value };
                    setComponents(next);
                  }}
                />
              </div>
            </div>
          ))}
          <label className="field">
            <span className="field-label">{t('planner.missionRef')}</span>
            <input value={missionRef} onChange={(event) => setMissionRef(event.target.value)} />
            <span className="hint">{t('planner.missionRefHint')}</span>
          </label>
          <label className="field">
            <span className="field-label">{t('planner.criticality')}</span>
            <select value={criticality} onChange={(event) => setCriticality(event.target.value as typeof criticality)}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {(Object.keys(flags) as (keyof typeof flags)[]).map((key) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={flags[key]} onChange={(event) => setFlags({ ...flags, [key]: event.target.checked })} />
              <span>{t(`planner.flag.${key}`)}</span>
            </label>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="button" disabled={plan.isPending} onClick={() => plan.mutate()}>
            {plan.isPending ? t('planner.running') : t('planner.run')}
          </button>
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('planner.note')}</p>
        <Source>POST /api/workforce/plan</Source>
      </section>

      {plan.isError ? <Failure title={t('planner.failed')} error={plan.error} onRetry={() => plan.mutate()} /> : null}

      {result ? (
        <>
          <section className="sec">
            <div className="sec-head">
              <h2 className="h-sec">{t('planner.result.title')}</h2>
              <Badge value={result.status} family={familyFor(result.status)} />
            </div>
            <div className="tbl-wrap">
              <table className="tbl coverage">
                <caption className="sr-only">{t('planner.coverage.caption')}</caption>
                <thead>
                  <tr>
                    <th>{t('planner.coverage.position')}</th>
                    <th>{t('planner.coverage.competencies')}</th>
                    <th>{t('planner.coverage.agent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions.map((position) => {
                    const assignment = result.assignments.find((entry) => entry.role_id === position.role_id);
                    const family = assignment ? (assignment.risk_flag ? 'caution' : 'proof') : position.mandatory ? 'fault' : 'idle';
                    return (
                      <tr key={position.role_id}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <Signal family={family} label={position.role_id} />
                            <strong className="mono">{position.role_id}</strong>
                          </span>
                          <div className="meta">{position.mandatory ? t('planner.mandatory') : t('planner.optional')} · {position.reason}</div>
                        </td>
                        <td>
                          <span className="chips">
                            {position.required_competencies.flat().map((competency) => {
                              const gap = result.gaps.find((entry) => entry.competency === competency);
                              return (
                                <span key={competency} className={`chip mono cov-chip${gap ? ' is-gap' : assignment ? ' is-covered' : ''}`} title={gap ? gap.detail : undefined}>
                                  <Signal family={gap ? 'fault' : assignment ? 'proof' : 'idle'} label={competency} />
                                  {competency}
                                  {gap ? <span className="cov-depth">{gap.required_depth}</span> : null}
                                </span>
                              );
                            })}
                          </span>
                        </td>
                        <td>
                          {assignment ? (
                            <>
                              <span className="mono">{assignment.agent_version_ref ?? '—'}</span>
                              {assignment.risk_flag ? <div><Badge value={assignment.risk_flag} family="caution" /></div> : null}
                            </>
                          ) : <span className="meta">{t('planner.coverage.unstaffed')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="meta" style={{ marginTop: 8 }}>
              {t('planner.result.positions', { count: result.positions.length })} · {t('planner.result.assignments', { count: result.assignments.length })}
            </p>
          </section>

          <div className="grid g-2">
            <section className="sec">
              <div className="sec-head"><h2 className="h-sec">{t('planner.gaps.title')}</h2></div>
              {result.gaps.length === 0 ? (
                <StateBlock kind="empty" title={t('planner.gaps.none')}>{t('planner.gaps.noneBody')}</StateBlock>
              ) : (
                <div className="list">
                  {result.gaps.map((gap) => (
                    <div className="li" key={gap.competency}>
                      <Signal family="caution" label={gap.competency} />
                      <span className="li-title mono">{gap.competency}</span>
                      <span className="meta">{gap.required_depth}</span>
                      <span className="li-sub">{gap.detail} {gap.best_available ? `· ${gap.best_available}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="sec">
              <div className="sec-head"><h2 className="h-sec">{t('planner.composition.title')}</h2></div>
              {!result.composition ? (
                <StateBlock kind="empty" title={t('planner.composition.none')}>{t('planner.composition.noneBody')}</StateBlock>
              ) : (
                <>
                  <Kv
                    pairs={[
                      [t('planner.composition.maturity'), <Badge key="m" value={result.composition.maturity} family={familyFor(result.composition.maturity)} />],
                      [t('planner.composition.composable'), result.composition.composable ? t('delivery.check.yes') : t('delivery.check.no')],
                      [t('planner.composition.buildOrder'), <span key="b" className="mono">{result.composition.build_order.join(' → ')}</span>],
                      [t('planner.composition.gaps'), <span key="g" className="num">{result.composition.gaps.length}</span>],
                    ]}
                  />
                  <div style={{ marginTop: 12 }}>
                    <EvidenceLine
                      label={t('planner.composition.line')}
                      stations={result.composition.build_order.map((slot) => {
                        const component = result.composition?.components.find((entry) => entry.slot === slot);
                        return { id: slot, name: slot, state: component ? component.health : 'unknown', family: component ? familyFor(component.health) : 'unknown' };
                      })}
                    />
                  </div>
                  <div className="list" style={{ marginTop: 10 }}>
                    {result.composition.components.map((component) => (
                      <div className="li" key={component.slot}>
                        <Signal family={familyFor(component.health)} label={component.slot} />
                        <span className="li-title mono">{component.slot}</span>
                        <span className="meta mono">{component.maturity}</span>
                        <span className="li-sub mono">{component.stack_id}{component.depends_on.length > 0 ? ` · ${component.depends_on.join(', ')}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
