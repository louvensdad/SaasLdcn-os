'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DecisionMap } from '@/components/drawings/decision-map';
import { Signal } from '@/components/signal';
import { Badge, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function ArchitectureScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const room = useQuery({ queryKey: ['room', projectKey], queryFn: () => api.room(projectKey), retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['room', projectKey] });
  const generate = useMutation({ mutationFn: () => api.generateBlueprint(projectKey), onSuccess: refresh });
  const approveStack = useMutation({ mutationFn: () => api.approveStack(projectKey), onSuccess: refresh });
  const restore = useMutation({ mutationFn: (version: number) => api.restoreBlueprint(projectKey, version), onSuccess: refresh });

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
          <button className="btn btn-primary" type="button" disabled={generate.isPending || !data.prompt_master_md} onClick={() => generate.mutate()}>
            {generate.isPending ? t('architecture.generating') : t('architecture.generate')}
          </button>
        </div>
      </div>

      {generate.isError ? <Notice family="fault" title={t('architecture.failed')}>{String(generate.error)}</Notice> : null}

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
                <span className="meta mono">{item.choice}</span>
                <span className="li-sub">
                  {item.reason}
                  {item.alternatives.length > 0 ? ` · ${t('architecture.stack.alternatives')}: ${item.alternatives.join(', ')}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-hand" type="button" disabled={approveStack.isPending || stack.status === 'APPROVED'} onClick={() => approveStack.mutate()}>
              {stack.status === 'APPROVED' ? t('architecture.stack.approved') : t('architecture.stack.approve')}
            </button>
          </div>
          <p className="meta" style={{ marginTop: 10 }}>{t('architecture.stack.note')}</p>
          <Source>POST /api/project-rooms/{'{'}room_id{'}'}/stack/approve</Source>
        </section>
      ) : null}

      {!blueprint ? (
        <StateBlock kind="empty" title={t('architecture.none')}>{t('architecture.noneBody')}</StateBlock>
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
