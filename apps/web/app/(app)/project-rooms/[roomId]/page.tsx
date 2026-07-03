'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Compass,
  Loader2,
  Pencil,
  Rocket,
  Send,
  Sparkles,
} from 'lucide-react';

import { projectRoomsClient } from '@/lib/api/project-rooms';
import { metaFactoryClient, type ProjectSpec } from '@/lib/api/meta-factory';
import type { ProjectRoom, ProjectRoomStatus } from '@contracts/project-room.contract';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DeepAnalysisPanel } from '@/components/engineering/deep-analysis-panel';
import { LlmConfirmationGate } from '@/components/llm/llm-confirmation-gate';
import { useLocale } from '@/hooks/use-locale';
import { useProjectCacheSync } from '@/hooks/use-project-cache-sync';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';

const STATUS_TONE: Record<ProjectRoomStatus, BadgeTone> = {
  DRAFT: 'neutral',
  UNDER_REVIEW: 'warning',
  PROMPT_READY: 'accent',
  PROMPT_APPROVED: 'success',
  BLUEPRINT_GENERATING: 'warning',
  BLUEPRINT_READY: 'accent',
  ENGINEERING_REVIEW: 'warning',
  ENGINEERING_APPROVED: 'success',
  WAITING_META_FACTORY: 'accent',
  META_FACTORY_RUNNING: 'accent',
  GENERATING: 'warning',
  VALIDATING: 'warning',
  READY: 'success',
  FAILED: 'warning',
  ARCHIVED: 'neutral',
};

const STEP_KEYS = ['discovery', 'prompt', 'blueprint', 'engineeringReview', 'generation'] as const;
const STEP_OF_STATUS: Record<ProjectRoomStatus, number> = {
  DRAFT: 0,
  UNDER_REVIEW: 0,
  PROMPT_READY: 1,
  PROMPT_APPROVED: 2,
  BLUEPRINT_GENERATING: 2,
  BLUEPRINT_READY: 2,
  ENGINEERING_REVIEW: 3,
  ENGINEERING_APPROVED: 3,
  WAITING_META_FACTORY: 4,
  META_FACTORY_RUNNING: 4,
  GENERATING: 4,
  VALIDATING: 4,
  READY: 4,
  FAILED: 4,
  ARCHIVED: 0,
};

export default function ProjectRoomPage() {
  const { t } = useLocale();
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;

  const [room, setRoom] = useState<ProjectRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLlmGate, setShowLlmGate] = useState(false);

  const [message, setMessage] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftMarkdown, setDraftMarkdown] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const syncProjectCaches = useProjectCacheSync();

  useEffect(() => {
    let active = true;
    projectRoomsClient
      .get(roomId)
      .then((data) => active && setRoom(data))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : t('projectRooms.actionError')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [roomId, t]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.messages.length]);

  async function run(action: () => Promise<ProjectRoom>) {
    setBusy(true);
    setError(null);
    try {
      setRoom(await action());
      // The action may have advanced the room/project lifecycle server-side;
      // refresh the React Query caches that mirror it (projects, dashboard,
      // documentation, roadmap, downloads) so they never need a manual F5.
      syncProjectCaches();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('projectRooms.actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    const content = message.trim();
    if (!content) return;
    setMessage('');
    await run(() => projectRoomsClient.postMessage(roomId, { content }));
  }

  async function handleRevise() {
    const value = adjustment.trim();
    if (!value) return;
    setAdjustment('');
    await run(() => projectRoomsClient.revisePrompt(roomId, { adjustment: value }));
  }

  async function handleCopy() {
    if (!room?.prompt_master_md) return;
    await navigator.clipboard.writeText(editing ? draftMarkdown : room.prompt_master_md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function toggleEdit() {
    if (!editing) setDraftMarkdown(room?.prompt_master_md ?? '');
    setEditing((value) => !value);
  }

  function handleExportMd() {
    const markdown = (editing ? draftMarkdown : room?.prompt_master_md) ?? '';
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'PromptMaster.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // The Architecture/Engineering Review is the explicit stage between an approved
  // blueprint and the Meta-Factory. From BLUEPRINT_READY we start the review
  // (status Ã¢â€ â€™ ENGINEERING_REVIEW) and open the Review Center.
  async function handleOpenEngineeringReview() {
    setBusy(true);
    setError(null);
    try {
      if (room?.status === 'BLUEPRINT_READY') {
        await projectRoomsClient.startEngineeringReview(roomId);
        syncProjectCaches();
      }
      router.push(`/engineering-review?projectId=${roomId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('projectRooms.actionError'));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-10 text-sm text-[color:var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (!room) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-[color:var(--danger,#f87171)]">{error ?? t('projectRooms.loadError')}</p>
        <Link href="/project-rooms" className="mt-4 inline-flex items-center gap-2 text-sm text-[color:var(--muted)]">
          <ArrowLeft className="h-4 w-4" />
          {t('projectRooms.back')}
        </Link>
      </div>
    );
  }

  const hasSpec = room.spec !== null;
  const hasPrompt = Boolean(room.prompt_master_md);
  const latestVersion = room.prompt_master_versions.at(-1)?.version ?? 0;

  return (
    <div className="flex min-h-[calc(100vh-1rem)] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:h-[calc(100vh-1rem)] lg:min-h-0">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/project-rooms" className="text-[color:var(--muted)] hover:text-[color:var(--text)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold text-[color:var(--text)]">{room.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {room.degraded ? <Badge tone="warning">{t('projectRooms.deterministic')}</Badge> : null}
          <Badge tone={STATUS_TONE[room.status]}>{t(`projectRooms.status.${room.status}`)}</Badge>
        </div>
      </header>

      {/* Premium step indicator: Descoberta Ã¢â€ â€™ Prompt Ã¢â€ â€™ Blueprint Ã¢â€ â€™ GeraÃƒÂ§ÃƒÂ£o */}
      <div className="mb-4"><WorkflowContextHeader room={room} stage="Project Room" /></div>

      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto sm:gap-2">
        {STEP_KEYS.map((key, index) => {
          const active = STEP_OF_STATUS[room.status];
          const state = index < active ? 'done' : index === active ? 'current' : 'pending';
          return (
            <div key={key} className="flex flex-1 items-center gap-1.5 sm:gap-2">
              <span
                className={
                  state === 'done'
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--accent)] text-xs font-bold text-black'
                    : state === 'current'
                      ? 'flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--accent)] text-xs font-bold text-[color:var(--text)]'
                      : 'flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--border)] text-xs text-[color:var(--muted)]'
                }
              >
                {index + 1}
              </span>
              <span
                className={
                  state === 'pending'
                    ? 'hidden whitespace-nowrap text-xs text-[color:var(--muted)] sm:inline'
                    : 'hidden whitespace-nowrap text-xs font-medium text-[color:var(--text)] sm:inline'
                }
              >
                {t(`projectRooms.steps.${key}`)}
              </span>
              {index < STEP_KEYS.length - 1 ? (
                <span className="hidden h-px flex-1 bg-[color:var(--border)] sm:block" />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="mb-3 text-sm text-[color:var(--danger,#f87171)]">{error}</p> : null}

      <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-2">
        {/* Left: chat */}
        <Card className="flex min-h-[60vh] flex-col p-0 lg:min-h-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {room.messages.length === 0 ? (
              <p className="text-sm text-[color:var(--muted)]">{t('projectRooms.ideaPlaceholder')}</p>
            ) : (
              room.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[85%] rounded-2xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] px-4 py-2.5 text-sm text-[color:var(--text)]'
                        : 'max-w-[85%] rounded-2xl bg-white/5 px-4 py-2.5 text-sm text-[color:var(--text)]'
                    }
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))
            )}

            {room.open_questions.length > 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-white/[0.03] p-3">
                <p className="ds-caption mb-2 text-[color:var(--muted)]">{t('projectRooms.openQuestions')}</p>
                <ul className="space-y-1 text-sm text-[color:var(--text)]">
                  {room.open_questions.map((question) => (
                    <li key={question.id}>Ã¢â‚¬Â¢ {question.question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-[color:var(--border)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={t('projectRooms.composerPlaceholder')}
                rows={2}
                disabled={busy}
                className="focus-ring max-h-40 flex-1 resize-none rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
              />
              <Button variant="primary" onClick={handleSend} disabled={busy || !message.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            {hasSpec && !hasPrompt ? (
              <Button
                variant="soft"
                onClick={() => setShowLlmGate(true)}
                disabled={busy}
                className="mt-2 w-full"
              >
                <Sparkles className="h-4 w-4" />
                {busy ? t('projectRooms.generating') : t('projectRooms.generatePrompt')}
              </Button>
            ) : null}
            {showLlmGate ? (
              <div className="mt-3">
                <LlmConfirmationGate
                  capability="prompt_master_generation"
                  usageLabel="Project Room + PromptMaster"
                  compact
                  onConfirmed={async ({ mode, model }) => {
                    setShowLlmGate(false);
                    await run(() => projectRoomsClient.generatePrompt(
                      roomId,
                      mode === 'llm' && model ? { use_user_key: true, user_model_choice: model } : undefined,
                    ));
                  }}
                />
              </div>
            ) : null}
          </div>
        </Card>

        {/* Right: PromptMaster.md live preview */}
        <Card className="flex min-h-[60vh] flex-col p-0 lg:min-h-0">
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text)]">
              <FileText className="h-4 w-4" />
              {t('projectRooms.promptPreview')}
              {hasPrompt ? (
                <span className="text-xs font-normal text-[color:var(--muted)]">
                  {t('projectRooms.versionLabel', { version: latestVersion })}
                </span>
              ) : null}
            </div>
            {hasPrompt ? (
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={handleCopy} className="px-2 py-1.5">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="text-xs">{copied ? t('projectRooms.copied') : t('projectRooms.copy')}</span>
                </Button>
                <Button variant="ghost" onClick={handleExportMd} className="px-2 py-1.5">
                  <Download className="h-4 w-4" />
                  <span className="text-xs">{t('projectRooms.exportMd')}</span>
                </Button>
                <Button variant="ghost" onClick={toggleEdit} className="px-2 py-1.5">
                  <Pencil className="h-4 w-4" />
                  <span className="text-xs">{editing ? t('projectRooms.save') : t('projectRooms.edit')}</span>
                </Button>
              </div>
            ) : null}

          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {!hasPrompt ? (
              <p className="text-sm text-[color:var(--muted)]">{t('projectRooms.noPrompt')}</p>
            ) : editing ? (
              <textarea
                value={draftMarkdown}
                onChange={(event) => setDraftMarkdown(event.target.value)}
                className="focus-ring h-full min-h-[24rem] w-full resize-none rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-3 font-mono text-xs text-[color:var(--text)]"
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[color:var(--text)]/90">
                {room.prompt_master_md}
              </pre>
            )}
          </div>

          {hasPrompt ? (
            <div className="space-y-2 border-t border-[color:var(--border)] p-3">
              {['WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'].includes(room.status) ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm text-[color:var(--text)]">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('projectRooms.handoffNotice')}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/meta-factory?projectId=${roomId}`)}
                    className="w-full"
                  >
                    <Rocket className="h-4 w-4" />
                    {t('projectRooms.sendToMetaFactory')}
                  </Button>
                </div>
              ) : (
                <>
                  {room.architecture_blueprint ? (
                    <details className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-white/[0.03] p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--text)]">
                        {t('projectRooms.blueprintTitle')}
                        {room.architecture_blueprint.degraded ? (
                          <span className="ml-2 font-normal text-yellow-400/90">
                            {t('projectRooms.deterministic')}
                          </span>
                        ) : null}
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {room.architecture_blueprint.decisions.map((decision) => (
                          <li key={decision.area} className="text-xs text-[color:var(--text)]/90">
                            <span className="font-semibold capitalize">{decision.area}:</span> {decision.choice}
                            <span className="block text-[color:var(--muted)]">{decision.justification}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {room.spec && (room.status === 'BLUEPRINT_READY' || room.status === 'ENGINEERING_REVIEW' || room.status === 'ENGINEERING_APPROVED') ? (
                    <DeepAnalysisPanel
                      className="!p-4"
                      capability="architecture_deep_analysis"
                      usageLabel="Análise profunda da arquitetura"
                      run={(onEvent) =>
                        metaFactoryClient.deepAnalyzeStream(
                          room.spec as unknown as ProjectSpec,
                          room.architecture_blueprint,
                          onEvent,
                        )
                      }
                    />
                  ) : null}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={adjustment}
                      onChange={(event) => setAdjustment(event.target.value)}
                      placeholder={t('projectRooms.revisePlaceholder')}
                      rows={1}
                      disabled={busy}
                      className="focus-ring max-h-28 flex-1 resize-none rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
                    />
                    <Button variant="secondary" onClick={handleRevise} disabled={busy || !adjustment.trim()}>
                      {t('projectRooms.revise')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {room.status === 'PROMPT_READY' ? (
                      <Button
                        variant="soft"
                        onClick={() => run(() => projectRoomsClient.approve(roomId))}
                        disabled={busy}
                        className="flex-1"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t('projectRooms.approve')}
                      </Button>
                    ) : null}
                    {/* Architect Engine is the explicit, required stage between an
                        approved PromptMaster and the Meta-Factory. At PROMPT_APPROVED the
                        only forward action is to design the blueprint there. */}
                    {room.status === 'PROMPT_APPROVED' ? (
                      <Button
                        variant="primary"
                        onClick={() => router.push(`/architect?projectId=${roomId}`)}
                        disabled={busy}
                        className="flex-1"
                      >
                        <Compass className="h-4 w-4" />
                        {t('projectRooms.openArchitect')}
                      </Button>
                    ) : null}
                    {room.status === 'BLUEPRINT_READY' || room.status === 'ENGINEERING_REVIEW' || room.status === 'ENGINEERING_APPROVED' ? (
                      <>
                        <Button
                          variant="soft"
                          onClick={() => router.push(`/architect?projectId=${roomId}`)}
                          disabled={busy}
                          className="flex-1"
                        >
                          <Compass className="h-4 w-4" />
                          {t('projectRooms.reviewArchitect')}
                        </Button>
                        <Button variant="primary" onClick={handleOpenEngineeringReview} disabled={busy} className="flex-1">
                          <Rocket className="h-4 w-4" />
                          {t('projectRooms.openEngineeringReview')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

