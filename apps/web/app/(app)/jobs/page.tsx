'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Archive, ArchiveRestore, Download, ExternalLink, History } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { useGenerationJobs, useSetJobArchived, useDeleteJob } from '@/hooks/use-generation-jobs';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';
import { metaFactoryClient, TERMINAL_JOB_STATUSES } from '@/lib/api/meta-factory';
import type { GenerationJobSummary } from '@contracts/generation-job.contract';

type Tab = 'active' | 'archived';

function statusTone(status: GenerationJobSummary['status']): BadgeTone {
  if (status === 'READY') return 'success';
  if (status === 'FAILED' || status === 'STALLED') return 'danger';
  if (status === 'NEEDS_USER_ACTION' || status === 'PAUSED') return 'warning';
  return 'accent';
}

function formatDate(value: string, locale: string) {
  try {
    return new Date(value).toLocaleString(locale);
  } catch {
    return value;
  }
}

export default function GenerationJobsPage() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<Tab>('active');
  const jobsQuery = useGenerationJobs(tab === 'archived');
  const setArchived = useSetJobArchived();
  const deleteJob = useDeleteJob();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const jobs = jobsQuery.data ?? [];

  async function handleToggleArchived(job: GenerationJobSummary) {
    setBusyId(job.id);
    setActionError(null);
    try {
      await setArchived.mutateAsync({ jobId: job.id, archived: !job.archived });
    } catch (err) {
      setActionError(getApiErrorMessage(err, t('jobs.error.archive')));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(job: GenerationJobSummary) {
    if (!job.generatedProjectId) return;
    setBusyId(job.id);
    setActionError(null);
    try {
      await metaFactoryClient.download(job.generatedProjectId);
    } catch (err) {
      setActionError(getApiErrorMessage(err, t('jobs.error.download')));
    } finally {
      setBusyId(null);
    }
  }

  if (jobsQuery.isLoading) return <CardLoading />;
  if (jobsQuery.isError) {
    return (
      <PageError
        title={t('jobs.error.title')}
        description={getApiErrorMessage(jobsQuery.error, t('jobs.error.description'))}
        onRetry={() => void jobsQuery.refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <SectionHeader title={t('jobs.title')} description={t('jobs.subtitle')} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('active')}
          className="focus-ring rounded-full border px-4 py-1.5 text-sm font-medium transition data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] data-[active=true]:text-[color:var(--text)] data-[active=false]:border-[color:var(--border)] data-[active=false]:text-[color:var(--muted)]"
          data-active={tab === 'active'}
        >
          {t('jobs.tabs.active')}
        </button>
        <button
          type="button"
          onClick={() => setTab('archived')}
          className="focus-ring rounded-full border px-4 py-1.5 text-sm font-medium transition data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] data-[active=true]:text-[color:var(--text)] data-[active=false]:border-[color:var(--border)] data-[active=false]:text-[color:var(--muted)]"
          data-active={tab === 'archived'}
        >
          <Archive className="mr-1.5 inline h-3.5 w-3.5" />
          {t('jobs.tabs.archived')}
        </button>
      </div>

      {actionError ? <p className="text-sm text-[color:var(--danger)]">{actionError}</p> : null}

      {jobs.length === 0 ? (
        <Card className="glass noise space-y-3 p-8 text-center">
          <History className="mx-auto h-8 w-8 text-[color:var(--muted)]" aria-hidden />
          <p className="ds-body ds-text-muted">
            {tab === 'active' ? t('jobs.empty.active') : t('jobs.empty.archived')}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const terminal = TERMINAL_JOB_STATUSES.has(job.status);
            const busy = busyId === job.id;
            return (
              <Card key={job.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[color:var(--text)]">{job.projectName}</p>
                    <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                    {job.model ? <span className="t-mono text-xs text-[color:var(--muted-2)]">{job.providerLabel} · {job.model}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {t('jobs.row.created')} {formatDate(job.createdAt, locale)}
                    {job.finishedAt ? ` · ${t('jobs.row.finished')} ${formatDate(job.finishedAt, locale)}` : ` · ${t('jobs.row.progress')} ${job.progress}%`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/meta-factory?projectId=${encodeURIComponent(job.projectId)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-background/60"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {t('jobs.row.open')}
                  </Link>
                  {job.generatedProjectId && job.status === 'READY' ? (
                    <Button variant="ghost" loading={busy} disabled={busy} onClick={() => void handleDownload(job)}>
                      <Download className="h-4 w-4" /> {t('jobs.row.download')}
                    </Button>
                  ) : null}
                  {terminal ? (
                    <Button variant="ghost" loading={busy} disabled={busy} onClick={() => void handleToggleArchived(job)}>
                      {job.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      {job.archived ? t('jobs.row.unarchive') : t('jobs.row.archive')}
                    </Button>
                  ) : null}
                  {terminal ? (
                    <DeleteResourceButton
                      title={t('jobs.delete.title')}
                      description={t('jobs.delete.description', { name: job.projectName })}
                      triggerLabel={t('jobs.row.delete')}
                      onConfirm={async () => {
                        await deleteJob.mutateAsync(job.id);
                      }}
                    />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
