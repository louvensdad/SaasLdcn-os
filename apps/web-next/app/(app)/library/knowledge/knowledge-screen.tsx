'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, GapChip, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function KnowledgeScreen() {
  const { t, locale } = useI18n();
  const [teamId, setTeamId] = useState<string | null>(null);

  const teams = useQuery({ queryKey: ['team-memory-teams'], queryFn: api.teamMemoryTeams, retry: false });
  const metrics = useQuery({ queryKey: ['learning-metrics'], queryFn: api.learningMetrics, retry: false });
  const glossary = useQuery({ queryKey: ['glossary'], queryFn: api.glossary, retry: false });

  const rows = teams.data?.teams ?? [];
  const selected = teamId ?? rows[0]?.team_id ?? null;

  const knowledge = useQuery({
    queryKey: ['team-memory-knowledge', selected],
    queryFn: () => api.teamMemoryKnowledge(selected as string),
    enabled: Boolean(selected),
    retry: false,
  });
  const queue = useQuery({
    queryKey: ['team-memory-queue', selected],
    queryFn: () => api.teamMemoryQueue(selected as string),
    enabled: Boolean(selected),
    retry: false,
  });

  const totals = metrics.data?.team_memory.totals;
  const entries = knowledge.data?.knowledge ?? [];
  const pending = queue.data?.queue ?? [];

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('knowledge.title')}</h1>
          <p className="lede">{t('knowledge.lede')}</p>
        </div>
      </div>

      {totals ? (
        <div className="facts">
          <div className="fact"><span className="label">{t('knowledge.totals.approved')}</span><div className="v num">{totals.approved}</div></div>
          <div className="fact"><span className="label">{t('knowledge.totals.proposed')}</span><div className="v num">{totals.proposed}</div></div>
          <div className="fact"><span className="label">{t('knowledge.totals.deprecated')}</span><div className="v num">{totals.deprecated}</div></div>
          <div className="fact">
            <span className="label">{t('knowledge.totals.rate')}</span>
            <div className="v num">{totals.approval_rate === null ? t('knowledge.totals.noRate') : `${Math.round(totals.approval_rate * 100)}%`}</div>
          </div>
        </div>
      ) : null}

      <div className="grid g-side-main" style={{ marginTop: 18 }}>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('knowledge.teams.title')}</h2>
            <span className="meta">{t('knowledge.teams.meta', { count: rows.length })}</span>
          </div>
          <div className="panel-body">
            {teams.isPending ? <Skeleton lines={4} /> : null}
            {teams.isError ? <StateBlock kind="error" title={t('knowledge.unreadable')}>{t('knowledge.unreadableBody')}</StateBlock> : null}
            {teams.data && rows.length === 0 ? <StateBlock kind="empty" title={t('knowledge.teams.none')}>{t('knowledge.teams.noneBody')}</StateBlock> : null}
            <div className="list">
              {rows.map((team) => (
                <button
                  className="li li-pick"
                  key={team.team_id}
                  type="button"
                  aria-current={team.team_id === selected}
                  onClick={() => setTeamId(team.team_id)}
                >
                  <Signal family={team.approved > 0 ? 'proof' : 'idle'} label={team.team_id} />
                  <span className="li-title mono">{team.team_id}</span>
                  <span className="meta mono">{t('knowledge.teams.counts', { approved: team.approved, proposed: team.proposed })}</span>
                </button>
              ))}
            </div>
            <Source>GET /api/team-memory/teams</Source>
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('knowledge.approved.title')}</h2>
              <span className="meta">{t('knowledge.approved.meta', { count: entries.length })}</span>
            </div>
            <div className="panel-body">
              {!selected ? <p className="meta">{t('knowledge.approved.pickTeam')}</p> : null}
              {knowledge.isPending && selected ? <Skeleton lines={4} /> : null}
              {knowledge.isError ? <StateBlock kind="error" title={t('knowledge.unreadable')}>{t('knowledge.unreadableBody')}</StateBlock> : null}
              {knowledge.data && entries.length === 0 ? (
                <StateBlock kind="empty" title={t('knowledge.approved.none')}>{t('knowledge.approved.noneBody')}</StateBlock>
              ) : null}
              <div className="list">
                {entries.map((entry) => (
                  <div className="li" key={entry.id}>
                    <Signal family={familyFor(entry.status)} label={entry.status} />
                    <span className="li-title">{entry.subject || entry.content}</span>
                    <span className="li-aux">
                      <Badge value={entry.status} family={familyFor(entry.status)} />
                      <span className="meta mono">v{entry.version}</span>
                    </span>
                    <span className="li-sub">{entry.subject ? entry.content : entry.source}</span>
                    <div className="chips">
                      {entry.category ? <span className="chip mono">{entry.category}</span> : null}
                      {entry.record_type ? <span className="chip mono">{entry.record_type}</span> : null}
                      {entry.evidence_status ? <span className="chip mono">{entry.evidence_status}</span> : null}
                      <span className="chip mono">{t('knowledge.confidence', { value: Math.round(entry.confidence * 100) })}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Source>GET /api/team-memory/{'{'}team_id{'}'}/knowledge</Source>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('knowledge.queue.title')}</h2>
              <span className="meta">{t('knowledge.queue.meta', { count: pending.length })}</span>
            </div>
            <div className="panel-body">
              {queue.isError ? <p className="meta">{t('knowledge.unreadableBody')}</p> : null}
              {queue.data && pending.length === 0 ? <p className="meta">{t('knowledge.queue.none')}</p> : null}
              <div className="list">
                {pending.map((entry) => (
                  <div className="li" key={entry.id}>
                    <Signal family="hand" label={entry.status} />
                    <span className="li-title">{entry.subject || entry.content}</span>
                    <span className="meta">{formatWhen(entry.created_at, locale)}</span>
                    <span className="li-sub">{entry.source}</span>
                  </div>
                ))}
              </div>
              <p className="meta">{t('knowledge.queue.note')}</p>
              <Source>GET /api/team-memory/{'{'}team_id{'}'}/queue</Source>
            </div>
          </section>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('knowledge.learning.title')}</h2>
        </div>
        {metrics.isPending ? <Skeleton lines={3} /> : null}
        {metrics.isError ? <p className="meta">{t('knowledge.learning.unreadable')}</p> : null}
        {metrics.data ? (
          <>
            <Kv
              pairs={[
                [t('knowledge.learning.recurring'), metrics.data.retrospectives.recurring_total],
                [t('knowledge.learning.observed'), metrics.data.retrospectives.observations.length],
                [t('knowledge.learning.unavailable'), metrics.data.retrospectives.unavailable_count],
              ]}
            />
            <p className="meta" style={{ marginTop: 10 }} lang="pt-BR">{metrics.data.retrospectives.note}</p>
            {locale === 'pt-BR' ? null : <GapChip id="G10" detail={t('knowledge.learning.gap')} />}
          </>
        ) : null}
        <Source>GET /api/team-memory/metrics</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('knowledge.glossary.title')}</h2>
          <span className="meta">{t('knowledge.glossary.meta', { count: glossary.data?.length ?? 0 })}</span>
        </div>
        {glossary.isPending ? <Skeleton lines={3} /> : null}
        {glossary.isError ? <p className="meta">{t('knowledge.glossary.unreadable')}</p> : null}
        <div className="list">
          {(glossary.data ?? []).slice(0, 12).map((term) => (
            <div className="li" key={term.id}>
              <Signal family="idle" label={term.term} />
              <span className="li-title">{term.term}</span>
              {term.aliases.length > 0 ? <span className="meta mono">{term.aliases.join(' · ')}</span> : null}
              <span className="li-sub" lang="pt-BR">{term.definition}</span>
            </div>
          ))}
        </div>
        <GapChip id="G18" detail={t('knowledge.glossary.gap')} />
        <Source>GET /api/language-model/glossary</Source>
      </section>
    </>
  );
}
