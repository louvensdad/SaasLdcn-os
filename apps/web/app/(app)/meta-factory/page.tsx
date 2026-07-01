'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';

import {
  metaFactoryClient,
  type AgentRunSummary,
  type ClarifyingQuestion,
  type CompletenessReport,
  type DeepEngineeringAnalysis,
  type DeepStage,
  type FactoryEvent,
  type GeneratedFile,
  type PriorAnswer,
  type ProjectSpec,
} from '@/lib/api/meta-factory';
import { MODELS } from '@/lib/llm/models';
import { LDCNCoreBadge } from '@/components/three/ldcn-core-badge';
import { ApiTestPanel } from '@/components/generation/api-test-panel';
import { CompletenessPanel } from '@/components/generation/completeness-panel';
import { ExportPanel } from '@/components/generation/export-panel';
import { ValidationReportPanel } from '@/components/generation/validation-report-panel';
import { ResilientPipeline } from '@/components/generation/resilient-pipeline';
import { AiUsageCard } from '@/components/generation/ai-usage-card';
import type { GenerationValidationReport } from '@contracts/generation-validation.contract';

const PIPELINE_ROLES = ['contracts', 'backend', 'frontend', 'qa', 'devops', 'docs'] as const;
import { useLocale } from '@/hooks/use-locale';
import { useProjectCacheSync } from '@/hooks/use-project-cache-sync';
import { LlmProviderInline } from '@/components/llm/llm-gated-action';
import { useActiveLlm } from '@/hooks/use-active-llm';
import { LOCALES as AVAILABLE_LOCALES } from '@/lib/i18n';
import { UserKeyPanel } from '@/components/llm/user-key-panel';
import { projectRoomsClient } from '@/lib/api/project-rooms';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';
import type { ProjectRoom } from '@contracts/project-room.contract';

export default function MetaFactoryPage() {
  return (
    <Suspense fallback={null}>
      <MetaFactoryInner />
    </Suspense>
  );
}

function MetaFactoryInner() {
  const { t } = useLocale();
  const syncProjectCaches = useProjectCacheSync();
  const searchParams = useSearchParams();
  // Unified journey: when arriving from a project room (or an import), the
  // PromptMaster/spec is loaded automatically â€” no copy/paste.
  const sourceProjectId = searchParams.get('projectId');

  const [intent, setIntent] = useState('');
  const [model, setModel] = useState('');
  const [locale, setLocale] = useState('pt-BR');
  const [projectName, setProjectName] = useState('meta-factory-project');
  // 'idle' = manual mode; 'loaded' = came from an approved project; 'blocked' =
  // the project has no approved PromptMaster (business rule).
  const [roomLoad, setRoomLoad] = useState<'idle' | 'loading' | 'loaded' | 'blocked' | 'needs_blueprint' | 'needs_review'>(
    sourceProjectId ? 'loading' : 'idle',
  );
  const [roomTitle, setRoomTitle] = useState('');
  const [sourceRoom, setSourceRoom] = useState<ProjectRoom | null>(null);
  // The approved Architect blueprint that drives this build (Architect â†’ Meta-Factory).
  const [blueprint, setBlueprint] = useState<unknown>(null);

  const [spec, setSpec] = useState<ProjectSpec | null>(null);
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [validationReport, setValidationReport] = useState<GenerationValidationReport | null>(null);
  const [completenessReport, setCompletenessReport] = useState<CompletenessReport | null>(null);
  const [failedRole, setFailedRole] = useState<string | null>(null);
  // Build "sala de teste" verification + auto-repair gate.
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [verifyPassed, setVerifyPassed] = useState(false);
  const [repairRound, setRepairRound] = useState(0);

  const [busy, setBusy] = useState<null | 'spec' | 'generate' | 'download' | 'file'>(null);
  const [error, setError] = useState<string | null>(null);

  // Real-time generation state (Pillar 3).
  const [streamEvents, setStreamEvents] = useState<FactoryEvent[]>([]);
  const [emittedPaths, setEmittedPaths] = useState<string[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [useUserKey, setUseUserKey] = useState(false);
  const activeLlm = useActiveLlm();

  // Auto-detect the globally configured provider: when Settings has a ready LLM,
  // the whole flow uses it automatically (and failures surface explicitly instead
  // of silently degrading to deterministic). The user configures the LLM once.
  useEffect(() => {
    if (activeLlm.isReady) setUseUserKey(true);
  }, [activeLlm.isReady]);

  // Deep Engineering pre-flight: the system "thinks through" the project before
  // generating, so the experience reflects real engineering instead of an instant result.
  const [deepStages, setDeepStages] = useState<DeepStage[]>([]);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepEngineeringAnalysis | null>(null);
  const [deepThinking, setDeepThinking] = useState<{ index: number; total: number; title: string } | null>(null);

  // Per-stage timing. Each agent is a single blocking LLM call that emits no
  // events until it finishes, so we stamp start/end client-side to drive the
  // progress bar and an elapsed timer that proves the stream is still alive.
  const [stageStart, setStageStart] = useState<Record<string, number>>({});
  const [stageEnd, setStageEnd] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  // Last time ANY server event arrived (heartbeats included). Lets us tell a slow
  // stage (server still pinging) apart from a dead connection (pings stopped).
  const [lastEventAt, setLastEventAt] = useState(() => Date.now());

  // Tick a clock while generating so the elapsed counter advances live.
  useEffect(() => {
    if (busy !== 'generate') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [busy]);

  // Auto-load the spec/PromptMaster from the source project (Fluxo 1 & 2).
  useEffect(() => {
    if (!sourceProjectId) return;
    let active = true;
    setRoomLoad('loading');
    projectRoomsClient
      .get(sourceProjectId)
      .then((room) => {
        if (!active) return;
        setSourceRoom(room);
        const promptApproved = ['PROMPT_APPROVED', 'BLUEPRINT_GENERATING', 'BLUEPRINT_READY', 'ENGINEERING_REVIEW', 'ENGINEERING_APPROVED', 'WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'].includes(room.status);
        if (!promptApproved || !room.spec || !room.prompt_master_md) {
          // No approved PromptMaster â†’ cannot proceed at all.
          setRoomLoad('blocked');
          return;
        }
        if (!room.architecture_blueprint) {
          // Approved PromptMaster but no Blueprint yet â†’ must pass through Architect.
          setRoomTitle(room.title);
          setRoomLoad('needs_blueprint');
          return;
        }
        const reviewApproved = ['WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'].includes(room.status);
        if (!reviewApproved) {
          // Blueprint exists but the Architecture Review hasn't been approved yet â†’
          // the Meta-Factory cannot start until engineering sign-off.
          setRoomTitle(room.title);
          setRoomLoad('needs_review');
          return;
        }
        // Approved PromptMaster + approved Blueprint + approved Review â†’ build.
        setSpec(room.spec as unknown as ProjectSpec);
        setBlueprint(room.architecture_blueprint);
        setQuestions([]);
        setProjectName(room.title || 'meta-factory-project');
        setLocale(room.locale || 'pt-BR');
        setRoomTitle(room.title);
        setRoomLoad('loaded');
      })
      .catch(() => active && setRoomLoad('blocked'));
    return () => {
      active = false;
    };
  }, [sourceProjectId]);

  // Seconds an agent spent (or has been) running. Falls back to the live clock
  // while the stage is still in flight.
  function stageElapsedSec(role: string): number {
    const start = stageStart[role];
    if (start === undefined) return 0;
    const end = stageEnd[role] ?? now;
    return Math.max(0, Math.floor((end - start) / 1000));
  }

  const SLOW_STAGE_SECONDS = 75;

  async function handleOrchestrate(priorAnswers: PriorAnswer[] = []) {
    setBusy('spec');
    setError(null);
    try {
      const result = await metaFactoryClient.orchestrate(intent, priorAnswers, model || undefined, useUserKey);
      setSpec(result.spec);
      setQuestions(result.open_questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.spec'));
    } finally {
      setBusy(null);
    }
  }

  function handleRefine() {
    const priorAnswers: PriorAnswer[] = questions.map((q) => ({
      id: q.id,
      answer: answers[q.id]?.trim() || q.default_if_skipped,
    }));
    void handleOrchestrate(priorAnswers);
  }

  async function runStageSequence(
    localizedSpec: ProjectSpec,
    startIndex: number,
    initialProjectId: string | null,
    initialRuns: AgentRunSummary[],
  ) {
    setBusy('generate');
    setError(null);
    setFailedRole(null);
    setNow(Date.now());
    setLastEventAt(Date.now());

    // Deep Engineering pre-flight runs once, before a fresh full generation: the
    // platform reasons through requirements, architecture, security, risk and the
    // build plan with a deliberate pace, then proceeds to generate.
    if (startIndex === 0) {
      setDeepStages([]);
      setDeepAnalysis(null);
      try {
        await metaFactoryClient.deepAnalyzeStream(localizedSpec, blueprint, (event) => {
          setLastEventAt(Date.now());
          if (event.type === 'deep_stage_started') {
            setDeepThinking({ index: event.index, total: event.total, title: event.title });
          } else if (event.type === 'deep_stage_completed') {
            setDeepStages((prev) => [...prev, event.stage]);
          } else if (event.type === 'deep_analysis') {
            setDeepAnalysis(event.analysis);
          }
        });
      } catch {
        // A failed pre-flight must never block generation â€” proceed regardless.
      } finally {
        setDeepThinking(null);
      }
    }

    const liveRuns = new Map<string, AgentRunSummary>(initialRuns.map((run) => [run.role, run]));
    let currentProjectId = initialProjectId;
    let failed: string | null = null;
    let currentRole = PIPELINE_ROLES[startIndex] ?? PIPELINE_ROLES[0];

    try {
      for (let index = startIndex; index < PIPELINE_ROLES.length; index += 1) {
        const role = PIPELINE_ROLES[index];
        currentRole = role;
        let stageErrors: string[] = [];

        await metaFactoryClient.generateStageStream(
          localizedSpec,
          projectName.trim() || 'meta-factory-project',
          role,
          currentProjectId,
          (event) => {
            setLastEventAt(Date.now());
            if (event.type === 'heartbeat') return;

            setStreamEvents((prev) => [...prev, event]);
            if (event.type === 'agent_started') {
              setStageStart((prev) => ({ ...prev, [event.role]: Date.now() }));
            } else if (event.type === 'file_emitted') {
              setEmittedPaths((prev) => (prev.includes(event.path) ? prev : [...prev, event.path]));
            } else if (event.type === 'agent_finished') {
              setStageEnd((prev) => ({ ...prev, [event.role]: Date.now() }));
              liveRuns.set(event.role, {
                role: event.role,
                model: event.model,
                file_count: event.file_count,
                stopped_by: event.stopped_by,
                errors: event.errors,
              });
              setRuns(Array.from(liveRuns.values()));
              if (event.degraded) setDegraded(true);
              if (event.errors.length > 0) stageErrors = event.errors;
            } else if (event.type === 'written') {
              currentProjectId = event.project_id;
              setProjectId(event.project_id);
            } else if (event.type === 'validation_report') {
              setValidationReport(event.report);
            } else if (event.type === 'stage_done') {
              setStageEnd((prev) => ({ ...prev, [event.role]: Date.now() }));
              if (event.degraded) setDegraded(true);
              if (event.project_id) {
                currentProjectId = event.project_id;
                setProjectId(event.project_id);
              }
              if (event.errors.length > 0) stageErrors = event.errors;
            } else if (event.type === 'done') {
              if (event.degraded) setDegraded(true);
              if (!event.ok && event.errors.length > 0) stageErrors = event.errors;
            } else if (event.type === 'error') {
              stageErrors = [event.detail];
            }
          },
          model || undefined,
          useUserKey,
          blueprint,
        );

        if (currentProjectId) {
          const listing = await metaFactoryClient.listFiles(currentProjectId);
          setFiles(listing.files);
        }
        if (stageErrors.length > 0) {
          failed = role;
          setError(t('metaFactory.stageFailed', {
            role: t(`metaFactory.role.${role}`),
            error: stageErrors.slice(0, 3).join(' Â· '),
          }));
          break;
        }
      }

      if (!failed && currentProjectId) {
        const report = await metaFactoryClient.reviewCompleteness(
          localizedSpec,
          currentProjectId,
          model || undefined,
          useUserKey,
        );
        setCompletenessReport(report);
        if (report.degraded) setDegraded(true);

        // Build "sala de teste": real build + auto-repair before releasing.
        setVerifyStatus('running');
        setVerifyPassed(false);
        setRepairRound(0);
        await metaFactoryClient.verifyAndRepairStream(
          currentProjectId,
          localizedSpec,
          (event) => {
            setLastEventAt(Date.now());
            if (event.type === 'heartbeat') return;
            setStreamEvents((prev) => [...prev, event]);
            if (event.type === 'validation_report') {
              setValidationReport(event.report);
            } else if (event.type === 'repair_started') {
              setRepairRound(event.round);
            } else if (event.type === 'file_emitted') {
              setEmittedPaths((prev) => (prev.includes(event.path) ? prev : [...prev, event.path]));
            } else if (event.type === 'verify_done') {
              setVerifyPassed(event.passed);
              if (event.report) setValidationReport(event.report);
            } else if (event.type === 'error') {
              setError(event.detail);
            }
          },
          model || undefined,
          useUserKey,
        );
        setVerifyStatus('done');
        const verified = await metaFactoryClient.listFiles(currentProjectId);
        setFiles(verified.files);

        // Unified journey: mark the originating project as Gerado.
        if (sourceProjectId) {
          try {
            await projectRoomsClient.markGenerated(sourceProjectId, currentProjectId);
          } catch {
            // Non-fatal: the project is generated even if the room status update fails.
          }
        }

        // A generated project now exists: refresh every catalog/dashboard
        // surface (projects list, dashboard, documentation picker, downloads,
        // roadmap) so the new project appears without a manual reload.
        syncProjectCaches();
      }
    } catch (err) {
      failed = currentRole;
      setError(err instanceof Error ? err.message : t('metaFactory.error.generate'));
    } finally {
      if (failed) setFailedRole(failed);
      setBusy(null);
    }
  }

  async function startStageGeneration() {
    if (!spec) return;
    setRuns([]);
    setFiles([]);
    setProjectId(null);
    setActiveFile(null);
    setValidationReport(null);
    setCompletenessReport(null);
    setVerifyStatus('idle');
    setVerifyPassed(false);
    setRepairRound(0);
    setStreamEvents([]);
    setEmittedPaths([]);
    setDegraded(false);
    setStageStart({});
    setStageEnd({});

    await runStageSequence({ ...spec, locale }, 0, null, []);
  }

  async function retryStage() {
    if (!spec || !failedRole) return;
    const startIndex = PIPELINE_ROLES.findIndex((role) => role === failedRole);
    if (startIndex < 0) return;
    const retryRoles = new Set<string>(PIPELINE_ROLES.slice(startIndex));
    const retainedRuns = runs.filter((run) => !retryRoles.has(run.role));
    setRuns(retainedRuns);
    setStreamEvents((prev) => prev.filter((event) => !('role' in event) || !retryRoles.has(event.role)));
    setStageStart((prev) => Object.fromEntries(Object.entries(prev).filter(([role]) => !retryRoles.has(role))));
    setStageEnd((prev) => Object.fromEntries(Object.entries(prev).filter(([role]) => !retryRoles.has(role))));
    setValidationReport(null);
    setCompletenessReport(null);
    setVerifyStatus('idle');
    setVerifyPassed(false);
    setRepairRound(0);

    if (projectId) {
      const listing = await metaFactoryClient.listFiles(projectId);
      setFiles(listing.files);
      setEmittedPaths(listing.files.map((file) => file.relative_path).filter((path) => path !== '.ldcn-generation.json'));
    } else {
      setFiles([]);
      setEmittedPaths([]);
    }

    await runStageSequence({ ...spec, locale }, startIndex, projectId, retainedRuns);
  }

  async function handleGenerate() {
    if (!spec) return;
    await startStageGeneration();
  }

  function roleState(role: string): 'pending' | 'running' | 'passed' | 'failed' {
    let state: 'pending' | 'running' | 'passed' | 'failed' = 'pending';
    for (const event of streamEvents) {
      if ('role' in event && event.role === role) {
        if (event.type === 'agent_started') state = 'running';
        if (event.type === 'agent_finished' && event.errors.length > 0) state = 'failed';
        if (event.type === 'gate_check') state = event.status === 'passed' ? 'passed' : 'failed';
        if (event.type === 'stage_done') state = event.errors.length === 0 ? 'passed' : 'failed';
      }
    }
    return state;
  }

  async function handleOpenFile(path: string) {
    if (!projectId) return;
    setBusy('file');
    try {
      const result = await metaFactoryClient.fileContent(projectId, path);
      setActiveFile({ path, content: result.content ?? t('metaFactory.noPreview') });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.openFile'));
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload(force = false) {
    if (!projectId) return;
    setBusy('download');
    try {
      await metaFactoryClient.prepareDownload(projectId, force);
      await metaFactoryClient.download(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.download'));
    } finally {
      setBusy(null);
    }
  }

  // Overall pipeline progress derived from per-role gate state.
  const roleStates = PIPELINE_ROLES.map((role) => ({ role, state: roleState(role) }));
  const completedCount = roleStates.filter((r) => r.state === 'passed' || r.state === 'failed').length;
  const runningRole = roleStates.find((r) => r.state === 'running')?.role ?? null;
  // Count an in-flight stage as half-done so the bar visibly advances mid-stage.
  const overallPct = Math.round(((completedCount + (runningRole ? 0.5 : 0)) / PIPELINE_ROLES.length) * 100);
  const runningElapsed = runningRole ? stageElapsedSec(runningRole) : 0;
  const stageIsSlow = runningElapsed >= SLOW_STAGE_SECONDS;
  // The backend pings every ~8s; ~24s of total silence means the stream is gone,
  // not just a slow stage. This is the real "stuck vs. working" signal.
  const STALE_SECONDS = 24;
  const silenceSec = busy === 'generate' ? Math.max(0, Math.floor((now - lastEventAt) / 1000)) : 0;
  const connectionLost = busy === 'generate' && silenceSec >= STALE_SECONDS;

  if (roomLoad === 'blocked') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t('metaFactory.blockedTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('metaFactory.blockedDescription')}</p>
        <Link href="/project-rooms" className="mt-6 inline-block text-sm text-[color:var(--accent)] hover:underline">
          {t('metaFactory.backToProject')}
        </Link>
      </div>
    );
  }

  if (roomLoad === 'needs_blueprint') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t('metaFactory.gate.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('metaFactory.gate.desc')}</p>
        <Link
          href={`/architect?projectId=${sourceProjectId}`}
          className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold accent-fill"
        >
          {t('metaFactory.gate.cta')}
        </Link>
      </div>
    );
  }

  if (roomLoad === 'needs_review') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t('metaFactory.reviewGate.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('metaFactory.reviewGate.desc')}</p>
        <Link
          href={`/engineering-review?projectId=${sourceProjectId}`}
          className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold accent-fill"
        >
          {t('metaFactory.reviewGate.cta')}
        </Link>
      </div>
    );
  }

  if (roomLoad === 'loaded' && sourceRoom && spec && blueprint) {
    return <ResilientPipeline room={sourceRoom} spec={spec} blueprint={blueprint} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <LDCNCoreBadge className="h-11 w-11 shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('metaFactory.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('metaFactory.description')}
            </p>
          </div>
        </div>
      </header>

      {sourceRoom ? <WorkflowContextHeader room={sourceRoom} stage={busy === 'generate' ? 'Generation' : verifyStatus === 'running' ? 'Validation' : 'Meta Factory'} /> : null}

      <AiUsageCard />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {roomLoad === 'loaded' ? (
        <div className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3 text-sm text-[color:var(--accent)] dark:text-[color:var(--accent)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t('metaFactory.loadedFromRoom', { title: roomTitle })}</span>
        </div>
      ) : null}

      {/* Step 1 â€” intent */}
      <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-xs font-bold text-[color:var(--accent)]">1</span>
          {t('metaFactory.idea')}
        </h2>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={4}
          placeholder={t('metaFactory.intentPlaceholder')}
          className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition focus:ring-2"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t('metaFactory.intentHelpBefore')}
          <span className="font-medium"> {t('metaFactory.smartDefaults')}</span> {t('metaFactory.intentHelpAfter')}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('metaFactory.model')}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id ? m.label : t('metaFactory.autoModel')}
                </option>
              ))}
            </select>
          </label>
          <LlmProviderInline />
          {MODELS.find((m) => m.id === model)?.local && (
            <p className="basis-full text-xs text-emerald-600 dark:text-emerald-400">
              {t('metaFactory.localModelHint')}
            </p>
          )}
          {MODELS.find((m) => m.id === model)?.custom && (
            <p className="basis-full text-xs text-emerald-600 dark:text-emerald-400">
              {t('metaFactory.customModelHint')}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('metaFactory.language')}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {AVAILABLE_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleOrchestrate()}
            disabled={busy !== null || intent.trim().length < 8}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[image:var(--accent-gradient)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'spec' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('metaFactory.generateSpec')}
          </button>
        </div>
        <div className="mt-4">
          <UserKeyPanel enabled={useUserKey} onEnabledChange={setUseUserKey} />
        </div>
      </section>

      {/* Step 2 â€” spec + refine */}
      {spec && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-xs font-bold text-[color:var(--accent)]">2</span>
                {t('metaFactory.specification')}
              </h2>
              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-0.5 text-xs text-[color:var(--accent)]">
                {t('metaFactory.localeLabel')}: {locale}
              </span>
            </div>
            <ConfidenceMeter value={spec.confidence} label={t('metaFactory.confidence')} />
          </div>

          {questions.length > 0 && (
            <div className="mb-6 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] p-4">
              <p className="mb-3 text-sm font-medium">{t('metaFactory.refinementQuestions')}</p>
              <div className="flex flex-col gap-4">
                {questions.map((q) => (
                  <div key={q.id} className="flex flex-col gap-1">
                    <label className="text-sm font-medium">{q.question}</label>
                    <p className="text-xs text-muted-foreground">{q.why_it_matters}</p>
                    <input
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={t('metaFactory.defaultAnswer', { value: q.default_if_skipped })}
                      className="mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleRefine}
                disabled={busy !== null}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-sm font-medium text-[color:var(--accent)] transition hover:opacity-90/10 disabled:opacity-50"
              >
                {busy === 'spec' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('metaFactory.refineSpec')}
              </button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <SpecField label={t('metaFactory.summary')} value={spec.product_summary} />
            <SpecBadges label={t('metaFactory.targetUsers')} items={spec.target_users} />
            <SpecBadges label={t('metaFactory.businessRules')} items={spec.business_rules} />
            <SpecBadges label={t('metaFactory.entities')} items={spec.entities} />
            <SpecBadges label={t('metaFactory.workflows')} items={spec.core_workflows} />
            <SpecField
              label={t('metaFactory.suggestedStack')}
              value={[spec.suggested_stack.language, spec.suggested_stack.framework, spec.suggested_stack.architecture]
                .filter(Boolean)
                .join(' Â· ')}
            />
          </div>

          {spec.assumptions.length > 0 && (
            <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('metaFactory.assumptions')}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {spec.assumptions.map((a, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{a.field}:</span> {a.assumed_value}{' '}
                    <span className="opacity-70">({a.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t('metaFactory.projectName')}
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[image:var(--accent-gradient)] px-5 py-2 text-sm font-medium text-white shadow-lg shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {t('metaFactory.generateProject')}
            </button>
          </div>
        </section>
      )}

      {/* Deep Engineering â€” the system thinking through the project before generating */}
      {(deepThinking || deepStages.length > 0) && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {deepThinking ? (
                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {t('metaFactory.deep.title')}
            </h2>
            {deepThinking && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {t('metaFactory.deep.progress', { index: deepThinking.index, total: deepThinking.total })}
              </span>
            )}
          </div>

          {deepThinking && (
            <p className="mb-3 text-sm text-[color:var(--accent)]">
              {t('metaFactory.deep.thinking', { title: deepThinking.title })}
            </p>
          )}

          <ol className="flex flex-col gap-3">
            {deepStages.map((stage) => (
              <li key={stage.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="flex items-center gap-2">
                  {stage.status === 'attention' ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  <span className="text-sm font-medium">{stage.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{stage.summary}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {stage.details.map((detail, i) => (
                    <li key={i} className="text-xs leading-5 text-muted-foreground">Â· {detail}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          {deepAnalysis && !deepThinking && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1">
                {t('metaFactory.deep.complexity', { value: deepAnalysis.complexity })}
              </span>
              <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1">
                {t('metaFactory.deep.risk', { value: deepAnalysis.risk_level })}
              </span>
              <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1">
                {t('metaFactory.deep.effort', { value: deepAnalysis.effort_estimate })}
              </span>
              <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1 tabular-nums">
                {t('metaFactory.deep.components', { value: deepAnalysis.component_count })}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Live progress â€” real-time pipeline (Pillar 3) */}
      {(busy === 'generate' || streamEvents.length > 0) && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {busy === 'generate' ? (
                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {t('metaFactory.liveProgress')}
            </h2>
            {degraded && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('metaFactory.degradedMode')}
              </span>
            )}
          </div>

          {/* Overall progress bar â€” completed stages / total, with a live
              elapsed timer on the running stage so a long stage reads as
              "still working" rather than "stuck". */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">{t('metaFactory.overallProgress')}</span>
              <span className="tabular-nums text-muted-foreground">
                {t('metaFactory.stageCount', { done: completedCount, total: PIPELINE_ROLES.length })}
                {runningRole && (
                  <>
                    {' Â· '}
                    {t('metaFactory.stageElapsed', {
                      role: t(`metaFactory.role.${runningRole}`),
                      seconds: runningElapsed,
                    })}
                  </>
                )}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-[image:var(--accent-gradient)] transition-all duration-500 ease-out"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            {connectionLost ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('metaFactory.connectionLost', { seconds: silenceSec })}
              </p>
            ) : runningRole && stageIsSlow ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('metaFactory.stageSlow')}
              </p>
            ) : null}
            {failedRole && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('metaFactory.stageFailed', { role: t(`metaFactory.role.${failedRole}`), error: '' })}
                </p>
                <button
                  type="button"
                  onClick={() => void retryStage()}
                  disabled={busy !== null}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('metaFactory.retryStage')}
                </button>
              </div>
            )}
          </div>

          {/* Agent pipeline status */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('metaFactory.title')}
            </span>
            <LlmProviderInline />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {PIPELINE_ROLES.map((role) => {
              const state = roleState(role);
              const styles = {
                pending: 'border-border/60 text-muted-foreground',
                running: 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]',
                passed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                failed: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
              }[state];
              return (
                <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles}`}>
                  {state === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {state === 'passed' && <CheckCircle2 className="h-3 w-3" />}
                  {state === 'failed' && <AlertTriangle className="h-3 w-3" />}
                  {t(`metaFactory.role.${role}`)}
                  {state === 'running' && stageStart[role] !== undefined && (
                    <span className="tabular-nums opacity-70">{stageElapsedSec(role)}s</span>
                  )}
                </span>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            {/* Directory tree growing live */}
            <div className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-background/40 p-3 text-xs leading-relaxed">
              <p className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">{t('metaFactory.directoryTree')}</p>
              {emittedPaths.length === 0 ? (
                <p className="text-muted-foreground">{t('metaFactory.waitingFiles')}</p>
              ) : (
                <ul className="flex flex-col gap-0.5 font-mono">
                  {[...emittedPaths].sort().map((path) => (
                    <li key={path} className="flex items-center gap-1.5 truncate">
                      <FileCode2 className="h-3 w-3 shrink-0 opacity-50" />
                      <span className="truncate">{path}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Gate checks (security/lint) */}
            <div className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-background/40 p-3 text-xs leading-relaxed">
              <p className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">{t('metaFactory.gateChecks')}</p>
              <ul className="flex flex-col gap-1">
                {streamEvents
                  .filter((e): e is Extract<FactoryEvent, { type: 'gate_check' }> => e.type === 'gate_check')
                  .map((e, i) => (
                    <li key={`${e.role}-${i}`} className="flex items-start gap-1.5">
                      {e.status === 'passed' ? (
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                      )}
                      <span>
                        <span className="font-medium">{t(`metaFactory.role.${e.role}`)}</span>{' '}
                        <span className="text-muted-foreground">{e.detail}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Step 3 â€” results */}
      {runs.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-xs font-bold text-[color:var(--accent)]">3</span>
            {t('metaFactory.result')}
          </h2>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {runs.map((run) => (
              <div key={run.role} className="rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t(`metaFactory.role.${run.role}`)}</span>
                  {run.errors.length === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('metaFactory.runFiles', { model: run.model, count: run.file_count })}
                </p>
                {run.errors.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{run.errors[0]}</p>
                )}
              </div>
            ))}
          </div>

          {projectId && verifyStatus !== 'idle' && (
            <div className={`mt-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              verifyStatus === 'running'
                ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:text-[color:var(--accent)]'
                : verifyPassed
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            }`}>
              {verifyStatus === 'running' ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : verifyPassed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>
                {verifyStatus === 'running'
                  ? (repairRound > 0
                    ? t('metaFactory.verify.repairing', { round: repairRound })
                    : t('metaFactory.verify.running'))
                  : verifyPassed
                    ? t('metaFactory.verify.passed')
                    : t('metaFactory.verify.failed')}
              </span>
            </div>
          )}

          {projectId && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {t('metaFactory.project')} <code className="rounded bg-background px-1.5 py-0.5 text-xs">{projectId}</code> Â· {t('metaFactory.fileCount', { count: files.length })}
              </span>
              {verifyStatus === 'running' ? (
                <button
                  type="button"
                  disabled
                  className="ml-auto inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium opacity-50"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('metaFactory.verify.running')}
                </button>
              ) : verifyPassed ? (
                <button
                  type="button"
                  onClick={() => void handleDownload(false)}
                  disabled={busy !== null}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-background/60 disabled:opacity-50"
                >
                  {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t('metaFactory.downloadZip')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleDownload(true)}
                  disabled={busy !== null}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl border border-amber-500/50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
                >
                  {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t('metaFactory.verify.downloadAnyway')}
                </button>
              )}
            </div>
          )}

          {projectId && (validationReport || completenessReport) && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {validationReport && <ValidationReportPanel report={validationReport} />}
              {completenessReport && <CompletenessPanel report={completenessReport} onEvidenceClick={(path) => void handleOpenFile(path)} />}
            </div>
          )}

          {projectId && (
            <div className="mt-6 grid gap-4">
              <ExportPanel
                surface="meta-factory"
                projectId={projectId}
                defaultRepoName={(projectName.trim() || 'meta-factory-project').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')}
                verified={verifyPassed}
              />
              <ApiTestPanel surface="meta-factory" projectId={projectId} />
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
              <ul className="max-h-80 overflow-auto rounded-xl border border-border/60 bg-background/40 p-2 text-sm">
                {files.map((file) => (
                  <li key={file.relative_path}>
                    <button
                      type="button"
                      onClick={() => void handleOpenFile(file.relative_path)}
                      className={`flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left transition hover:opacity-90/10 ${
                        activeFile?.path === file.relative_path ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)]' : ''
                      }`}
                    >
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{file.relative_path}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <pre className="max-h-80 overflow-auto rounded-xl border border-border/60 bg-background/60 p-4 text-xs leading-relaxed">
                {busy === 'file' ? t('metaFactory.loadingFile') : activeFile ? activeFile.content : t('metaFactory.selectFile')}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-[image:var(--accent-gradient)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium">{pct}%</span>
    </div>
  );
}

function SpecField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || 'â€”'}</p>
    </div>
  );
}

function SpecBadges({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">â€”</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 py-0.5 text-xs text-[color:var(--accent)]">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
