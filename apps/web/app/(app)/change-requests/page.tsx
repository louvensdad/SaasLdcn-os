'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileDiff as FileDiffIcon,
  History,
  Plus,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  XCircle,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { useLocale } from '@/hooks/use-locale';
import { useProject } from '@/hooks/use-projects';
import {
  ChangeRequestApiError,
  changeRequestsClient,
  CONSCIOUS_APPROVAL_PHRASE,
  type ChangeRequest,
  type ChangeRequestFailureDiagnostic,
  type ChangeRequestStatus,
  type ChangeRequestSummary,
  type FileDiff,
} from '@/lib/api/change-requests';
import { cn } from '@/lib/cn';

type Translator = (key: string, values?: Record<string, string | number>) => string;

const LIFECYCLE: readonly ChangeRequestStatus[] = [
  'Draft', 'Analyzed', 'Planned', 'Approved', 'Applying', 'Validating', 'Accepted',
];

const STATUS_TONE: Record<ChangeRequestStatus, BadgeTone> = {
  Draft: 'neutral', Analyzed: 'accent', Planned: 'accent', Approved: 'accent',
  Applying: 'warning', Validating: 'warning', Accepted: 'success', Rejected: 'danger', 'Rolled Back': 'danger',
};

const STATUS_LABEL_KEY: Record<ChangeRequestStatus, string> = {
  Draft: 'changeRequests.status.draft',
  Analyzed: 'changeRequests.status.analyzed',
  Planned: 'changeRequests.status.planned',
  Approved: 'changeRequests.status.approved',
  Applying: 'changeRequests.status.applying',
  Validating: 'changeRequests.status.validating',
  Accepted: 'changeRequests.status.accepted',
  Rejected: 'changeRequests.status.rejected',
  'Rolled Back': 'changeRequests.status.rolledBack',
};

const DIFF_KIND_LABEL_KEY: Record<FileDiff['change_kind'], string> = {
  added: 'changeRequests.diffKind.added',
  modified: 'changeRequests.diffKind.modified',
  deleted: 'changeRequests.diffKind.deleted',
};

function statusLabel(t: Translator, status: ChangeRequestStatus) {
  return t(STATUS_LABEL_KEY[status]);
}

function diffKindLabel(t: Translator, kind: FileDiff['change_kind']) {
  return t(DIFF_KIND_LABEL_KEY[kind]);
}

export default function ChangeRequestsPage() {
  return (
    <Suspense fallback={<CardLoading />}>
      <ChangeRequestsInner />
    </Suspense>
  );
}

function ChangeRequestsInner() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const crId = searchParams.get('crId');
  const projectQuery = useProject(projectId);

  const [items, setItems] = useState<ChangeRequestSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [cr, setCr] = useState<ChangeRequest | null>(null);
  const [crLoading, setCrLoading] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);

  const reloadList = useCallback(async () => {
    if (!projectId) return;
    try {
      setListError(null);
      const data = await changeRequestsClient.listForProject(projectId);
      setItems(data);
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : t('changeRequests.errors.loadList'));
    }
  }, [projectId, t]);

  const loadCr = useCallback(async (id: string) => {
    setCrLoading(true);
    setCrError(null);
    try {
      const data = await changeRequestsClient.get(id);
      setCr(data);
    } catch (caught) {
      setCr(null);
      setCrError(caught instanceof Error ? caught.message : t('changeRequests.errors.loadDetail'));
    } finally {
      setCrLoading(false);
    }
  }, [t]);

  useEffect(() => { void reloadList(); }, [reloadList]);
  useEffect(() => { if (crId) void loadCr(crId); else setCr(null); }, [crId, loadCr]);

  function selectCr(id: string) {
    router.push(`/change-requests?projectId=${projectId}&crId=${id}`);
  }

  function backToList() {
    router.push(`/change-requests?projectId=${projectId}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <SectionHeader
        title={t('changeRequests.header.title')}
        description={t('changeRequests.header.description')}
      />
      {projectQuery.data ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="accent">{projectQuery.data.project_name}</Badge>
          <Link href={`/projects/${projectId}`} className="text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]">{t('changeRequests.header.backToProject')}</Link>
        </div>
      ) : null}

      {!projectId ? (
        <Blocked />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ChangeRequestList
            projectId={projectId}
            items={items}
            error={listError}
            selectedId={crId}
            onSelect={selectCr}
            onCreated={(created) => { void reloadList(); selectCr(created.change_request_id); }}
          />
          <div className="min-w-0">
            {!crId ? (
              <Card className="grid min-h-72 place-items-center text-center">
                <div>
                  <ScrollText className="mx-auto h-8 w-8 text-[color:var(--muted-2)]" aria-hidden />
                  <p className="mt-3 ds-body ds-text-muted">{t('changeRequests.empty.selectHint')}</p>
                </div>
              </Card>
            ) : crLoading ? (
              <CardLoading className="h-96" />
            ) : crError && !cr ? (
              <PageError title={t('changeRequests.errors.loadTitle')} description={crError} onRetry={() => void loadCr(crId)} />
            ) : cr ? (
              <ChangeRequestDetail cr={cr} setCr={setCr} onChanged={() => void reloadList()} onDeleted={backToList} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Blocked() {
  const { t } = useLocale();
  return (
    <Card className="glass space-y-4 p-8 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-[color:var(--warning)]" aria-hidden />
      <h2 className="ds-subsection text-[color:var(--text)]">{t('changeRequests.blocked.title')}</h2>
      <p className="mx-auto max-w-md ds-body ds-text-muted">{t('changeRequests.blocked.description')}</p>
      <div><Link href="/projects"><Button variant="primary">{t('changeRequests.blocked.cta')}</Button></Link></div>
    </Card>
  );
}

function ChangeRequestList({ projectId, items, error, selectedId, onSelect, onCreated }: {
  readonly projectId: string;
  readonly items: ChangeRequestSummary[] | null;
  readonly error: string | null;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onCreated: (cr: ChangeRequest) => void;
}) {
  const { t } = useLocale();
  const [intent, setIntent] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function create() {
    if (!intent.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await changeRequestsClient.create(projectId, intent.trim());
      setIntent('');
      onCreated(created);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : t('changeRequests.errors.create'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="t-overline">{t('changeRequests.list.newTitle')}</p>
        <textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder={t('changeRequests.list.placeholder')}
          rows={4}
          className="focus-ring w-full resize-y rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
        />
        {createError ? <p className="ds-caption text-[color:var(--danger)]">{createError}</p> : null}
        <Button variant="primary" className="w-full" loading={creating} disabled={!intent.trim()} onClick={() => void create()}>
          <Plus className="h-4 w-4" /> {t('changeRequests.list.createCta')}
        </Button>
      </Card>

      <Card className="space-y-2 p-3">
        <p className="t-overline px-2">{t('changeRequests.list.historyTitle')}</p>
        {error ? <p className="px-2 ds-caption text-[color:var(--danger)]">{error}</p> : null}
        {items === null ? (
          <p className="px-2 ds-caption text-[color:var(--muted-2)]">{t('changeRequests.list.loading')}</p>
        ) : items.length === 0 ? (
          <p className="px-2 ds-caption text-[color:var(--muted-2)]">{t('changeRequests.list.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.change_request_id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.change_request_id)}
                  className={cn(
                    'focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm transition',
                    selectedId === item.change_request_id ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]' : 'text-[color:var(--muted)] hover:bg-white/5 hover:text-[color:var(--text)]',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.intent || t('changeRequests.list.noDescription')}</span>
                    <span className="mt-0.5 flex items-center gap-2"><Badge tone={STATUS_TONE[item.status]}>{statusLabel(t, item.status)}</Badge></span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ChangeRequestDetail({ cr, setCr, onChanged, onDeleted }: {
  readonly cr: ChangeRequest;
  readonly setCr: (cr: ChangeRequest) => void;
  readonly onChanged: () => void;
  readonly onDeleted: () => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ChangeRequestFailureDiagnostic | null>(cr.last_failure ?? null);
  const [confirmation, setConfirmation] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  useEffect(() => {
    setDiagnostic(cr.last_failure ?? null);
    setConfirmation('');
  }, [cr.change_request_id, cr.status, cr.last_failure]);

  async function run<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    setBusy(true);
    setDiagnostic(null);
    try {
      const result = await action();
      onSuccess(result);
      onChanged();
    } catch (caught) {
      if (caught instanceof ChangeRequestApiError && caught.diagnostic) setDiagnostic(caught.diagnostic);
      else setDiagnostic({
        status_current: cr.status, status_expected: [], endpoint_called: '', http_status: 0,
        backend_message: caught instanceof Error ? caught.message : t('changeRequests.errors.unexpected'),
        rejection_reason: caught instanceof Error ? caught.message : t('changeRequests.errors.unexpected'), correction: t('changeRequests.errors.retryHint'), checks: [],
      });
    } finally {
      setBusy(false);
    }
  }

  const phraseOk = confirmation.trim() === CONSCIOUS_APPROVAL_PHRASE;
  const isTerminal = cr.status === 'Rejected' || cr.status === 'Rolled Back';

  return (
    <div className="space-y-6">
      <Card className="glass space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="t-overline">{t('changeRequests.detail.eyebrow')}</p>
            <h2 className="mt-1 ds-subsection break-words text-[color:var(--text)]">{cr.intent || t('changeRequests.list.noDescription')}</h2>
          </div>
          <Badge tone={STATUS_TONE[cr.status]}>{statusLabel(t, cr.status)}</Badge>
        </div>
        <ChangeRequestStepper status={cr.status} />
      </Card>

      {cr.classification ? (
        <Card className="space-y-2">
          <p className="t-overline">{t('changeRequests.detail.classification')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{cr.classification.category}</Badge>
            <Badge tone="neutral">{t('changeRequests.detail.blueprintImpact')} {cr.classification.blueprint_impact}</Badge>
            {cr.classification.degraded ? <Badge tone="warning">{t('changeRequests.detail.deterministicMode')}</Badge> : null}
          </div>
          <p className="ds-caption">{cr.classification.reason}</p>
        </Card>
      ) : null}

      {cr.impact ? (
        <Card className="space-y-2">
          <p className="t-overline">{t('changeRequests.detail.impact')}</p>
          <p className="ds-caption">{cr.impact.summary}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><p className="ds-caption text-[color:var(--muted-2)]">{t('changeRequests.detail.affectedFiles', { count: cr.impact.affected_files.length })}</p><ul className="mt-1 space-y-0.5 font-mono text-xs text-[color:var(--text)]">{cr.impact.affected_files.map((path) => <li key={path} className="truncate">{path}</li>)}</ul></div>
            {cr.impact.out_of_scope_risk.length ? <div><p className="ds-caption text-[color:var(--muted-2)]">{t('changeRequests.detail.outOfScopeRisk')}</p><ul className="mt-1 space-y-0.5 font-mono text-xs text-[color:var(--warning)]">{cr.impact.out_of_scope_risk.map((path) => <li key={path} className="truncate">{path}</li>)}</ul></div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {cr.impact.requires_backend_change ? <Badge tone="warning">{t('changeRequests.detail.requiresBackendChange')}</Badge> : null}
            {cr.impact.requires_blueprint_update ? <Badge tone="warning">{t('changeRequests.detail.requiresBlueprintUpdate')}</Badge> : null}
          </div>
        </Card>
      ) : null}

      {cr.status === 'Planned' ? (
        <Card className="space-y-4 border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))]">
          <div className="flex items-center gap-2"><AlertOctagon className="h-5 w-5 text-[color:var(--warning)]" aria-hidden /><h3 className="ds-subsection text-[color:var(--text)]">{t('changeRequests.detail.consciousApproval')}</h3></div>
          <p className="ds-caption">{t('changeRequests.detail.typeExactly')} <span className="t-mono font-semibold text-[color:var(--text)]">{CONSCIOUS_APPROVAL_PHRASE}</span> {t('changeRequests.detail.approvalSuffix')}</p>
          <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={CONSCIOUS_APPROVAL_PHRASE} error={confirmation.length > 0 && !phraseOk} aria-label={t('changeRequests.detail.approvalConfirmationAria')} />
        </Card>
      ) : null}

      {(cr.build_result || cr.preview_result) ? (
        <Card className="space-y-4">
          <p className="t-overline">{t('changeRequests.detail.buildPreview')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {cr.build_result ? (
              <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[color:var(--text)]">{t('changeRequests.detail.build')}</p><Badge tone={cr.build_result.ok ? 'success' : 'danger'}>{cr.build_result.ok ? t('changeRequests.detail.buildOk') : t('changeRequests.detail.buildFailed')}</Badge></div>
                <p className="mt-1 ds-caption">{t('changeRequests.detail.buildSummary', { installed: cr.build_result.installed, built: cr.build_result.built })}</p>
                {cr.build_result.skipped_reason ? <p className="mt-1 ds-caption text-[color:var(--muted-2)]">{cr.build_result.skipped_reason}</p> : null}
              </div>
            ) : null}
            {cr.preview_result ? (
              <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[color:var(--text)]">{t('changeRequests.detail.preview')}</p><Badge tone={cr.preview_result.supported ? (cr.preview_result.crash_count > 0 ? 'danger' : 'success') : 'neutral'}>{cr.preview_result.supported ? t('changeRequests.detail.routesCount', { count: cr.preview_result.routes.length }) : t('changeRequests.detail.notSupported')}</Badge></div>
                <p className="mt-1 ds-caption">{cr.preview_result.reason || (cr.preview_result.supported ? t('changeRequests.detail.previewFallbackReason') : '')}</p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <ChangeRequestDiffPanel files={cr.diff} />

      <FailureDiagnosticPanel diagnostic={diagnostic} />

      <Card className="space-y-4">
        <p className="t-overline">{t('changeRequests.detail.actions')}</p>
        <div className="flex flex-wrap gap-3">
          {cr.status === 'Draft' ? (
            <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.analyze(cr.change_request_id), setCr)}><Wand2 className="h-4 w-4" /> {t('changeRequests.actions.analyze')}</Button>
          ) : null}
          {cr.status === 'Analyzed' ? (
            <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.plan(cr.change_request_id), setCr)}><Wand2 className="h-4 w-4" /> {t('changeRequests.actions.plan')}</Button>
          ) : null}
          {cr.status === 'Planned' ? (
            <Button variant="primary" loading={busy} disabled={!phraseOk} onClick={() => void run(() => changeRequestsClient.approve(cr.change_request_id, confirmation.trim()), setCr)}><ThumbsUp className="h-4 w-4" /> {t('changeRequests.actions.approve')}</Button>
          ) : null}
          {cr.status === 'Approved' ? (
            <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.apply(cr.change_request_id), setCr)}><Wand2 className="h-4 w-4" /> {t('changeRequests.actions.apply')}</Button>
          ) : null}
          {cr.status === 'Validating' ? (
            <>
              <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.accept(cr.change_request_id), setCr)}><ThumbsUp className="h-4 w-4" /> {t('changeRequests.actions.accept')}</Button>
              <div className="flex min-w-64 flex-1 items-center gap-2">
                <Input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder={t('changeRequests.actions.rejectReasonPlaceholder')} aria-label={t('changeRequests.actions.rejectReasonPlaceholder')} />
                <Button variant="danger" className="shrink-0 whitespace-nowrap" loading={busy} disabled={!rejectReason.trim()} onClick={() => void run(() => changeRequestsClient.reject(cr.change_request_id, rejectReason.trim()), (result) => { setCr(result); setRejectReason(''); })}><ThumbsDown className="h-4 w-4" /> {t('changeRequests.actions.reject')}</Button>
              </div>
            </>
          ) : null}
          {cr.status === 'Accepted' ? (
            <div className="flex min-w-64 flex-1 items-center gap-2">
              <Input value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder={t('changeRequests.actions.rollbackReasonPlaceholder')} aria-label={t('changeRequests.actions.rollbackReasonPlaceholder')} />
              <Button variant="danger" className="shrink-0 whitespace-nowrap" loading={busy} disabled={!rollbackReason.trim()} onClick={() => void run(() => changeRequestsClient.rollback(cr.change_request_id, rollbackReason.trim()), (result) => { setCr(result); setRollbackReason(''); })}><RotateCcw className="h-4 w-4" /> {t('changeRequests.actions.rollback')}</Button>
            </div>
          ) : null}
          {isTerminal ? <p className="ds-caption text-[color:var(--muted-2)]">{t('changeRequests.actions.terminalState')}</p> : null}
        </div>
        {cr.result ? <p className="ds-caption">{t('changeRequests.detail.result')} <span className="font-semibold text-[color:var(--text)]">{cr.result.outcome}</span>{cr.result.reason ? ` — ${cr.result.reason}` : ''}</p> : null}
        <div className="border-t border-[color:var(--border)] pt-3">
          <DeleteResourceButton
            title={t('changeRequests.delete.title')}
            description={t('changeRequests.delete.description')}
            triggerLabel={t('changeRequests.delete.trigger')}
            onConfirm={async () => { await changeRequestsClient.remove(cr.change_request_id); onChanged(); onDeleted(); }}
          />
        </div>
      </Card>

      <HistoryPanel history={cr.history} operationalLog={cr.operational_log} />
    </div>
  );
}

function ChangeRequestStepper({ status }: { readonly status: ChangeRequestStatus }) {
  const { t } = useLocale();
  if (status === 'Rejected' || status === 'Rolled Back') {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm">
        <XCircle className="h-4 w-4 text-[color:var(--danger)]" aria-hidden /><span className="text-[color:var(--text)]">{statusLabel(t, status)}</span>
      </div>
    );
  }
  const currentIndex = LIFECYCLE.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {LIFECYCLE.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
        return (
          <li key={step} className="flex items-center gap-1.5">
            <span className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              state === 'done' ? 'border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[color:var(--success)]' :
              state === 'current' ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]' :
              'border-[color:var(--border)] text-[color:var(--muted-2)]',
            )}>
              {state === 'done' ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : null}
              {statusLabel(t, step)}
            </span>
            {index < LIFECYCLE.length - 1 ? <ChevronRight className="h-3 w-3 text-[color:var(--muted-2)]" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ChangeRequestDiffPanel({ files }: { readonly files: readonly FileDiff[] }) {
  const { t } = useLocale();
  const [openPath, setOpenPath] = useState<string | null>(null);
  if (!files.length) return null;
  const kindTone: Record<FileDiff['change_kind'], BadgeTone> = { added: 'success', modified: 'accent', deleted: 'danger' };
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><FileDiffIcon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden /><p className="t-overline">{t('changeRequests.diff.title', { count: files.length })}</p></div>
      <div className="space-y-2">
        {files.map((file) => {
          const open = openPath === file.path;
          return (
            <div key={file.path} className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]">
              <button type="button" onClick={() => setOpenPath(open ? null : file.path)} className="focus-ring flex w-full items-center justify-between gap-2 bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] px-3 py-2 text-left text-sm">
                <span className="truncate font-mono text-xs text-[color:var(--text)]">{file.path}</span>
                <Badge tone={kindTone[file.change_kind]}>{diffKindLabel(t, file.change_kind)}</Badge>
              </button>
              {open ? <DiffBody diff={file.unified_diff} /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DiffBody({ diff }: { readonly diff: string }) {
  const { t } = useLocale();
  if (!diff.trim()) return <p className="p-3 ds-caption text-[color:var(--muted-2)]">{t('changeRequests.diff.empty')}</p>;
  const lines = diff.split('\n');
  return (
    <pre className="max-h-96 overflow-auto bg-black/30 p-3 font-mono text-xs leading-relaxed">
      {lines.map((line, index) => (
        <div key={index} className={cn(
          line.startsWith('+') && !line.startsWith('+++') ? 'text-[color:var(--success)]' :
          line.startsWith('-') && !line.startsWith('---') ? 'text-[color:var(--danger)]' :
          line.startsWith('@@') ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted)]',
        )}>{line || ' '}</div>
      ))}
    </pre>
  );
}

function FailureDiagnosticPanel({ diagnostic }: { readonly diagnostic: ChangeRequestFailureDiagnostic | null }) {
  const { t } = useLocale();
  if (!diagnostic) return null;
  return (
    <Card className="space-y-2 border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-sm">
      <p className="flex items-center gap-2 font-semibold text-[color:var(--text)]"><AlertTriangle className="h-4 w-4 text-[color:var(--danger)]" aria-hidden /> {t('changeRequests.diagnostic.title')}</p>
      <p>{t('changeRequests.diagnostic.currentStatus')} <span className="font-mono">{diagnostic.status_current}</span></p>
      {diagnostic.status_expected.length ? <p>{t('changeRequests.diagnostic.expectedStatus')} <span className="font-mono">{diagnostic.status_expected.join(', ')}</span></p> : null}
      <p>{diagnostic.backend_message}</p>
      <p className="text-[color:var(--muted)]">{t('changeRequests.diagnostic.suggestedFix')} {diagnostic.correction}</p>
    </Card>
  );
}

function HistoryPanel({ history, operationalLog }: { readonly history: ChangeRequest['history']; readonly operationalLog: ChangeRequest['operational_log'] }) {
  const { t, locale } = useLocale();
  if (!history.length && !operationalLog.length) return null;
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-[color:var(--accent)]" aria-hidden /><p className="t-overline">{t('changeRequests.list.historyTitle')}</p></div>
      {history.length ? (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="border-b border-[color:var(--border)] pb-2 text-sm last:border-0">
              <span className="text-[color:var(--muted-2)]">{new Date(entry.created_at).toLocaleString(locale)}</span>{' '}
              <span className="text-[color:var(--text)]">{entry.event}</span>{' '}
              <span className="text-[color:var(--muted-2)]">({entry.source})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {operationalLog.length ? (
        <div className="max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/20 p-3">
          <p className="t-overline mb-2">{t('changeRequests.history.operationalLog')}</p>
          <ul className="space-y-1.5 font-mono text-xs text-[color:var(--text)]/90">
            {operationalLog.slice(-20).map((entry) => (
              <li key={entry.id} className={cn(entry.status === 'failed' ? 'text-[color:var(--danger)]' : entry.status === 'success' ? 'text-[color:var(--success)]' : 'text-[color:var(--muted)]')}>
                {new Date(entry.timestamp).toLocaleTimeString(locale)} — {entry.method ?? ''} {entry.endpoint ?? ''} {entry.http_status ?? ''} — {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
