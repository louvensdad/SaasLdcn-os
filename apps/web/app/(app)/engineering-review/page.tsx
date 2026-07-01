'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Database,
  Gauge,
  Globe,
  HelpCircle,
  KeyRound,
  Lightbulb,
  ListChecks,
  Plug,
  Rocket,
  Scale,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  TestTube,
  ThumbsUp,
  Users,
  Webhook,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { JourneyTimeline } from '@/components/architecture-review/journey-timeline';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';
import { useProjectRoom } from '@/hooks/use-project-room';
import { ProjectRoomApiError, projectRoomsClient, type EngineeringReviewValidation } from '@/lib/api/project-rooms';
import { useLocale } from '@/hooks/use-locale';
import { useProjectCacheSync } from '@/hooks/use-project-cache-sync';
import { cn } from '@/lib/cn';
import {
  deriveDiagram,
  deriveEstimates,
  deriveExecutiveSummary,
  deriveReadiness,
  deriveRisks,
  type Maybe,
} from '@/lib/architecture-review/derive';
import type {
  CommitteeMember,
  EngineeringReviewAssessment,
  EngineeringReviewFinding,
  FinalOpinion,
  ProjectReadinessCheck,
  ProjectRoom,
  ProjectRoomFailureDiagnostic,
  ReviewDimension,
  ReviewScore,
} from '@contracts/project-room.contract';
import type { BlueprintDecision } from '@contracts/architecture-blueprint.contract';

const AREA_ICON: Record<string, LucideIcon> = {
  frontend: Globe, backend: Server, database: Database, auth: KeyRound,
  authorization: ShieldCheck, apis: Webhook, integrations: Plug,
  observability: Activity, tests: TestTube, deploy: Rocket,
};

type WorkflowStep = { id: string; label: string; status: 'pending' | 'running' | 'success' | 'failed' };
type ClientLog = { method: string | null; endpoint: string | null; status: number | null; message: string };

export default function EngineeringReviewPage() {
  return (
    <Suspense fallback={<CardLoading />}>
      <ReviewInner />
    </Suspense>
  );
}

function ReviewInner() {
  const { t } = useLocale();
  const projectId = useSearchParams().get('projectId');
  const { room, error, loading, reload, setRoom } = useProjectRoom(projectId);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <SectionHeader title={t('review.title')} description={t('review.subtitle')} />
      {room ? <WorkflowContextHeader room={room} stage="Engineering Review" /> : null}
      {!projectId ? (
        <Blocked />
      ) : loading ? (
        <CardLoading className="h-64" />
      ) : error && !room ? (
        <PageError title={t('review.error.title')} description={error} onRetry={() => void reload()} />
      ) : room && !room.architecture_blueprint ? (
        <Blocked roomId={projectId} status={room.status} />
      ) : room ? (
        <ReviewCenter room={room} setRoom={setRoom} />
      ) : null}
    </div>
  );
}

function Blocked({ roomId, status }: { readonly roomId?: string; readonly status?: string }) {
  const { t } = useLocale();
  // Smart button: never offer an impossible action. Before a PromptMaster is
  // approved there is nothing to architect yet → send the user back to the room.
  const promptApproved = ['PROMPT_APPROVED', 'BLUEPRINT_GENERATING'].includes(status ?? '');
  const target = !roomId
    ? '/architect'
    : promptApproved
      ? `/architect?projectId=${roomId}`
      : `/project-rooms/${roomId}`;
  const label = !roomId || promptApproved ? t('review.blocked.cta') : 'Voltar à Sala de Projeto';
  return (
    <Card className="glass noise space-y-4 p-8 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-[color:var(--warning)]" aria-hidden />
      <h2 className="t-h3 text-[color:var(--text)]">{t('review.blocked.title')}</h2>
      <p className="mx-auto max-w-md t-body text-[color:var(--muted)]">{t('review.blocked.desc')}</p>
      <div>
        <Link href={target}>
          <Button variant="primary">{label}</Button>
        </Link>
      </div>
    </Card>
  );
}

const META_STATUSES = ['WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'];
const PREVIEW_PHRASE = 'CONTINUAR COM PREVIEW';

function ReviewCenter({ room, setRoom }: { readonly room: ProjectRoom; readonly setRoom: (room: ProjectRoom) => void }) {
  const { t } = useLocale();
  const router = useRouter();
  const syncProjectCaches = useProjectCacheSync();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [logs, setLogs] = useState<ClientLog[]>([]);
  const [diagnostic, setDiagnostic] = useState<ProjectRoomFailureDiagnostic | null>(room.last_failure);
  const [previewPhrase, setPreviewPhrase] = useState('');
  const [validation, setValidation] = useState<EngineeringReviewValidation | null>(null);

  const blueprint = room.architecture_blueprint!;
  const summary = deriveExecutiveSummary(room);
  const readiness = deriveReadiness(room);
  const risks = deriveRisks(room);
  const estimates = deriveEstimates(room);
  const diagram = deriveDiagram(blueprint);
  const review = room.engineering_review ?? null;
  const blueprintVersion = room.blueprint_versions?.find((item) => item.version === room.active_blueprint_version) ?? room.blueprint_versions?.at(-1);
  const checklist = room.readiness_checklist ?? [];
  const status = room.status;
  const isMeta = META_STATUSES.includes(status);
  const degraded = blueprint.degraded;
  const acknowledged = Boolean(blueprint.preview_acknowledged);
  const needsPhrase = degraded && !acknowledged && !isMeta;
  const phraseOk = previewPhrase.trim() === PREVIEW_PHRASE;
  // Blockers that actually prevent approval (the engineering_review check itself is
  // the action we are about to perform, so it is not a pre-condition).
  const blockers = checklist.filter((c) => c.required && c.status !== 'passed' && c.id !== 'engineering_review');
  const verdictReady = blockers.length === 0 && (!needsPhrase || phraseOk);

  async function validateReview() {
    setBusy(true);
    setDiagnostic(null);
    try {
      const result = await projectRoomsClient.validateEngineeringReview(room.room_id);
      setValidation(result);
      setSteps(result.checks.map((check) => ({ id: check.id, label: check.label, status: check.passed ? 'success' : 'failed' })));
      setRoom(result.room);
      syncProjectCaches();
      router.refresh();
    } catch (caught) {
      setLogs((current) => [...current, { method: 'POST', endpoint: `/api/project-rooms/${room.room_id}/engineering-review/validate`, status: caught instanceof ProjectRoomApiError ? caught.httpStatus : null, message: caught instanceof Error ? caught.message : 'Falha ao validar a Review' }]);
    } finally {
      setBusy(false);
    }
  }

  async function continueDeterministicPreview() {
    if (!phraseOk) return;
    setBusy(true);
    try {
      const updated = await projectRoomsClient.acknowledgePreview(room.room_id, previewPhrase.trim());
      setRoom(updated);
      setValidation(null);
      syncProjectCaches();
      router.refresh();
    } catch (caught) {
      if (caught instanceof ProjectRoomApiError) setDiagnostic(caught.diagnostic);
      setLogs((current) => [...current, { method: 'POST', endpoint: `/api/project-rooms/${room.room_id}/acknowledge-preview`, status: caught instanceof ProjectRoomApiError ? caught.httpStatus : null, message: caught instanceof Error ? caught.message : 'Falha ao continuar com preview' }]);
    } finally {
      setBusy(false);
    }
  }

  async function approveReview() {
    setBusy(true);
    setDiagnostic(null);
    try {
      let updated = room;
      if (updated.status === 'BLUEPRINT_READY') updated = await projectRoomsClient.startEngineeringReview(room.room_id);
      updated = await projectRoomsClient.approve(room.room_id);
      setRoom(updated);
      setValidation(null);
      syncProjectCaches();
      router.refresh();
    } catch (caught) {
      if (caught instanceof ProjectRoomApiError) setDiagnostic(caught.diagnostic);
      setLogs((current) => [...current, { method: 'POST', endpoint: `/api/project-rooms/${room.room_id}/approve`, status: caught instanceof ProjectRoomApiError ? caught.httpStatus : null, message: caught instanceof Error ? caught.message : 'Falha ao aprovar a Review' }]);
    } finally {
      setBusy(false);
    }
  }

  async function sendToMetaFactory() {
    setBusy(true);
    setDiagnostic(null);
    try {
      const updated = await projectRoomsClient.sendToGenerator(room.room_id);
      setRoom(updated);
      syncProjectCaches();
      router.refresh();
    } catch (caught) {
      if (caught instanceof ProjectRoomApiError) setDiagnostic(caught.diagnostic);
      setLogs((current) => [...current, { method: 'POST', endpoint: `/api/project-rooms/${room.room_id}/send-to-generator`, status: caught instanceof ProjectRoomApiError ? caught.httpStatus : null, message: caught instanceof Error ? caught.message : 'Falha ao enviar para Meta-Fábrica' }]);
    } finally {
      setBusy(false);
    }
  }

  const show = (value: Maybe<string>) => value ?? <span className="text-[color:var(--muted-2)]">{t('review.unavailable')}</span>;

  const resumoTab = (
    <div className="space-y-6">
      <Card className="glass p-5"><JourneyTimeline status={room.status} /></Card>

      <Card className="glass p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="t-overline">Blueprint utilizado</p><h2 className="mt-1 t-h3">v{blueprint.version || blueprintVersion?.version || 1} / {blueprint.providerLabel}</h2></div><Badge tone={blueprint.degraded ? 'warning' : 'success'}>{blueprint.degraded ? 'Modo Offline' : 'Modo LLM'}</Badge></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
          {[
            ['Provider', blueprint.providerLabel],
            ['Modelo', blueprint.model],
            ['Versão', `v${blueprintVersion?.version ?? 1}`],
            ['Tempo', `${Math.round(blueprint.generation_time_ms / 1000)}s`],
            ['Data', new Date(blueprint.generated_at).toLocaleString()],
            ['Hash', blueprintVersion?.hash.slice(0, 12) || 'legado'],
          ].map(([label, value]) => <div key={label} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><dt className="t-overline">{label}</dt><dd className="mt-1 truncate font-semibold text-[color:var(--text)]" title={value}>{value}</dd></div>)}
        </dl>
      </Card>

      {/* Executive summary */}
      <section className="space-y-3">
        <h2 className="t-h2 text-[color:var(--text)]">{t('review.summary.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard label={t('review.summary.project')} value={summary.project} wide={summary.project.length > 22} />
          <SummaryCard label={t('review.summary.architecture')} value={show(summary.architecture)} />
          <SummaryCard label={t('review.summary.backend')} value={show(summary.backend)} />
          <SummaryCard label={t('review.summary.frontend')} value={show(summary.frontend)} />
          <SummaryCard label={t('review.summary.database')} value={show(summary.database)} />
          <SummaryCard label={t('review.summary.cloud')} value={show(summary.cloud)} />
          <SummaryCard
            label={t('review.summary.complexity')}
            value={summary.complexity ? t(`review.complexity.${summary.complexity.band}`) : show(null)}
            detail={summary.complexity ? t('review.complexity.basis', summary.complexity.basis) : undefined}
          />
          <SummaryCard label={t('review.summary.readiness')} value={summary.readinessPct === null ? show(null) : `${summary.readinessPct}%`} />
          <SummaryCard
            label={t('review.summary.origin')}
            value={summary.origin ? (summary.origin === 'ai' ? t('review.origin.ai') : t('review.origin.deterministic')) : show(null)}
            tone={summary.origin === 'deterministic' ? 'warning' : summary.origin === 'ai' ? 'success' : undefined}
          />
        </div>
        {summary.summary ? <p className="t-body text-[color:var(--muted)]">{summary.summary}</p> : null}
      </section>

      {/* Engineering readiness â€” coverage based, honest */}
      <Card className="glass noise space-y-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="t-h3 text-[color:var(--text)]">{t('review.readiness.title')}</h2>
          {readiness.confidencePct !== null ? <Badge tone="accent">{t('review.readiness.confidence')}: {readiness.confidencePct}%</Badge> : null}
        </div>
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="t-caption">{t('review.readiness.coverageLabel')}</span>
            <span className="t-mono text-[color:var(--text)]">{t('review.readiness.coverage', { decided: readiness.decidedAreas, total: readiness.totalAreas })}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--border-strong)]">
            <div className="h-full rounded-full bg-[image:var(--accent-gradient)]" style={{ width: `${(readiness.decidedAreas / readiness.totalAreas) * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readiness.securityCovered ? <Badge tone={readiness.securityCovered.covered === readiness.securityCovered.total ? 'success' : 'warning'}>{t('review.readiness.security', readiness.securityCovered)}</Badge> : null}
          {readiness.missing.length ? (
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--muted-2)]">
              {t('review.readiness.missing')}: {readiness.missing.map((area) => <Badge key={area} tone="neutral">{t(`architect.area.${area}`)}</Badge>)}
            </span>
          ) : null}
        </div>
        <p className="t-caption">{t('review.readiness.hint')}</p>
      </Card>

      {/* Architecture diagram (clickable â†’ scrolls to the decision) */}
      <Card className="glass noise space-y-4 p-6">
        <h2 className="t-h3 text-[color:var(--text)]">{t('review.diagram.title')}</h2>
        {diagram.length === 0 ? (
          <p className="t-caption">{t('review.diagram.empty')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {diagram.map((node, index) => {
                const Icon = AREA_ICON[node.area] ?? Blocks;
                return (
                  <span key={node.area} className="flex items-center gap-2">
                    <a href={`#decision-${node.area}`} className="glass lift focus-ring flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2">
                      <Icon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
                      <span className="t-mono text-xs font-semibold text-[color:var(--text)]">{node.choice}</span>
                    </a>
                    {index < diagram.length - 1 ? <ArrowRight className="h-4 w-4 text-[color:var(--muted-2)]" aria-hidden /> : null}
                  </span>
                );
              })}
            </div>
            <p className="t-caption">{t('review.diagram.hint')}</p>
          </>
        )}
      </Card>

      {/* Decisions & trade-offs */}
      <section className="space-y-3">
        <h2 className="t-h2 text-[color:var(--text)]">{t('review.decisions.title')}</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {blueprint.decisions.map((decision, index) => (
            <DecisionCard key={`${decision.area}-${index}`} decision={decision} />
          ))}
        </div>
      </section>

      {/* Risk center */}
      <Card className="glass noise space-y-4 p-6">
        <h2 className="t-h3 text-[color:var(--text)]">{t('review.risks.title')}</h2>
        {risks.length === 0 ? (
          <p className="flex items-center gap-2 t-body text-[color:var(--muted)]"><CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" aria-hidden />{t('review.risks.none')}</p>
        ) : (
          <ul className="space-y-2.5">
            {risks.map((risk) => (
              <li key={risk.id} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{risk.title}</p>
                  <Badge tone={risk.source === 'open_question' ? 'warning' : 'neutral'}>
                    {risk.source === 'open_question' ? <HelpCircle className="mr-1 h-3 w-3" aria-hidden /> : <Lightbulb className="mr-1 h-3 w-3" aria-hidden />}
                    {t(risk.source === 'open_question' ? 'review.risks.openQuestion' : 'review.risks.assumption')}
                  </Badge>
                </div>
                {risk.detail ? <p className="mt-1.5 t-caption"><span className="font-semibold text-[color:var(--text)]">{t('review.risks.impact')}:</span> {risk.detail}</p> : null}
                {risk.mitigation ? <p className="mt-1 t-caption"><span className="font-semibold text-[color:var(--text)]">{t('review.risks.mitigation')}:</span> {risk.mitigation}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Estimates â€” only real counts */}
      {estimates.length ? (
        <Card className="glass space-y-4 p-6">
          <h2 className="t-h3 text-[color:var(--text)]">{t('review.estimates.title')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {estimates.map((item) => (
              <div key={item.key} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3 text-center">
                <p className="t-mono text-2xl font-bold text-[color:var(--text)]">{item.value}</p>
                <p className="mt-1 t-caption">{t(`review.estimates.${item.key}`)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

    </div>
  );

  const comiteTab = (
    <div className="space-y-6">
      {review?.committee?.length ? <CommitteeVotes members={review.committee} /> : null}
      {review ? <CommitteePanel review={review} /> : <p className="t-caption text-[color:var(--muted-2)]">Comitê indisponível sem Blueprint.</p>}
    </div>
  );

  const dimensoesTab = review?.dimensions?.length ? (
    <DimensionsPanel dimensions={review.dimensions} />
  ) : (
    <p className="t-caption text-[color:var(--muted-2)]">Dimensões indisponíveis.</p>
  );

  const parecerTab = review?.final_opinion ? (
    <FinalOpinionPanel opinion={review.final_opinion} />
  ) : (
    <p className="t-caption text-[color:var(--muted-2)]">Parecer indisponível.</p>
  );

  const readinessTab = (
    <div className="space-y-6">
      {review?.score ? <ReviewScorePanel score={review.score} /> : null}

      {/* Deterministic preview — treated as a degraded mode, with conscious confirmation */}
      {degraded && !isMeta ? (
        <DeterministicGate
          roomId={room.room_id}
          acknowledged={acknowledged}
          phrase={previewPhrase}
          onPhrase={setPreviewPhrase}
          phraseOk={phraseOk}
        />
      ) : null}

      {/* Critical action panel — checklist, honest verdict, smart buttons, live workflow, logs */}
      <Card surface="primary" className="glass noise space-y-4 p-6">
        <h2 className="t-h3 text-[color:var(--text)]">{t('review.panel.title')}</h2>
        {!isMeta && status !== 'ENGINEERING_APPROVED' ? <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2 text-sm text-[color:var(--text)]"><AlertTriangle className="h-4 w-4 text-[color:var(--warning)]" />A Review ainda não foi aprovada.</p> : null}

        <div>
          <p className="t-overline mb-2">Readiness Center</p>
          <EnterpriseChecklist checks={checklist} />
        </div>

        <Verdict ready={verdictReady} blockers={blockers} needsPhrase={needsPhrase} phraseOk={phraseOk} />

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" loading={busy} onClick={() => void validateReview()}><ListChecks className="h-4 w-4" />Validar Review</Button>
          <Link href={`/architect?projectId=${room.room_id}`}><Button variant="secondary">Voltar ao Architect</Button></Link>
          <Link href={`/architect?projectId=${room.room_id}&regenerate=1`}><Button variant="ghost"><Sparkles className="h-4 w-4" />Regenerar Blueprint com IA</Button></Link>
          {needsPhrase ? <Button variant="secondary" loading={busy} disabled={!phraseOk} onClick={() => void continueDeterministicPreview()}>Continuar com Preview Determinístico</Button> : null}
          {isMeta ? (
            <Link href={`/meta-factory?projectId=${room.room_id}`} className="ml-auto">
              <Button variant="primary">Abrir Meta-Fábrica <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          ) : status === 'ENGINEERING_APPROVED' ? <Button variant="primary" className="ml-auto" loading={busy} onClick={() => void sendToMetaFactory()}>Enviar para Meta-Fábrica <ArrowRight className="h-4 w-4" /></Button>
            : <Button variant="primary" className="ml-auto" loading={busy} disabled={needsPhrase || (validation !== null && !validation.valid)} onClick={() => void approveReview()}>Aprovar Review <ThumbsUp className="h-4 w-4" /></Button>}
        </div>

        <ReviewValidationPanel validation={validation} room={room} />
        <WorkflowProgress steps={steps} />
        <FailureDiagnostic diagnostic={diagnostic} />
        <ClientLogPanel logs={logs} />
        <OperationalLog entries={room.operational_log ?? []} />
      </Card>
    </div>
  );

  return (
    <Tabs
      items={[
        { id: 'resumo', label: 'Resumo', icon: Blocks, content: resumoTab },
        { id: 'comite', label: 'Comitê', icon: Users, content: comiteTab },
        { id: 'dimensoes', label: 'Dimensões', icon: Scale, content: dimensoesTab },
        { id: 'readiness', label: 'Readiness', icon: ListChecks, content: readinessTab },
        { id: 'parecer', label: 'Parecer', icon: ScrollText, content: parecerTab },
      ]}
    />
  );
}

function CommitteeVotes({ members }: { readonly members: readonly CommitteeMember[] }) {
  const verdictMeta: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
    approved: { label: 'Aprovado', tone: 'success' },
    approved_with_caveats: { label: 'Aprovado com ressalvas', tone: 'warning' },
    changes_requested: { label: 'Solicita melhorias', tone: 'danger' },
  };
  return (
    <Card className="glass noise space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
        <h2 className="t-h3 text-[color:var(--text)]">Comitê de Engenharia — votação</h2>
      </div>
      <p className="t-caption">Cada especialista avalia a arquitetura a partir de sinais reais. Nada é inventado.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const meta = verdictMeta[m.verdict] ?? { label: m.verdict, tone: 'warning' as const };
          return (
            <div key={m.role} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[color:var(--text)]">{m.role}</p>
                <Stars rating={m.rating} />
              </div>
              <Badge tone={meta.tone} className="mt-2">{meta.label}</Badge>
              <p className="mt-2 t-caption text-[color:var(--muted)]">{m.rationale}</p>
              {m.signals.length ? <p className="mt-1 t-caption text-[color:var(--muted-2)]">Sinais: {m.signals.join('; ')}</p> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stars({ rating }: { readonly rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= rating ? 'fill-[color:var(--accent)] text-[color:var(--accent)]' : 'text-[color:var(--muted-2)]')} aria-hidden />
      ))}
    </span>
  );
}

function DimensionsPanel({ dimensions }: { readonly dimensions: readonly ReviewDimension[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {dimensions.map((d) => (
        <Card key={d.key} className="glass space-y-2 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--text)]">{d.label}</h3>
            {d.status === 'unavailable' || d.score === null || d.score === undefined ? (
              <Badge tone="neutral">sem score</Badge>
            ) : (
              <Badge tone={d.score >= 80 ? 'success' : d.score >= 50 ? 'accent' : 'warning'}>{d.score}%</Badge>
            )}
          </div>
          {d.verdict ? <p className="t-caption text-[color:var(--muted-2)]">{d.verdict}</p> : null}
          <ul className="ml-4 list-disc space-y-0.5 t-caption text-[color:var(--muted)]">
            {d.findings.map((f, index) => <li key={index}>{f}</li>)}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function FinalOpinionPanel({ opinion }: { readonly opinion: FinalOpinion }) {
  const bands: [string, string][] = [
    ['Complexidade', opinion.complexity],
    ['Risco', opinion.risk],
    ['Escalabilidade', opinion.scalability],
  ];
  return (
    <Card className="glass noise space-y-4 p-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
        <h2 className="t-h3 text-[color:var(--text)]">Parecer final do comitê</h2>
      </div>
      {opinion.deterministic ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-3 t-caption">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[color:var(--warning)]" aria-hidden />{opinion.disclaimer}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4 text-center">
          <p className="t-overline">Prob. de sucesso (1ª geração)</p>
          <p className="mt-1 t-mono text-2xl font-bold text-[color:var(--text)]">{opinion.success_probability === null || opinion.success_probability === undefined ? 'indisponível' : `${opinion.success_probability}%`}</p>
        </div>
        {bands.map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4 text-center">
            <p className="t-overline">{label}</p>
            <p className="mt-1 text-base font-semibold text-[color:var(--text)]">{value || 'indisponível'}</p>
          </div>
        ))}
      </div>
      {opinion.narrative ? <p className="t-body text-[color:var(--muted)]">{opinion.narrative}</p> : null}
    </Card>
  );
}

function Verdict({ ready, blockers, needsPhrase, phraseOk }: {
  readonly ready: boolean;
  readonly blockers: readonly ProjectReadinessCheck[];
  readonly needsPhrase: boolean;
  readonly phraseOk: boolean;
}) {
  if (ready) {
    return (
      <p className="flex items-center gap-2 t-body text-[color:var(--success)]">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Pronto para aprovar a Engineering Review e enviar à Meta-Fábrica.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 t-body text-[color:var(--warning)]">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Ainda não está pronto para enviar. Resolva os itens abaixo:
      </p>
      <ul className="ml-6 list-disc space-y-1 t-caption">
        {blockers.map((b) => (
          <li key={b.id}><span className="font-semibold text-[color:var(--text)]">{b.label}:</span> {b.detail}</li>
        ))}
        {needsPhrase && !phraseOk ? (
          <li>Blueprint determinístico: confirme digitando <span className="t-mono font-semibold">{PREVIEW_PHRASE}</span> no painel acima, ou regenere com IA.</li>
        ) : null}
      </ul>
    </div>
  );
}

function DeterministicGate({ roomId, acknowledged, phrase, onPhrase, phraseOk }: {
  readonly roomId: string;
  readonly acknowledged: boolean;
  readonly phrase: string;
  readonly onPhrase: (value: string) => void;
  readonly phraseOk: boolean;
}) {
  return (
    <Card className="glass noise space-y-4 border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] p-6">
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-5 w-5 text-[color:var(--warning)]" aria-hidden />
        <h2 className="t-h3 text-[color:var(--text)]">Preview determinístico (modo degradado)</h2>
      </div>
      <p className="t-body text-[color:var(--muted)]">
        Este Blueprint foi criado <span className="font-semibold text-[color:var(--text)]">sem LLM</span>. Ele serve como prévia
        técnica, mas não representa o melhor resultado possível para projetos complexos ou Enterprise. Recomendamos regenerar com IA.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><p className="t-overline">Provider ativo</p><p className="text-sm font-semibold text-[color:var(--text)]">Nenhum (determinístico)</p></div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><p className="t-overline">Modo / LLM</p><p className="text-sm font-semibold text-[color:var(--warning)]">PREVIEW_DETERMINISTIC — sem LLM</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['GPT', 'Claude', 'Gemini', 'DeepSeek'] as const).map((name) => (
          <Link key={name} href="/settings"><Button variant="ghost"><Sparkles className="h-4 w-4" /> Conectar {name}</Button></Link>
        ))}
        <Link href={`/architect?projectId=${roomId}`}><Button variant="secondary"><Wrench className="h-4 w-4" /> Regenerar com IA</Button></Link>
      </div>
      {acknowledged ? (
        <p className="flex items-center gap-2 t-caption text-[color:var(--success)]"><CheckCircle2 className="h-4 w-4" aria-hidden /> Preview aceito conscientemente. A revisão pode ser aprovada.</p>
      ) : (
        <div className="space-y-2">
          <p className="t-caption">Para continuar mesmo assim, digite exatamente <span className="t-mono font-semibold text-[color:var(--text)]">{PREVIEW_PHRASE}</span> (registrado em auditoria):</p>
          <Input value={phrase} onChange={(e) => onPhrase(e.target.value)} placeholder={PREVIEW_PHRASE} error={phrase.length > 0 && !phraseOk} aria-label="Confirmação de preview determinístico" />
        </div>
      )}
    </Card>
  );
}

function CommitteePanel({ review }: { readonly review: EngineeringReviewAssessment }) {
  const unavailable = (value: string) => (value && value !== 'indisponivel' ? value : <span className="text-[color:var(--muted-2)]">indisponível</span>);
  return (
    <Card className="glass noise space-y-5 p-6">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
        <h2 className="t-h3 text-[color:var(--text)]">Comitê de Engenharia</h2>
      </div>
      <p className="t-caption">Leitura crítica do Blueprint — distinta das decisões do Architect.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <CommitteeColumn title="Decisões sólidas" icon={ThumbsUp} tone="success" findings={review.good_decisions} />
        <CommitteeColumn title="Decisões discutíveis" icon={HelpCircle} tone="warning" findings={review.debatable_decisions} />
        <CommitteeColumn title="Riscos" icon={AlertTriangle} tone="warning" findings={review.risks} />
        <CommitteeColumn title="Lacunas" icon={AlertOctagon} tone="warning" findings={review.gaps} />
        <CommitteeColumn title="Inconsistências" icon={AlertOctagon} tone="danger" findings={review.inconsistencies} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><p className="t-overline">Impacto de segurança</p><p className="mt-1 text-sm text-[color:var(--text)]">{unavailable(review.security_impact)}</p></div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><p className="t-overline">Impacto de escalabilidade</p><p className="mt-1 text-sm text-[color:var(--text)]">{unavailable(review.scalability_impact)}</p></div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 sm:col-span-2"><p className="t-overline">Readiness para Meta-Fábrica</p><p className="mt-1 text-sm text-[color:var(--text)]">{review.generation_readiness}</p></div>
      </div>
      {review.recommendations.length ? (
        <div>
          <p className="t-overline mb-2">Recomendações antes da geração</p>
          <ul className="space-y-1.5">
            {review.recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2 t-caption"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" aria-hidden />{rec}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function CommitteeColumn({ title, icon: Icon, tone, findings }: {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly tone: 'success' | 'warning' | 'danger';
  readonly findings: readonly EngineeringReviewFinding[];
}) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--warning)';
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]"><Icon className="h-4 w-4" style={{ color }} aria-hidden /> {title} <span className="t-mono text-xs text-[color:var(--muted-2)]">({findings.length})</span></p>
      {findings.length ? (
        <ul className="mt-2 space-y-2">
          {findings.map((f, index) => (
            <li key={index} className="t-caption">
              <span className="font-semibold text-[color:var(--text)]">{f.title}</span>
              {f.detail ? <span className="block text-[color:var(--muted)]">{f.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 t-caption text-[color:var(--muted-2)]">Nada apontado.</p>
      )}
    </div>
  );
}

function ReviewScorePanel({ score }: { readonly score: ReviewScore }) {
  return (
    <Card className="glass noise space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
          <h2 className="t-h3 text-[color:var(--text)]">Review Score</h2>
        </div>
        {score.overall === null || score.overall === undefined ? (
          <Badge tone="neutral">Geral: indisponível</Badge>
        ) : (
          <Badge tone={score.overall >= 80 ? 'success' : score.overall >= 50 ? 'accent' : 'warning'}>Geral: {score.overall}%</Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {score.categories.map((cat) => (
          <div key={cat.key} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-4">
            <p className="t-overline">{cat.label}</p>
            {cat.status === 'unavailable' || cat.score === null || cat.score === undefined ? (
              <p className="mt-1 text-sm font-semibold text-[color:var(--muted-2)]">indisponível</p>
            ) : (
              <>
                <p className="mt-1 t-mono text-2xl font-bold text-[color:var(--text)]">{cat.score}%</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--border-strong)]"><div className="h-full rounded-full bg-[image:var(--accent-gradient)]" style={{ width: `${cat.score}%` }} /></div>
              </>
            )}
            <p className="mt-1.5 t-caption">{cat.basis}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClientLogPanel({ logs }: { readonly logs: readonly ClientLog[] }) {
  if (!logs.length) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/20 p-3">
      <p className="t-overline mb-2 flex items-center gap-2"><ScrollText className="h-3.5 w-3.5" aria-hidden /> Log da ação (sessão)</p>
      <ul className="space-y-1 font-mono text-xs text-[color:var(--text)]/90">
        {logs.map((entry, index) => (
          <li key={index} className={cn(entry.status && entry.status >= 400 ? 'text-[color:var(--danger)]' : entry.status === 200 ? 'text-[color:var(--success)]' : 'text-[color:var(--muted)]')}>
            <span>{new Date().toLocaleTimeString()}</span> — {entry.method ?? ''} {entry.endpoint ?? ''} {entry.status ?? ''} — {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}


function EnterpriseChecklist({ checks }: { readonly checks: readonly ProjectReadinessCheck[] }) {
  if (!checks.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {checks.map((check) => (
        <div key={check.id} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3">
          {check.status === 'passed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--success)]" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning)]" />}
          <div>
            <p className="text-sm font-semibold text-[color:var(--text)]">{check.label}</p>
            <p className="t-caption">{check.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowProgress({ steps }: { readonly steps: readonly WorkflowStep[] }) {
  if (!steps.length) return null;
  const done = steps.filter((step) => step.status === 'success').length;
  const running = steps.some((step) => step.status === 'running') ? 0.5 : 0;
  const pct = Math.round(((done + running) / steps.length) * 100);
  const active = steps.find((step) => step.status === 'running')?.label ?? steps.at(-1)?.label ?? 'Workflow';
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-[color:var(--text)]">{active}</span>
        <span className="t-mono text-[color:var(--muted)]">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--border)]"><div className="h-full rounded-full bg-[image:var(--accent-gradient)] transition-all" style={{ width: `${pct}%` }} /></div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2 t-caption">
            {step.status === 'running' ? <Activity className="h-3.5 w-3.5 text-[color:var(--accent)]" /> : step.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--success)]" /> : step.status === 'failed' ? <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--danger)]" /> : <span className="h-3.5 w-3.5 rounded-full border border-[color:var(--border)]" />}
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function OperationalLog({ entries }: { readonly entries: readonly { id: string; timestamp: string; method?: string | null; endpoint?: string | null; http_status?: number | null; status: string; message: string; detail?: string | null }[] }) {
  if (!entries.length) return null;
  return (
    <div className="max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/20 p-3">
      <p className="t-overline mb-2">Log operacional</p>
      <ul className="space-y-2 font-mono text-xs text-[color:var(--text)]/90">
        {entries.slice(-12).map((entry) => (
          <li key={entry.id} className="border-b border-[color:var(--border)] pb-2 last:border-b-0">
            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>{' '}
            {entry.method ? <span>{entry.method} </span> : null}
            {entry.endpoint ? <span>{entry.endpoint} </span> : null}
            {entry.http_status ? <span>{entry.http_status}</span> : null}
            <span className="block text-[color:var(--muted)]">{entry.message}{entry.detail ? ` - ${entry.detail}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FailureDiagnostic({ diagnostic }: { readonly diagnostic: ProjectRoomFailureDiagnostic | null }) {
  if (!diagnostic) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-4 text-sm">
      <p className="font-semibold text-[color:var(--text)]">Diagnostico automatico</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <p>Status atual: <span className="font-mono">{diagnostic.status_current}</span></p>
        <p>Status esperado: <span className="font-mono">{diagnostic.status_expected.join(', ') || '-'}</span></p>
        <p>Endpoint: <span className="font-mono">{diagnostic.endpoint_called}</span></p>
        <p>HTTP Status: <span className="font-mono">{diagnostic.http_status}</span></p>
      </div>
      <p className="mt-2">Backend: {diagnostic.backend_message}</p>
      <p>Motivo: {diagnostic.rejection_reason}</p>
      <p>Como corrigir: {diagnostic.correction}</p>
    </div>
  );
}

function ReviewValidationPanel({ validation, room }: { readonly validation: EngineeringReviewValidation | null; readonly room: ProjectRoom }) {
  if (!validation) {
    return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4 text-sm"><p className="font-semibold text-[color:var(--text)]">A Review ainda não foi validada.</p><p className="mt-1 text-[color:var(--muted)]">Execute “Validar Review” para conferir PromptMaster, Blueprint ativo, provider, decisões e bloqueios.</p></div>;
  }
  return (
    <div className={cn('rounded-[var(--radius-md)] border p-4', validation.valid ? 'border-[color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]')}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-[color:var(--text)]">{validation.valid ? 'Review validada. Pronta para aprovação.' : 'A Review ainda não pode avançar.'}</p><p className="mt-1 t-caption">Ação recomendada: {validation.recommended_action}</p></div><Badge tone={validation.valid ? 'success' : 'danger'}>{validation.valid ? 'Válida' : 'Bloqueada'}</Badge></div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-[color:var(--muted-2)]">Status atual</dt><dd className="font-mono text-[color:var(--text)]">{validation.status_current}</dd></div>
        <div><dt className="text-[color:var(--muted-2)]">Status esperado</dt><dd className="font-mono text-[color:var(--text)]">{validation.status_expected.join(', ')}</dd></div>
        <div><dt className="text-[color:var(--muted-2)]">Blueprint ativo</dt><dd className="font-mono text-[color:var(--text)]">v{validation.active_blueprint_version}</dd></div>
        <div><dt className="text-[color:var(--muted-2)]">Provider</dt><dd className="font-mono text-[color:var(--text)]">{validation.providerLabel} · {validation.model}</dd></div>
        <div><dt className="text-[color:var(--muted-2)]">Modo</dt><dd className="font-mono text-[color:var(--text)]">{validation.mode}</dd></div>
        <div><dt className="text-[color:var(--muted-2)]">Degraded</dt><dd className="font-mono text-[color:var(--text)]">{String(validation.degraded)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[color:var(--muted-2)]">Projeto</dt><dd className="font-mono text-[color:var(--text)]">{room.room_id}</dd></div>
      </dl>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{validation.checks.map((check) => <li key={check.id} className="flex items-start gap-2 text-xs">{check.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[color:var(--success)]" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-[color:var(--danger)]" />}<span><strong>{check.label}:</strong> {check.detail}</span></li>)}</ul>
    </div>
  );
}
function SummaryCard({ label, value, detail, tone, wide }: {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly detail?: string;
  readonly tone?: 'success' | 'warning';
  readonly wide?: boolean;
}) {
  return (
    <Card className={cn('glass space-y-1 p-4', wide && 'sm:col-span-2')}>
      <p className="t-overline">{label}</p>
      <p className={cn('text-sm font-semibold', tone === 'success' ? 'text-[color:var(--success)]' : tone === 'warning' ? 'text-[color:var(--warning)]' : 'text-[color:var(--text)]')}>{value}</p>
      {detail ? <p className="t-caption">{detail}</p> : null}
    </Card>
  );
}

function DecisionCard({ decision }: { readonly decision: BlueprintDecision }) {
  const { t } = useLocale();
  const Icon = AREA_ICON[decision.area] ?? Blocks;
  const areaLabel = t(`architect.area.${decision.area}`);
  const label = areaLabel.startsWith('architect.area.') ? decision.area : areaLabel;

  return (
    <Card id={`decision-${decision.area}`} className="glass scroll-mt-24 space-y-3 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)]" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="t-overline">{label}</p>
          <h3 className="mt-0.5 text-base font-semibold text-[color:var(--text)]">{decision.choice}</h3>
        </div>
      </div>
      <div>
        <p className="t-caption font-semibold text-[color:var(--text)]">{t('review.tradeoffs.justification')}</p>
        <p className="mt-1 t-body text-[color:var(--muted)]">{decision.justification}</p>
      </div>
      <div>
        <p className="t-caption font-semibold text-[color:var(--text)]">{t('review.tradeoffs.alternatives')}</p>
        {decision.alternatives_considered.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">{decision.alternatives_considered.map((alt) => <Badge key={alt} tone="neutral">{alt}</Badge>)}</div>
        ) : (
          <p className="mt-1 t-caption">{t('review.tradeoffs.none')}</p>
        )}
      </div>
    </Card>
  );
}
