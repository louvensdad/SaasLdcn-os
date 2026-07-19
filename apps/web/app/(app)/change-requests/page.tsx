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

const LIFECYCLE: readonly ChangeRequestStatus[] = [
  'Draft', 'Analyzed', 'Planned', 'Approved', 'Applying', 'Validating', 'Accepted',
];

const STATUS_TONE: Record<ChangeRequestStatus, BadgeTone> = {
  Draft: 'neutral', Analyzed: 'accent', Planned: 'accent', Approved: 'accent',
  Applying: 'warning', Validating: 'warning', Accepted: 'success', Rejected: 'danger', 'Rolled Back': 'danger',
};

export default function ChangeRequestsPage() {
  return (
    <Suspense fallback={<CardLoading />}>
      <ChangeRequestsInner />
    </Suspense>
  );
}

function ChangeRequestsInner() {
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
      setListError(caught instanceof Error ? caught.message : 'Falha ao carregar as alteracoes deste projeto.');
    }
  }, [projectId]);

  const loadCr = useCallback(async (id: string) => {
    setCrLoading(true);
    setCrError(null);
    try {
      const data = await changeRequestsClient.get(id);
      setCr(data);
    } catch (caught) {
      setCr(null);
      setCrError(caught instanceof Error ? caught.message : 'Falha ao carregar o Change Request.');
    } finally {
      setCrLoading(false);
    }
  }, []);

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
        title="Alteracoes do projeto"
        description="Peça, planeje, aprove e aplique alteracoes incrementais no codigo ja gerado deste projeto — com diff, build, preview e rollback."
      />
      {projectQuery.data ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="accent">{projectQuery.data.project_name}</Badge>
          <Link href={`/projects/${projectId}`} className="text-sm text-[color:var(--muted)] hover:text-[color:var(--text)]">Voltar ao projeto</Link>
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
                  <p className="mt-3 ds-body ds-text-muted">Selecione uma alteracao a esquerda, ou crie uma nova.</p>
                </div>
              </Card>
            ) : crLoading ? (
              <CardLoading className="h-96" />
            ) : crError && !cr ? (
              <PageError title="Nao foi possivel carregar" description={crError} onRetry={() => void loadCr(crId)} />
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
  return (
    <Card className="glass space-y-4 p-8 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-[color:var(--warning)]" aria-hidden />
      <h2 className="ds-subsection text-[color:var(--text)]">Nenhum projeto selecionado</h2>
      <p className="mx-auto max-w-md ds-body ds-text-muted">Abra esta pagina a partir de um projeto ja gerado para pedir alteracoes no codigo dele.</p>
      <div><Link href="/projects"><Button variant="primary">Ver meus projetos</Button></Link></div>
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
      setCreateError(caught instanceof Error ? caught.message : 'Falha ao criar o Change Request.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="t-overline">Nova alteracao</p>
        <textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="Descreva a alteracao desejada, ex: 'Adicionar um botao de exportar CSV na tela de pedidos'"
          rows={4}
          className="focus-ring w-full resize-y rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
        />
        {createError ? <p className="ds-caption text-[color:var(--danger)]">{createError}</p> : null}
        <Button variant="primary" className="w-full" loading={creating} disabled={!intent.trim()} onClick={() => void create()}>
          <Plus className="h-4 w-4" /> Criar Change Request
        </Button>
      </Card>

      <Card className="space-y-2 p-3">
        <p className="t-overline px-2">Historico</p>
        {error ? <p className="px-2 ds-caption text-[color:var(--danger)]">{error}</p> : null}
        {items === null ? (
          <p className="px-2 ds-caption text-[color:var(--muted-2)]">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="px-2 ds-caption text-[color:var(--muted-2)]">Nenhuma alteracao criada ainda.</p>
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
                    <span className="block truncate font-medium">{item.intent || '(sem descricao)'}</span>
                    <span className="mt-0.5 flex items-center gap-2"><Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge></span>
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
        backend_message: caught instanceof Error ? caught.message : 'Falha inesperada.',
        rejection_reason: caught instanceof Error ? caught.message : 'Falha inesperada.', correction: 'Tente novamente.', checks: [],
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
            <p className="t-overline">Change Request</p>
            <h2 className="mt-1 ds-subsection break-words text-[color:var(--text)]">{cr.intent || '(sem descricao)'}</h2>
          </div>
          <Badge tone={STATUS_TONE[cr.status]}>{cr.status}</Badge>
        </div>
        <ChangeRequestStepper status={cr.status} />
      </Card>

      {cr.classification ? (
        <Card className="space-y-2">
          <p className="t-overline">Classificacao</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{cr.classification.category}</Badge>
            <Badge tone="neutral">impacto no blueprint: {cr.classification.blueprint_impact}</Badge>
            {cr.classification.degraded ? <Badge tone="warning">modo deterministico</Badge> : null}
          </div>
          <p className="ds-caption">{cr.classification.reason}</p>
        </Card>
      ) : null}

      {cr.impact ? (
        <Card className="space-y-2">
          <p className="t-overline">Impacto</p>
          <p className="ds-caption">{cr.impact.summary}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><p className="ds-caption text-[color:var(--muted-2)]">Arquivos afetados ({cr.impact.affected_files.length})</p><ul className="mt-1 space-y-0.5 font-mono text-xs text-[color:var(--text)]">{cr.impact.affected_files.map((path) => <li key={path} className="truncate">{path}</li>)}</ul></div>
            {cr.impact.out_of_scope_risk.length ? <div><p className="ds-caption text-[color:var(--muted-2)]">Risco fora de escopo</p><ul className="mt-1 space-y-0.5 font-mono text-xs text-[color:var(--warning)]">{cr.impact.out_of_scope_risk.map((path) => <li key={path} className="truncate">{path}</li>)}</ul></div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {cr.impact.requires_backend_change ? <Badge tone="warning">requer mudanca de backend</Badge> : null}
            {cr.impact.requires_blueprint_update ? <Badge tone="warning">requer atualizacao do blueprint</Badge> : null}
          </div>
        </Card>
      ) : null}

      {cr.status === 'Planned' ? (
        <Card className="space-y-4 border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))]">
          <div className="flex items-center gap-2"><AlertOctagon className="h-5 w-5 text-[color:var(--warning)]" aria-hidden /><h3 className="ds-subsection text-[color:var(--text)]">Confirmacao consciente</h3></div>
          <p className="ds-caption">Digite exatamente <span className="t-mono font-semibold text-[color:var(--text)]">{CONSCIOUS_APPROVAL_PHRASE}</span> para aprovar a aplicacao desta alteracao.</p>
          <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={CONSCIOUS_APPROVAL_PHRASE} error={confirmation.length > 0 && !phraseOk} aria-label="Confirmacao de aprovacao" />
        </Card>
      ) : null}

      {(cr.build_result || cr.preview_result) ? (
        <Card className="space-y-4">
          <p className="t-overline">Build &amp; Preview</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {cr.build_result ? (
              <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[color:var(--text)]">Build</p><Badge tone={cr.build_result.ok ? 'success' : 'danger'}>{cr.build_result.ok ? 'ok' : 'falhou'}</Badge></div>
                <p className="mt-1 ds-caption">instalado: {cr.build_result.installed} · build: {cr.build_result.built}</p>
                {cr.build_result.skipped_reason ? <p className="mt-1 ds-caption text-[color:var(--muted-2)]">{cr.build_result.skipped_reason}</p> : null}
              </div>
            ) : null}
            {cr.preview_result ? (
              <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[color:var(--text)]">Preview (Playwright)</p><Badge tone={cr.preview_result.supported ? (cr.preview_result.crash_count > 0 ? 'danger' : 'success') : 'neutral'}>{cr.preview_result.supported ? `${cr.preview_result.routes.length} rotas` : 'nao suportado'}</Badge></div>
                <p className="mt-1 ds-caption">{cr.preview_result.reason || (cr.preview_result.supported ? 'backend e frontend iniciados para verificacao real.' : '')}</p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <ChangeRequestDiffPanel files={cr.diff} />

      <FailureDiagnosticPanel diagnostic={diagnostic} />

      <Card className="space-y-4">
        <p className="t-overline">Acoes</p>
        <div className="flex flex-wrap gap-3">
          {cr.status === 'Draft' ? (
            <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.analyze(cr.change_request_id), setCr)}><Wand2 className="h-4 w-4" /> Analisar</Button>
          ) : null}
          {cr.status === 'Analyzed' ? (
            <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.plan(cr.change_request_id), setCr)}><Wand2 className="h-4 w-4" /> Planejar</Button>
          ) : null}
          {cr.status === 'Planned' ? (
            <Button variant="primary" loading={busy} disabled={!phraseOk} onClick={() => void run(() => changeRequestsClient.approve(cr.change_request_id, confirmation.trim()), setCr)}><ThumbsUp className="h-4 w-4" /> Aprovar</Button>
          ) : null}
          {cr.status === 'Approved' ? (
            <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.apply(cr.change_request_id), setCr)}><Wand2 className="h-4 w-4" /> Aplicar (patch + build + preview)</Button>
          ) : null}
          {cr.status === 'Validating' ? (
            <>
              <Button variant="primary" loading={busy} onClick={() => void run(() => changeRequestsClient.accept(cr.change_request_id), setCr)}><ThumbsUp className="h-4 w-4" /> Aceitar</Button>
              <div className="flex min-w-64 flex-1 items-center gap-2">
                <Input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Motivo da rejeicao" aria-label="Motivo da rejeicao" />
                <Button variant="danger" className="shrink-0 whitespace-nowrap" loading={busy} disabled={!rejectReason.trim()} onClick={() => void run(() => changeRequestsClient.reject(cr.change_request_id, rejectReason.trim()), (result) => { setCr(result); setRejectReason(''); })}><ThumbsDown className="h-4 w-4" /> Rejeitar</Button>
              </div>
            </>
          ) : null}
          {cr.status === 'Accepted' ? (
            <div className="flex min-w-64 flex-1 items-center gap-2">
              <Input value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder="Motivo do rollback" aria-label="Motivo do rollback" />
              <Button variant="danger" className="shrink-0 whitespace-nowrap" loading={busy} disabled={!rollbackReason.trim()} onClick={() => void run(() => changeRequestsClient.rollback(cr.change_request_id, rollbackReason.trim()), (result) => { setCr(result); setRollbackReason(''); })}><RotateCcw className="h-4 w-4" /> Reverter</Button>
            </div>
          ) : null}
          {isTerminal ? <p className="ds-caption text-[color:var(--muted-2)]">Change Request em estado terminal.</p> : null}
        </div>
        {cr.result ? <p className="ds-caption">Resultado: <span className="font-semibold text-[color:var(--text)]">{cr.result.outcome}</span>{cr.result.reason ? ` — ${cr.result.reason}` : ''}</p> : null}
        <div className="border-t border-[color:var(--border)] pt-3">
          <DeleteResourceButton
            title="Excluir Change Request"
            description="Remove permanentemente este Change Request e seu historico. O codigo ja aplicado no projeto nao e revertido por esta acao."
            triggerLabel="Excluir"
            onConfirm={async () => { await changeRequestsClient.remove(cr.change_request_id); onChanged(); onDeleted(); }}
          />
        </div>
      </Card>

      <HistoryPanel history={cr.history} operationalLog={cr.operational_log} />
    </div>
  );
}

function ChangeRequestStepper({ status }: { readonly status: ChangeRequestStatus }) {
  if (status === 'Rejected' || status === 'Rolled Back') {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm">
        <XCircle className="h-4 w-4 text-[color:var(--danger)]" aria-hidden /><span className="text-[color:var(--text)]">{status}</span>
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
              {step}
            </span>
            {index < LIFECYCLE.length - 1 ? <ChevronRight className="h-3 w-3 text-[color:var(--muted-2)]" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ChangeRequestDiffPanel({ files }: { readonly files: readonly FileDiff[] }) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  if (!files.length) return null;
  const kindTone: Record<FileDiff['change_kind'], BadgeTone> = { added: 'success', modified: 'accent', deleted: 'danger' };
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><FileDiffIcon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden /><p className="t-overline">Diff ({files.length} arquivo{files.length === 1 ? '' : 's'})</p></div>
      <div className="space-y-2">
        {files.map((file) => {
          const open = openPath === file.path;
          return (
            <div key={file.path} className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]">
              <button type="button" onClick={() => setOpenPath(open ? null : file.path)} className="focus-ring flex w-full items-center justify-between gap-2 bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] px-3 py-2 text-left text-sm">
                <span className="truncate font-mono text-xs text-[color:var(--text)]">{file.path}</span>
                <Badge tone={kindTone[file.change_kind]}>{file.change_kind}</Badge>
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
  if (!diff.trim()) return <p className="p-3 ds-caption text-[color:var(--muted-2)]">Sem diff textual disponivel.</p>;
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
  if (!diagnostic) return null;
  return (
    <Card className="space-y-2 border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-sm">
      <p className="flex items-center gap-2 font-semibold text-[color:var(--text)]"><AlertTriangle className="h-4 w-4 text-[color:var(--danger)]" aria-hidden /> Diagnostico</p>
      <p>Status atual: <span className="font-mono">{diagnostic.status_current}</span></p>
      {diagnostic.status_expected.length ? <p>Status esperado: <span className="font-mono">{diagnostic.status_expected.join(', ')}</span></p> : null}
      <p>{diagnostic.backend_message}</p>
      <p className="text-[color:var(--muted)]">Correcao sugerida: {diagnostic.correction}</p>
    </Card>
  );
}

function HistoryPanel({ history, operationalLog }: { readonly history: ChangeRequest['history']; readonly operationalLog: ChangeRequest['operational_log'] }) {
  if (!history.length && !operationalLog.length) return null;
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-[color:var(--accent)]" aria-hidden /><p className="t-overline">Historico</p></div>
      {history.length ? (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="border-b border-[color:var(--border)] pb-2 text-sm last:border-0">
              <span className="text-[color:var(--muted-2)]">{new Date(entry.created_at).toLocaleString()}</span>{' '}
              <span className="text-[color:var(--text)]">{entry.event}</span>{' '}
              <span className="text-[color:var(--muted-2)]">({entry.source})</span>
            </li>
          ))}
        </ul>
      ) : null}
      {operationalLog.length ? (
        <div className="max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/20 p-3">
          <p className="t-overline mb-2">Log operacional</p>
          <ul className="space-y-1.5 font-mono text-xs text-[color:var(--text)]/90">
            {operationalLog.slice(-20).map((entry) => (
              <li key={entry.id} className={cn(entry.status === 'failed' ? 'text-[color:var(--danger)]' : entry.status === 'success' ? 'text-[color:var(--success)]' : 'text-[color:var(--muted)]')}>
                {new Date(entry.timestamp).toLocaleTimeString()} — {entry.method ?? ''} {entry.endpoint ?? ''} {entry.http_status ?? ''} — {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
