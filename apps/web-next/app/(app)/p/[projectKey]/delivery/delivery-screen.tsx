'use client';

import type { DeliveryMode } from '@contracts/delivery.contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { EvidenceLine, type Station } from '@/components/evidence-line';
import { Icon, Signal } from '@/components/signal';
import { Badge, Kv, Notice, PageState, Skeleton, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useSay } from '@/lib/i18n/say';
import { useProject } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';

export function DeliveryScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const say = useSay();
  const project = useProject(projectKey);
  const { generatedProjectId, kernel, delivery } = project;
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [form, setForm] = useState({ namespace: '', repo_name: '', branch: 'main', commit_message: 'Initial commit from LDCN OS', visibility: 'private' as 'private' | 'public' | 'internal' });

  const quality = useQuery({
    queryKey: ['quality', generatedProjectId],
    queryFn: () => api.qualityReport(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const downloads = useQuery({ queryKey: ['downloads'], queryFn: api.downloads, retry: false });

  const choose = useMutation({
    mutationFn: (mode: DeliveryMode) => api.chooseDelivery(String(generatedProjectId), mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery', generatedProjectId] }),
  });
  const prepare = useMutation({ mutationFn: () => api.prepareDownload(String(generatedProjectId)) });
  const download = useMutation({
    mutationFn: () => api.downloadPackage(String(generatedProjectId)),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${generatedProjectId}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      void queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });
  const exportRepo = useMutation({
    mutationFn: () => api.exportToProvider(String(generatedProjectId), provider, form),
  });

  if (!generatedProjectId) {
    return (
      <PageState title={t('nav.delivery')} kind="empty" stateTitle={t('project.delivery.none')} illustration="completed">
        {t('project.delivery.noneBody')}
      </PageState>
    );
  }

  const decision = delivery.data;
  const kernelData = kernel.data;
  const qualityData = quality.data;
  const mine = (downloads.data ?? []).filter((record) => record.projectId === generatedProjectId);

  const checks = [
    {
      id: 'build',
      ok: kernelData?.build_verified ?? null,
      label: t('delivery.check.build'),
      detail: 'GET …/engineering-kernel · build_verified',
    },
    {
      id: 'quality',
      ok: qualityData ? qualityData.can_release : null,
      label: t('delivery.check.quality'),
      detail: 'GET …/quality-report · can_release',
    },
    {
      id: 'decision',
      ok: decision ? !decision.blocked : null,
      label: t('delivery.check.decision'),
      detail: 'GET …/delivery · blocked',
    },
  ];

  /* The path to the gate, one backend field per station; the gate itself is the owner's choice, never inferred. */
  const chosen = decision?.current_profile?.delivery_mode;
  const gate: readonly Station[] = [
    {
      id: 'build', name: t('map.station.build'),
      state: kernelData ? `build_verified: ${String(kernelData.build_verified)}` : 'unknown',
      family: kernelData ? (kernelData.build_verified ? 'proof' : 'caution') : 'unknown',
    },
    {
      id: 'quality', name: t('map.station.quality'),
      state: qualityData ? `can_release: ${String(qualityData.can_release)}` : 'unknown',
      family: qualityData ? (qualityData.can_release ? 'proof' : 'caution') : 'unknown',
    },
    {
      id: 'decision', name: t('delivery.gate.decision'),
      state: decision ? `blocked: ${String(decision.blocked)}` : 'unknown',
      family: decision ? (decision.blocked ? 'caution' : 'proof') : 'unknown',
    },
    {
      id: 'gate', name: t('map.station.delivery'), gate: true,
      state: chosen ? chosen.toUpperCase() : decision ? (decision.blocked ? 'BLOCKED' : 'NOT_CHOSEN') : 'unknown',
      family: chosen ? 'proof' : decision ? (decision.blocked ? 'caution' : 'hand') : 'unknown',
    },
  ];

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.delivery')}</span>
            <span className="chip mono">{generatedProjectId}</span>
            {decision ? <Badge value={decision.kernel_phase} family={familyFor(decision.kernel_phase)} /> : null}
          </div>
          <h1 className="title">{t('delivery.title')}</h1>
          <p className="lede">{t('delivery.lede')}</p>
        </div>
      </div>

      {decision?.blocked ? <Notice family="caution" title={t('delivery.blocked')}>{decision.block_reason}</Notice> : null}

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('delivery.checklist.title')}</h2></div>
        {delivery.isPending || kernel.isPending ? <Skeleton lines={3} /> : <EvidenceLine stations={gate} size="lg" label={t('delivery.gate.label')} />}
        <div className="list">
          {checks.map((check) => (
            <div className="li" key={check.id}>
              <Signal family={check.ok === null ? 'unknown' : check.ok ? 'proof' : 'caution'} label={check.label} />
              <span className="li-title">{check.label}</span>
              <span className="meta">{check.ok === null ? t('delivery.check.unknown') : check.ok ? t('delivery.check.yes') : t('delivery.check.no')}</span>
              <span className="li-sub mono">{check.detail}</span>
            </div>
          ))}
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('delivery.checklist.note')}</p>
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('delivery.mode.title')}</h2>
            {decision?.current_profile ? <Badge value={decision.current_profile.delivery_mode} family="proof" /> : null}
          </div>
          {delivery.isError ? <p className="meta">{t('project.delivery.unreadable')}</p> : null}
          {decision ? (
            <div className="stack">
              {decision.options.map((option) => (
                <article className={`choice${decision.current_profile?.delivery_mode === option.mode ? ' is-current' : ''}`} key={option.mode}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{say(option.label_key, option.label)}</strong>
                    <span className="chip mono">{option.mode}</span>
                    {option.recommended ? <Badge value="RECOMMENDED" family="proof" /> : null}
                  </div>
                  {option.reason_key || option.reason ? (
                    <p className="body ink2" style={{ margin: '6px 0 0' }}>{say(option.reason_key, option.reason, option.reason_params)}</p>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-hand btn-sm"
                      type="button"
                      disabled={choose.isPending || decision.current_profile?.delivery_mode === option.mode}
                      onClick={() => choose.mutate(option.mode)}
                    >
                      {decision.current_profile?.delivery_mode === option.mode ? t('delivery.mode.chosen') : t('delivery.mode.choose')}
                    </button>
                  </div>
                </article>
              ))}
              <p className="meta">{t('delivery.mode.note')}</p>
              <Source>GET · POST /api/meta-factory/{'{'}project_id{'}'}/delivery</Source>
            </div>
          ) : null}
        </section>

        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('delivery.package.title')}</h2></div>
          <div className="stack">
            <div className="btn-row">
              <button className="btn btn-ghost" type="button" disabled={prepare.isPending} onClick={() => prepare.mutate()}>
                {t('delivery.package.prepare')}
              </button>
              <button className="btn btn-primary" type="button" disabled={download.isPending} onClick={() => download.mutate()}>
                <Icon name="download" /> {t('delivery.package.download')}
              </button>
            </div>
            {prepare.isError ? <Notice family="fault" title={t('delivery.package.failed')}>{String(prepare.error)}</Notice> : null}
            {download.isError ? <Notice family="fault" title={t('delivery.package.failed')}>{String(download.error)}</Notice> : null}
            {prepare.data ? (
              <Kv
                pairs={[
                  [t('delivery.package.files'), <span key="f" className="num">{prepare.data.file_count}</span>],
                  [t('delivery.package.size'), <span key="s" className="num">{Math.round(prepare.data.zip_size_bytes / 1024)} kB</span>],
                  [t('delivery.package.security'), <Badge key="q" value={prepare.data.security.status} family={familyFor(prepare.data.security.status)} />],
                ]}
              />
            ) : null}
            <p className="meta">{t('delivery.package.note')}</p>
            <Source>POST /api/meta-factory/{'{'}project_id{'}'}/prepare-download · GET …/download</Source>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('delivery.git.title')}</h2>
          <div className="actions seg" role="group" aria-label={t('delivery.git.provider')}>
            {(['github', 'gitlab'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={provider === value} onClick={() => setProvider(value)}>{value}</button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t('delivery.git.namespace')}</span>
            <input value={form.namespace} onChange={(event) => setForm({ ...form, namespace: event.target.value })} placeholder="my-org" />
          </label>
          <label className="field">
            <span className="field-label">{t('delivery.git.repo')}</span>
            <input value={form.repo_name} onChange={(event) => setForm({ ...form, repo_name: event.target.value })} placeholder="nova-commerce" />
          </label>
          <label className="field">
            <span className="field-label">{t('delivery.git.branch')}</span>
            <input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">{t('delivery.git.visibility')}</span>
            <select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as 'private' | 'public' | 'internal' })}>
              <option value="private">private</option>
              <option value="public">public</option>
              <option value="internal">internal</option>
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field-label">{t('delivery.git.message')}</span>
            <input value={form.commit_message} onChange={(event) => setForm({ ...form, commit_message: event.target.value })} />
          </label>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={exportRepo.isPending || !form.namespace.trim() || !form.repo_name.trim()}
            onClick={() => exportRepo.mutate()}
          >
            <Icon name="git" /> {t('delivery.git.export', { provider })}
          </button>
        </div>
        {exportRepo.isError ? <Notice family="fault" title={t('delivery.git.failed')}>{String(exportRepo.error)}</Notice> : null}
        {exportRepo.data ? (
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <h3 className="h-sub">{t('delivery.git.result')}</h3>
              <Badge value={exportRepo.data.status} family={exportRepo.data.blocked ? 'caution' : familyFor(exportRepo.data.status)} />
            </div>
            <div className="panel-body stack">
              <p className="body ink2">{exportRepo.data.message}</p>
              <Kv
                pairs={[
                  [t('delivery.git.files'), <span key="f" className="num">{exportRepo.data.file_count}</span>],
                  [t('delivery.git.url'), exportRepo.data.repo_url
                    ? <a key="u" className="ext-mark" href={exportRepo.data.repo_url} target="_blank" rel="noreferrer">{exportRepo.data.repo_url} <Icon name="external" /></a>
                    : <span key="u" className="meta">—</span>],
                ]}
              />
            </div>
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('delivery.git.note')}</p>
        <Source>POST /api/meta-factory/{'{'}project_id{'}'}/export/{'{'}provider{'}'}</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('delivery.history.title')}</h2>
          <span className="meta">{t('delivery.history.meta', { count: mine.length })}</span>
        </div>
        {downloads.isPending ? <Skeleton lines={2} /> : null}
        {downloads.isError ? <p className="meta">{t('delivery.history.unreadable')}</p> : null}
        {!downloads.isPending && mine.length === 0 ? <p className="meta">{t('delivery.history.none')}</p> : null}
        {mine.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('delivery.history.when')}</th>
                  <th>{t('delivery.history.status')}</th>
                  <th className="r">{t('delivery.history.size')}</th>
                  <th>{t('delivery.history.checksum')}</th>
                  <th>{t('delivery.history.expires')}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((record) => (
                  <tr key={record.downloadId}>
                    <td className="meta nowrap">{formatWhen(record.createdAt, locale)}</td>
                    <td><Badge value={record.status} family={familyFor(record.status)} /></td>
                    <td className="r">{Math.round(record.sizeBytes / 1024)} kB</td>
                    <td className="id">{record.checksumSha256.slice(0, 16)}…</td>
                    <td className="meta nowrap">{formatWhen(record.expiresAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Source>GET /api/downloads</Source>
      </section>
    </>
  );
}
