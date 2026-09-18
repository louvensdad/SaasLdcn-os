'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect } from 'react';

import { DecisionMap } from '@/components/drawings/decision-map';
import { Signal } from '@/components/signal';
import { Badge, Failure, Kv, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatCount, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function ArchitectureScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const room = useQuery({
    queryKey: ['room', projectKey],
    queryFn: () => api.room(projectKey),
    retry: false,
    /* While the room says it is drawing, keep asking: that is how this screen notices the end of a long
       call, a cancellation, or the reservation expiring, without anyone reloading the page. */
    refetchInterval: (query) => (query.state.data?.status === 'BLUEPRINT_GENERATING' ? 5000 : false),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['room', projectKey] });
  const generate = useMutation({ mutationFn: () => api.generateBlueprint(projectKey), onSuccess: refresh });
  const approveStack = useMutation({ mutationFn: () => api.approveStack(projectKey), onSuccess: refresh });
  const restore = useMutation({ mutationFn: (version: number) => api.restoreBlueprint(projectKey, version), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => api.cancelBlueprint(projectKey), onSuccess: refresh });

  /* A refusal is about a moment, not a standing fact. Once the room carries a blueprint -- or is drawing
     one right now -- an earlier "approve the PromptMaster first" is no longer true of this screen, and
     leaving it on the page next to the stack it refused to plan reads as two contradictory answers. */
  /* The room is drawing the blueprint right now: the button that asks for one has nothing left to ask. */
  const drawing = room.data?.status === 'BLUEPRINT_GENERATING';
  const planned = Boolean(room.data?.architecture_blueprint) || drawing;
  const generateReset = generate.reset;
  useEffect(() => {
    if (planned) generateReset();
  }, [planned, generateReset]);

  if (room.isPending) return <Skeleton lines={6} />;
  if (!room.data) {
    return (
      <PageState title={t('nav.architecture')} kind="unknown" stateTitle={t('project.missing.title')}>
        {t('project.missing.body', { key: projectKey })}
      </PageState>
    );
  }

  const data = room.data;
  const blueprint = data.architecture_blueprint;
  const stack = data.stack_proposal;
  const versions = [...(data.blueprint_versions ?? [])].sort((a, b) => b.version - a.version);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.architecture')}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
            {data.active_blueprint_version != null ? <span className="chip mono">v{data.active_blueprint_version}</span> : null}
          </div>
          <h1 className="title">{t('architecture.title')}</h1>
          <p className="lede">{t('architecture.lede')}</p>
        </div>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={generate.isPending || !data.prompt_master_md || drawing}
            onClick={() => generate.mutate()}
          >
            {generate.isPending || drawing ? t('architecture.generating') : t('architecture.generate')}
          </button>
        </div>
      </div>

      {generate.isError ? <Failure title={t('architecture.failed')} error={generate.error} onRetry={() => generate.mutate()} /> : null}

      {stack ? (
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('architecture.stack.title')}</h2>
            <Badge value={stack.status} family={familyFor(stack.status)} />
          </div>
          <div className="list">
            {stack.items.map((item) => (
              <div className="li" key={item.area}>
                <Signal family={stack.status === 'APPROVED' ? 'proof' : 'hand'} label={item.label} />
                <span className="li-title">{item.label}</span>
                <span className="li-choice mono">{item.choice}</span>
                <span className="li-sub">
                  {item.reason}
                  {item.alternatives.length > 0 ? ` · ${t('architecture.stack.alternatives')}: ${item.alternatives.join(', ')}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            {/* A stack that is already approved says so; a greyed-out verb reads as a control that broke. */}
            {stack.status === 'APPROVED' ? (
              <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                <Signal family="proof" label={t('architecture.stack.approved')} />
                <b>{t('architecture.stack.approved')}</b>
                <span className="meta">{t('architecture.stack.locked')}</span>
              </span>
            ) : (
              <button className="btn btn-hand" type="button" disabled={approveStack.isPending} onClick={() => approveStack.mutate()}>
                {t('architecture.stack.approve')}
              </button>
            )}
          </div>
          <p className="meta" style={{ marginTop: 10 }}>{t('architecture.stack.note')}</p>
          <Source>POST /api/project-rooms/{'{'}room_id{'}'}/stack/approve</Source>
        </section>
      ) : null}

      {drawing ? (
        <div className="panel" role="status" style={{ marginBottom: 20 }}>
          <div className="panel-body stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Signal family="pulse" live />
              <b>{t('architecture.drawing.title')}</b>
            </div>
            <p className="body ink2">{t('architecture.drawing.body', { when: formatWhen(data.updated_at, locale) })}</p>
            <div className="btn-row">
              <button className="btn btn-ghost btn-sm" type="button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending ? t('architecture.drawing.cancelling') : t('architecture.drawing.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {cancel.isError ? <Failure title={t('architecture.drawing.cancelFailed')} error={cancel.error} onRetry={() => cancel.mutate()} /> : null}

      {!blueprint ? (
        /* An empty state owes a valid path, not a restatement of a condition that is already met
           (REDESIGN.md §2). With a PromptMaster in hand the way forward is the planning itself; without
           one it is the screen where the PromptMaster is written. */
        data.prompt_master_md ? (
          <StateBlock
            kind="empty"
            title={t('architecture.none')}
            illustration="gap"
            action={(
              <div className="btn-row">
                <button className="btn btn-primary" type="button" disabled={generate.isPending} onClick={() => generate.mutate()}>
                  {generate.isPending ? t('architecture.generating') : t('architecture.generate')}
                </button>
              </div>
            )}
          >
            {t('architecture.noneBody')}
          </StateBlock>
        ) : (
          <StateBlock
            kind="empty"
            title={t('architecture.blocked')}
            illustration="gap"
            action={(
              <div className="btn-row">
                <Link className="btn btn-ghost" href={`/p/${encodeURIComponent(projectKey)}/define/requirements`}>{t('architecture.blockedAction')}</Link>
              </div>
            )}
          >
            {t('architecture.blockedBody')}
          </StateBlock>
        )
      ) : (
        <>
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('archmap.label')}</h2>
            <span className="meta">{t('architecture.blueprint.meta', { version: blueprint.version ?? 0 })} · {t('archmap.note')}</span>
          </div>
          {Array.isArray(blueprint.decisions) && blueprint.decisions.length > 0
            ? <DecisionMap blueprint={blueprint} />
            : <StateBlock kind="empty" title={t('archmap.none')} />}
        </section>
        <div className="grid g-main-side">
          <section className="sec">
            <div className="sec-head">
              <h2 className="h-sec">{t('architecture.blueprint.title')}</h2>
              <span className="meta">{t('architecture.blueprint.meta', { version: blueprint.version ?? 0 })}</span>
            </div>
            {/* This section used to hold nothing but a developer-only <details>, so with the switch off it
                was a title over an empty half-page. The blueprint already carries who wrote it and at what
                cost; that is the part a person reading a decision wants. */}
            {blueprint.degraded || blueprint.fallback ? (
              <Notice family="caution" title={t('architecture.blueprint.withoutModel')}>{t('architecture.blueprint.degradedNote')}</Notice>
            ) : null}
            <Kv
              pairs={[
                [t('architecture.blueprint.writtenBy'), blueprint.mode === 'llm' && blueprint.providerLabel
                  ? `${blueprint.providerLabel}${blueprint.model ? ` · ${blueprint.model}` : ''}`
                  : t('architecture.blueprint.withoutModel')],
                [t('architecture.blueprint.when'), blueprint.generatedAt || blueprint.generated_at
                  ? formatWhen(blueprint.generatedAt || blueprint.generated_at, locale)
                  : '—'],
                [t('architecture.blueprint.decisions'), String(blueprint.decisions?.length ?? 0)],
                [t('architecture.blueprint.confidence'), typeof blueprint.confidence === 'number'
                  ? `${Math.round(blueprint.confidence * 100)}%`
                  : '—'],
                [t('architecture.blueprint.time'), blueprint.generation_time_ms || blueprint.latencyMs
                  ? `${Math.round((blueprint.generation_time_ms || blueprint.latencyMs) / 100) / 10} s`
                  : '—'],
                [t('architecture.blueprint.tokens'), blueprint.tokensUsed ? formatCount(blueprint.tokensUsed, locale) : '—'],
              ]}
            />
            <details className="dev-only">
              <summary className="meta">{t('archmap.raw')}</summary>
              <pre className="json">{JSON.stringify(blueprint, null, 2).slice(0, 8000)}</pre>
            </details>
            <Source>GET /api/project-rooms/{'{'}room_id{'}'} · architecture_blueprint</Source>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('architecture.versions.title')}</h2>
              <span className="meta">{t('architecture.versions.meta', { count: versions.length })}</span>
            </div>
            <div className="panel-body">
              <div className="list">
                {versions.slice().reverse().map((version) => (
                  <div className="li" key={version.version}>
                    <Signal family={version.version === data.active_blueprint_version ? 'proof' : 'idle'} label={`v${version.version}`} />
                    <span className="li-title mono">v{version.version}</span>
                    <span className="meta">
                      {version.version === data.active_blueprint_version
                        ? <Badge value="ACTIVE" family="proof" />
                        : <button className="btn btn-quiet btn-sm" type="button" disabled={restore.isPending} onClick={() => restore.mutate(version.version)}>{t('architecture.versions.restore')}</button>}
                    </span>
                    <span className="li-sub">{formatWhen(version.generated_at, locale)} · {version.providerLabel} · score {version.score}</span>
                  </div>
                ))}
              </div>
              <Source>POST /api/project-rooms/{'{'}room_id{'}'}/blueprints/{'{'}version{'}'}/restore</Source>
            </div>
          </section>
        </div>
        </>
      )}
    </>
  );
}
