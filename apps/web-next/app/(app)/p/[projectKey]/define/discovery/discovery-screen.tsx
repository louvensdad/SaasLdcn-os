'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Kv, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import type { PhaseEstimate } from '@contracts/room-insights.contract';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useSay } from '@/lib/i18n/say';
import { familyFor } from '@/lib/status';

/* The backend writes `duration_label` in Portuguese for rows that predate the numeric pair. Phrase the
   duration from `duration_value`/`duration_unit` when they are there, and quote the backend otherwise. */
function useDuration() {
  const { t } = useI18n();
  return (phase: PhaseEstimate) => {
    if (phase.duration_value === undefined || phase.duration_unit === undefined) return phase.duration_label;
    if (phase.duration_unit === 'hours') return t('estimate.duration.hours', { count: phase.duration_value });
    return t(phase.duration_value === 1 ? 'estimate.duration.day' : 'estimate.duration.days', { count: phase.duration_value });
  };
}

export function DiscoveryScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const say = useSay();
  const durationOf = useDuration();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const room = useQuery({ queryKey: ['room', projectKey], queryFn: () => api.room(projectKey), retry: false });
  const estimate = useQuery({ queryKey: ['work-estimate', projectKey], queryFn: () => api.workEstimate(projectKey), retry: false, enabled: room.isSuccess });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['room', projectKey] });
  const send = useMutation({ mutationFn: () => api.sendRoomMessage(projectKey, message.trim()), onSuccess: () => { setMessage(''); refresh(); } });
  const generate = useMutation({ mutationFn: () => api.generatePrompt(projectKey), onSuccess: refresh });

  if (room.isPending) return <Skeleton lines={6} />;
  if (!room.data) {
    return (
      <PageState title={t('nav.discovery')} kind="unknown" stateTitle={t('project.missing.title')}>
        {t('project.missing.body', { key: projectKey })}
      </PageState>
    );
  }

  const data = room.data;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.discovery')}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
            <span className="chip">{t('discovery.confidence', { value: Math.round(data.confidence * 100) })}</span>
          </div>
          <h1 className="title">{t('discovery.title')}</h1>
          <p className="lede">{t('discovery.lede')}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? t('discovery.generating') : t('discovery.generate')}
          </button>
        </div>
      </div>

      {send.isError ? <Notice family="fault" title={t('discovery.failed')}>{String(send.error)}</Notice> : null}
      {data.degraded ? <Notice family="caution" title={t('discovery.degraded.title')}>{t('discovery.degraded.body')}</Notice> : null}

      <div className="grid g-main-side">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('discovery.conversation.title')}</h2>
            <span className="meta">{t('discovery.conversation.meta', { count: data.messages.length })}</span>
          </div>
          {data.messages.length === 0 ? (
            <StateBlock kind="empty" title={t('discovery.conversation.none')}>{t('discovery.conversation.noneBody')}</StateBlock>
          ) : (
            <div className="turns">
              {data.messages.map((entry, index) => (
                <article className={`turn${entry.role === 'user' ? ' is-user' : entry.role === 'system' ? ' is-system' : ''}`} key={`${entry.created_at}-${index}`}>
                  <span className="turn-role">{t(`discovery.role.${entry.role}`)}</span>
                  <div className="turn-body">{entry.content}</div>
                  <span className="meta">{formatWhen(entry.created_at, locale)}</span>
                </article>
              ))}
            </div>
          )}
          <div className="composer" style={{ marginTop: 14 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="sr-only">{t('discovery.say')}</span>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('discovery.say')} rows={3} />
            </label>
            <button className="btn btn-primary" type="button" disabled={send.isPending || !message.trim()} onClick={() => send.mutate()}>
              {send.isPending ? t('discovery.sending') : t('discovery.send')}
            </button>
          </div>
          <p className="meta" style={{ marginTop: 8 }}>{t('discovery.note')}</p>
          <Source>POST /api/project-rooms/{'{'}room_id{'}'}/message</Source>
        </section>

        <div className="stack-lg">
          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('discovery.questions.title')}</h2>
              <span className="meta">{t('discovery.questions.meta', { count: data.open_questions.length })}</span>
            </div>
            <div className="panel-body">
              {data.open_questions.length === 0 ? (
                <p className="meta">{t('discovery.questions.none')}</p>
              ) : (
                <div className="list">
                  {data.open_questions.map((question) => (
                    <div className="li" key={question.id}>
                      <Signal family="hand" label={question.question} />
                      <span className="li-title">{question.question}</span>
                      <span className="li-sub">{question.why_it_matters}{question.default_if_skipped ? ` · ${t('discovery.questions.default', { value: question.default_if_skipped })}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <Source>GET /api/project-rooms/{'{'}room_id{'}'} · open_questions</Source>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="h-sub">{t('discovery.estimate.title')}</h2></div>
            <div className="panel-body stack">
              {estimate.isPending ? <Skeleton lines={2} /> : null}
              {estimate.isError ? <p className="meta">{t('discovery.estimate.none')}</p> : null}
              {estimate.data ? (
                <>
                  <p className="body ink2">{estimate.data.no_rush_message}</p>
                  <Kv
                    pairs={[
                      [t('estimate.complexity'), say(`estimate.complexity.${estimate.data.complexity_id ?? ''}`, estimate.data.complexity)],
                      [t('estimate.risk'), say(`estimate.risk.${estimate.data.risk_level_id ?? ''}`, estimate.data.risk_level)],
                      [t('estimate.size'), estimate.data.size_band],
                      [t('estimate.minimum'), estimate.data.healthy_minimum_label],
                    ]}
                  />
                  <ul className="list">
                    {estimate.data.phases.map((phase) => (
                      <li className="li" key={phase.id}>
                        <Signal family="idle" />
                        <span className="li-title">{say(`estimate.phase.${phase.id}`, phase.label)}</span>
                        <span className="meta mono">{durationOf(phase)}</span>
                      </li>
                    ))}
                  </ul>
                  <Source>GET /api/project-rooms/{'{'}room_id{'}'}/work-estimate</Source>
                </>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
