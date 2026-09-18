'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { ChangeTrace } from '@/components/drawings/change-trace';
import { EvidenceLine } from '@/components/evidence-line';
import { Badge, Kv, Failure, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { lifecycle } from '@/lib/engineering/change-trace';
import { familyFor } from '@/lib/status';

type Action = 'analyze' | 'plan' | 'approve' | 'apply' | 'accept' | 'reject' | 'rollback';

/** Which action the backend will accept at each status — the button that would 409 is never offered. */
const ALLOWED: Readonly<Record<string, readonly Action[]>> = {
  Draft: ['analyze'],
  Analyzed: ['plan', 'reject'],
  Planned: ['approve', 'reject'],
  Approved: ['apply', 'reject'],
  Applying: [],
  Validating: [],
  Accepted: ['rollback'],
  Rejected: [],
  'Rolled Back': [],
};

export function ChangeScreen({ projectKey, changeRequestId }: { readonly projectKey: string; readonly changeRequestId: string }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const base = `/p/${encodeURIComponent(projectKey)}/engineering/changes`;

  const change = useQuery({ queryKey: ['change-request', changeRequestId], queryFn: () => api.changeRequest(changeRequestId), retry: false });
  const diff = useQuery({ queryKey: ['change-diff', changeRequestId], queryFn: () => api.changeRequestDiff(changeRequestId), retry: false });
  const act = useMutation({
    mutationFn: (action: Action) => api.changeRequestAction(changeRequestId, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change-request', changeRequestId] });
      void queryClient.invalidateQueries({ queryKey: ['change-diff', changeRequestId] });
      void queryClient.invalidateQueries({ queryKey: ['change-requests'] });
    },
  });

  if (change.isPending) return <Skeleton lines={6} />;
  if (!change.data) {
    return (
      <PageState title={t('nav.changes')} kind="unknown" stateTitle={t('change.none')} action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href={base}>{t('changes.title')}</Link></div>}>
        {t('change.noneBody', { id: changeRequestId })}
      </PageState>
    );
  }

  const data = change.data;
  const files = diff.data?.files ?? data.diff ?? [];
  const actions = ALLOWED[data.status] ?? [];

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.changes')}</span>
            <span className="chip mono">{data.change_request_id}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
          </div>
          <h1 className="title">{data.intent}</h1>
          <p className="lede">{t('change.lede', { when: formatWhen(data.created_at, locale) })}</p>
        </div>
        <div className="btn-row"><Link className="btn btn-ghost" href={base}>{t('change.back')}</Link></div>
      </div>

      {act.isError ? <Failure title={t('change.actionFailed')} error={act.error} /> : null}
      {data.last_failure ? (
        <Notice family="fault" title={t('change.lastFailure')}>{JSON.stringify(data.last_failure)}</Notice>
      ) : null}

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('changemap.lifecycle')}</h2></div>
        <EvidenceLine
          label={t('changemap.lifecycle')}
          size="lg"
          stations={lifecycle(data.status, t('changemap.reached')).map((stage) => ({
            id: stage.id, name: stage.id, state: stage.state, family: stage.family, current: stage.current, gate: stage.id === 'Accepted',
          }))}
        />
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('change.decide.title')}</h2></div>
        {actions.length === 0 ? (
          <p className="meta">{t('change.decide.none', { status: data.status })}</p>
        ) : (
          <div className="btn-row">
            {actions.map((action) => (
              <button
                key={action}
                className={`btn ${action === 'reject' || action === 'rollback' ? 'btn-danger' : 'btn-hand'}`}
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate(action)}
              >
                {t(`change.action.${action}`)}
              </button>
            ))}
          </div>
        )}
        <p className="meta" style={{ marginTop: 10 }}>{t('change.decide.note')}</p>
        <Source>POST /api/change-requests/{'{'}id{'}'}/analyze · plan · approve · apply · accept · reject · rollback</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('changemap.label')}</h2>
          <span className="meta">{t('changemap.note')}</span>
        </div>
        <ChangeTrace change={data} files={files} />
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('change.what.title')}</h2></div>
          <Kv
            pairs={[
              [t('change.project'), <span key="p" className="mono">{data.project_id}</span>],
              [t('change.classification'), data.classification
                ? <span key="c" className="mono">{String((data.classification as { classification?: string }).classification ?? '—')}</span>
                : <span key="c" className="meta">{t('common.notYet')}</span>],
              [t('change.scope'), data.scope.length > 0
                ? <span key="s" className="chips">{data.scope.map((item) => <span className="chip mono" key={item}>{item}</span>)}</span>
                : <span key="s" className="meta">—</span>],
              [t('change.approval'), data.approval
                ? `${data.approval.approved_by} · ${formatWhen(data.approval.approved_at, locale)}`
                : <span key="a" className="meta">{t('common.notYet')}</span>],
              [t('change.result'), data.result
                ? <Badge key="r" value={data.result.outcome} family={familyFor(data.result.outcome)} human={data.result.reason} />
                : <span key="r" className="meta">{t('common.notYet')}</span>],
            ]}
          />
          <Source>GET /api/change-requests/{'{'}id{'}'}</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('change.history.title')}</h2>
            <span className="meta">{t('change.history.meta', { count: data.history.length })}</span>
          </div>
          <div className="list">
            {data.history.slice(-8).reverse().map((event) => (
              <div className="li" key={event.id}>
                <span className="mono" style={{ width: 16 }} />
                <span className="li-title mono">{event.event}</span>
                <span className="meta nowrap">{formatWhen(event.created_at, locale)}</span>
                <span className="li-sub">{event.actor} · {event.source}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('change.diff.title')}</h2>
          <span className="meta">{t('change.diff.meta', { count: files.length })}</span>
        </div>
        {diff.isPending ? <Skeleton lines={4} /> : null}
        {files.length === 0 ? (
          <StateBlock kind="empty" title={t('change.diff.none')}>{t('change.diff.noneBody')}</StateBlock>
        ) : (
          <div className="stack">
            {files.map((file) => (
              <div className="diff" key={file.path}>
                <div className="diff-file">
                  <span className="mono">{file.path}</span>
                  <Badge value={file.change_kind} family={familyFor(file.change_kind)} />
                </div>
                <pre className="code">{file.unified_diff || file.after || ''}</pre>
              </div>
            ))}
          </div>
        )}
        <Source>GET /api/change-requests/{'{'}id{'}'}/diff</Source>
      </section>
    </>
  );
}
