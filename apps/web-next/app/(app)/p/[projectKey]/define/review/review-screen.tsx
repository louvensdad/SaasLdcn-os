'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Signal } from '@/components/signal';
import { Badge, GapChip, Kv, Failure, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { useSay } from '@/lib/i18n/say';
import { familyFor } from '@/lib/status';

/* The review writes its bands as Portuguese words with no id beside them (G10). The vocabulary is exactly
   three values per band, so each maps to the reader's own word; anything else is quoted as the backend wrote it. */
const BAND_KEY: Readonly<Record<string, string>> = {
  Baixa: 'estimate.complexity.low', 'Média': 'estimate.complexity.medium', Alta: 'estimate.complexity.high',
  Baixo: 'estimate.risk.low', 'Médio': 'estimate.risk.medium', Alto: 'estimate.risk.high',
};


export function ReviewScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const say = useSay();
  const band = (value: string) => say(BAND_KEY[value], value);
  const queryClient = useQueryClient();

  const room = useQuery({ queryKey: ['room', projectKey], queryFn: () => api.room(projectKey), retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['room', projectKey] });
  const run = useMutation({ mutationFn: () => api.runEngineeringReview(projectKey), onSuccess: refresh });
  const repair = useMutation({ mutationFn: () => api.repairEngineeringReview(projectKey), onSuccess: refresh });
  const send = useMutation({ mutationFn: () => api.sendToGenerator(projectKey), onSuccess: refresh });

  if (room.isPending) return <Skeleton lines={6} />;
  if (!room.data) {
    return (
      <PageState title={t('nav.review')} kind="unknown" stateTitle={t('project.missing.title')}>
        {t('project.missing.body', { key: projectKey })}
      </PageState>
    );
  }

  const data = room.data;
  const review = data.engineering_review;
  const findings = review
    ? ([
        ['risks', review.risks],
        ['gaps', review.gaps],
        ['inconsistencies', review.inconsistencies],
        ['debatable', review.debatable_decisions],
        ['good', review.good_decisions],
      ] as const)
    : [];

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.review')}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
            {review?.generation_readiness ? <Badge value={review.generation_readiness} family={familyFor(review.generation_readiness)} /> : null}
          </div>
          <h1 className="title">{t('review.title')}</h1>
          <p className="lede">{t('review.lede')}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" type="button" disabled={run.isPending || !data.architecture_blueprint} onClick={() => run.mutate()}>
            {run.isPending ? t('review.running') : t('review.run')}
          </button>
          <button className="btn btn-hand" type="button" disabled={send.isPending || data.status !== 'ENGINEERING_APPROVED'} title={data.status === 'ENGINEERING_APPROVED' ? undefined : t('review.sendWhen')} onClick={() => send.mutate()}>
            {send.isPending ? t('review.sending') : t('review.send')}
          </button>
        </div>
      </div>

      {run.isError ? <Failure title={t('review.failed')} error={run.error} onRetry={() => run.mutate()} /> : null}

      {!review ? (
        <StateBlock kind="empty" title={t('review.none')}>{t('review.noneBody')}</StateBlock>
      ) : (
        <>
          <div className="facts">
            <div className="fact"><span className="label">{t('review.readiness')}</span><div className="v">{review.generation_readiness}</div></div>
            {review.score?.overall != null ? (
              <div className="fact"><span className="label">{t('review.score')}</span><div className="v num">{review.score.overall}</div></div>
            ) : null}
            {review.final_opinion ? (
              <>
                <div className="fact"><span className="label">{t('review.complexity')}</span><div className="v">{band(review.final_opinion.complexity)}</div></div>
                <div className="fact"><span className="label">{t('review.risk')}</span><div className="v">{band(review.final_opinion.risk)}</div></div>
                <div className="fact"><span className="label">{t('review.openQuestions')}</span><div className="v num">{review.final_opinion.open_questions ?? 0}</div></div>
              </>
            ) : null}
          </div>

          {review.final_opinion ? (
            <section className="sec" style={{ marginTop: 18 }}>
              <div className="sec-head"><h2 className="h-sec">{t('review.opinion.title')}</h2></div>
              <p className="sentence" lang="pt-BR">{review.final_opinion.narrative}</p>
              <p className="meta" style={{ marginTop: 10 }} lang="pt-BR">{review.final_opinion.disclaimer}</p>
              {locale === 'pt-BR' ? null : <GapChip id="G10" detail={t('review.opinion.gap')} />}
            </section>
          ) : null}

          <div className="grid g-2 g-start">
            {findings.map(([key, items]) => (
              <section className="sec" key={key}>
                <div className="sec-head">
                  <h2 className="h-sec">{t(`review.findings.${key}`)}</h2>
                  <span className="meta">{items.length}</span>
                </div>
                {items.length === 0 ? <p className="meta">{t('review.findings.none')}</p> : (
                  <div className="list">
                    {items.map((finding, index) => (
                      <div className="li" key={`${finding.title}-${index}`}>
                        <Signal family={key === 'good' ? 'proof' : key === 'debatable' ? 'caution' : 'fault'} label={finding.title} />
                        <span className="li-title">{finding.title}</span>
                        {finding.area ? <span className="meta mono">{finding.area}</span> : null}
                        <span className="li-sub">{finding.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {review.committee && review.committee.length > 0 ? (
            <section className="sec">
              <div className="sec-head">
                <h2 className="h-sec">{t('review.committee.title')}</h2>
                <span className="meta">{t('review.committee.meta', { count: review.committee.length })}</span>
              </div>
              <div className="list">
                {review.committee.map((member) => (
                  <div className="li" key={member.role}>
                    <Signal family={familyFor(member.verdict)} label={member.role} />
                    <span className="li-title mono">{member.role}</span>
                    <span className="meta"><Badge value={member.verdict} family={familyFor(member.verdict)} /> {member.rating}/5</span>
                    <span className="li-sub">{member.rationale}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="sec">
            <div className="sec-head"><h2 className="h-sec">{t('review.repair.title')}</h2></div>
            <Kv pairs={[[t('review.repair.attempts'), <span key="a" className="num">{data.engineering_review_repairs?.length ?? 0}</span>]]} />
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost" type="button" disabled={repair.isPending} onClick={() => repair.mutate()}>
                {repair.isPending ? t('review.repair.running') : t('review.repair.run')}
              </button>
            </div>
            <p className="meta" style={{ marginTop: 10 }}>{t('review.repair.note')}</p>
            <Source>POST /api/project-rooms/{'{'}room_id{'}'}/engineering-review · …/repair · …/send-to-generator</Source>
          </section>
        </>
      )}
    </>
  );
}
