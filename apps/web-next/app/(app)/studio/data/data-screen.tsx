'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function DataScreen() {
  const { t, locale } = useI18n();
  const [ruleId, setRuleId] = useState<string | null>(null);

  const sessions = useQuery({ queryKey: ['analysis-sessions'], queryFn: api.analysisSessions, retry: false });
  const rules = useQuery({ queryKey: ['monitoring-rules'], queryFn: api.monitoringRules, retry: false });
  const sourceTypes = useQuery({ queryKey: ['source-types'], queryFn: api.analysisSourceTypes, retry: false });

  const rows = sessions.data ?? [];
  const live = rows.filter((session) => !session.archived);
  const ruleRows = rules.data ?? [];
  const selectedRule = ruleId ?? ruleRows[0]?.id ?? null;

  const checks = useQuery({
    queryKey: ['monitoring-checks', selectedRule],
    queryFn: () => api.monitoringChecks(selectedRule as string),
    enabled: Boolean(selectedRule),
    retry: false,
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.studio')}</span></div>
          <h1 className="title">{t('data.title')}</h1>
          <p className="lede">{t('data.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('data.sessions.title')}</h2>
          <span className="meta">{t('data.sessions.meta', { count: live.length })}</span>
        </div>

        {sessions.isPending ? <Skeleton lines={4} /> : null}
        {sessions.isError ? <StateBlock kind="error" title={t('data.unreadable')}>{t('data.unreadableBody')}</StateBlock> : null}
        {sessions.data && live.length === 0 ? (
          <StateBlock kind="empty" title={t('data.sessions.none')}>{t('data.sessions.noneBody')}</StateBlock>
        ) : null}

        <div className="list">
          {live.map((session) => (
            <Link className="li li-link" key={session.id} href={`/studio/data/${encodeURIComponent(session.id)}`}>
              <Signal family={familyFor(session.status)} label={session.status} />
              <span className="li-title">{session.objectiveText || t('data.sessions.noObjective')}</span>
              <span className="li-aux">
                <Badge value={session.status} family={familyFor(session.status)} />
                <span className="meta">{formatWhen(session.updatedAt, locale)}</span>
              </span>
              <span className="li-sub mono">{session.id}</span>
              <div className="chips">
                <span className="chip mono">{t('data.sessions.step', { step: session.currentStep })}</span>
                <span className="chip mono">{session.executionMode}</span>
              </div>
            </Link>
          ))}
        </div>
        <p className="meta">{t('data.sessions.note')}</p>
        <Source>GET /api/data-intelligence/sessions</Source>
      </section>

      <div className="grid g-side-main g-start">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('data.rules.title')}</h2>
            <span className="meta">{t('data.rules.meta', { count: ruleRows.length })}</span>
          </div>
          <div className="panel-body">
            {rules.isPending ? <Skeleton lines={3} /> : null}
            {rules.isError ? <p className="meta">{t('data.unreadableBody')}</p> : null}
            {rules.data && ruleRows.length === 0 ? <p className="meta">{t('data.rules.none')}</p> : null}
            <div className="list">
              {ruleRows.map((rule) => (
                <button
                  className="li li-pick"
                  key={rule.id}
                  type="button"
                  aria-current={rule.id === selectedRule}
                  onClick={() => setRuleId(rule.id)}
                >
                  <Signal family={rule.status === 'active' ? 'pulse' : 'idle'} label={rule.status} />
                  <span className="li-title mono">{rule.metric}</span>
                  <span className="meta mono">{rule.schedule}</span>
                  <span className="li-sub">
                    {rule.lastRunAt ? t('data.rules.lastRun', { when: formatWhen(rule.lastRunAt, locale) }) : t('data.rules.neverRun')}
                  </span>
                </button>
              ))}
            </div>
            <Source>GET /api/data-intelligence/monitoring-rules</Source>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('data.checks.title')}</h2>
            <span className="meta">{t('data.checks.meta', { count: checks.data?.length ?? 0 })}</span>
          </div>
          <div className="panel-body">
            {!selectedRule ? <p className="meta">{t('data.checks.pickRule')}</p> : null}
            {checks.isError ? <p className="meta">{t('data.unreadableBody')}</p> : null}
            {checks.data && checks.data.length === 0 ? <p className="meta">{t('data.checks.none')}</p> : null}
            <div className="list">
              {(checks.data ?? []).map((check) => (
                <div className="li" key={check.id}>
                  <Signal family={check.status === 'breach' ? 'caution' : check.status === 'ok' ? 'proof' : 'na'} label={check.status} />
                  <span className="li-title mono">{check.status}</span>
                  <span className="meta">{formatWhen(check.createdAt, locale)}</span>
                  <span className="li-sub">
                    {check.status === 'no_new_data'
                      ? t('data.checks.noNewData')
                      : t('data.checks.reading', {
                          observed: check.observedValue ?? '—',
                          baseline: check.baselineValue,
                          deviation: check.deviationPercent == null ? '—' : `${check.deviationPercent.toFixed(1)}%`,
                        })}
                  </span>
                  <div className="chips"><span className="chip mono">{t('data.checks.version', { version: check.datasetVersion })}</span></div>
                </div>
              ))}
            </div>
            <p className="meta">{t('data.checks.note')}</p>
            <Source>GET /api/data-intelligence/monitoring-rules/{'{'}rule_id{'}'}/checks</Source>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('data.sources.title')}</h2>
          <span className="meta">{t('data.sources.meta', { count: sourceTypes.data?.length ?? 0 })}</span>
        </div>
        <p className="body ink2">{t('data.sources.lede')}</p>
        {sourceTypes.isPending ? <Skeleton lines={3} /> : null}
        {sourceTypes.isError ? <p className="meta">{t('data.unreadableBody')}</p> : null}
        <div className="list">
          {(sourceTypes.data ?? []).map((entry) => (
            <div className="li" key={entry.sourceType}>
              <Signal family={familyFor(entry.status)} label={entry.status} />
              <span className="li-title mono">{entry.sourceType}</span>
              <Badge value={entry.status} family={familyFor(entry.status)} />
              <span className="li-sub" lang="pt-BR">{entry.note}</span>
            </div>
          ))}
        </div>
        <Source>GET /api/data-intelligence/source-types</Source>
      </section>
    </>
  );
}
