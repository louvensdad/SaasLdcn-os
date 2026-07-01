'use client';

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Blocks,
  Boxes,
  Compass,
  Database,
  FileSearch,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Plug,
  Rocket,
  Server,
  ShieldCheck,
  TestTube,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { AccordionItem } from '@/components/ui/accordion';
import { ArchitectureModelTab, ArchitectureStrategiesTab } from '@/components/architecture-review/architecture-model-views';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { projectRoomsClient } from '@/lib/api/project-rooms';
import { ArchitectWorkflowModal, BlueprintVersionHistory, WorkflowTimeline } from '@/components/project/architect-workflow';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';
import { BlueprintResponseViewer } from '@/components/project/blueprint-response-viewer';
import type { ProjectRoom, ProjectRoomSummary } from '@contracts/project-room.contract';
import type { BlueprintDecision } from '@contracts/architecture-blueprint.contract';
import { useLocale } from '@/hooks/use-locale';
import { useProjectCacheSync } from '@/hooks/use-project-cache-sync';

const APPROVED_STATUSES = ['PROMPT_APPROVED', 'BLUEPRINT_GENERATING', 'BLUEPRINT_READY', 'ENGINEERING_REVIEW', 'ENGINEERING_APPROVED', 'WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'];
const META_STATUSES = ['WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'];


const AREA_ICON: Record<string, LucideIcon> = {
  frontend: Globe,
  backend: Server,
  database: Database,
  auth: KeyRound,
  authorization: ShieldCheck,
  apis: Webhook,
  integrations: Plug,
  observability: Activity,
  tests: TestTube,
  deploy: Rocket,
};

export default function ArchitectPage() {
  return (
    <Suspense fallback={<CardLoading />}>
      <ArchitectInner />
    </Suspense>
  );
}

function ArchitectInner() {
  const { t } = useLocale();
  const projectId = useSearchParams().get('projectId');

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <SectionHeader title={t('architect.title')} description={t('architect.subtitle')} />
      {projectId ? <ArchitectStage roomId={projectId} /> : <ArchitectChooser />}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Chooser (no room selected)
// --------------------------------------------------------------------------- //

function ArchitectChooser() {
  const { locale, t } = useLocale();
  const [rooms, setRooms] = useState<ProjectRoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    projectRoomsClient
      .list()
      .then((list) => active && setRooms(list.filter((room) => APPROVED_STATUSES.includes(room.status))))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : 'error'));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <PageError title={t('architect.error.title')} description={error} />;
  }
  if (rooms === null) {
    return <div className="grid gap-3 sm:grid-cols-2"><CardLoading /><CardLoading /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="t-h2 text-[color:var(--text)]">{t('architect.chooser.title')}</h2>
        <p className="mt-2 t-body text-[color:var(--muted)]">{t('architect.chooser.hint')}</p>
      </div>

      {rooms.length === 0 ? (
        <Card className="glass noise space-y-4 p-8 text-center">
          <Compass className="mx-auto h-8 w-8 text-[color:var(--muted)]" aria-hidden />
          <p className="t-body text-[color:var(--muted)]">{t('architect.chooser.empty')}</p>
          <div>
            <Link href="/project-rooms/new"><Button variant="primary">{t('architect.chooser.newRoom')}</Button></Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rooms.map((room) => (
            <Link key={room.room_id} href={`/architect?projectId=${room.room_id}`} className="glass lift focus-ring flex items-center justify-between gap-3 rounded-[var(--radius-lg)] p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--text)]">{room.title}</p>
                <p className="mt-1 t-mono text-xs text-[color:var(--muted-2)]">{new Date(room.updated_at).toLocaleDateString(locale)}</p>
              </div>
              <RoomStatusBadge status={room.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Stage (room selected)
// --------------------------------------------------------------------------- //

function ArchitectStage({ roomId }: { readonly roomId: string }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const shouldRegenerate = useSearchParams().get('regenerate') === '1';
  const [room, setRoom] = useState<ProjectRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'send'>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const syncProjectCaches = useProjectCacheSync();

  const load = useCallback(async () => {
    setError(null);
    try {
      setRoom(await projectRoomsClient.get(roomId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'error');
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (room?.status === 'BLUEPRINT_GENERATING') setWorkflowOpen(true);
  }, [room?.status]);

  useEffect(() => {
    if (room && shouldRegenerate) setWorkflowOpen(true);
  }, [room, shouldRegenerate]);


  async function send() {
    setBusy('send');
    setError(null);
    try {
      await projectRoomsClient.startEngineeringReview(roomId);
      syncProjectCaches();
      router.push(`/engineering-review?projectId=${roomId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'error');
      setBusy(null);
    }
  }

  const acceptRoomUpdate = useCallback((updated: ProjectRoom) => {
    setRoom(updated);
    syncProjectCaches();
    router.refresh();
  }, [router, syncProjectCaches]);

  if (error && !room) {
    return <PageError title={t('architect.error.title')} description={error} onRetry={() => void load()} />;
  }
  if (!room) {
    return <CardLoading className="h-64" />;
  }

  const approved = APPROVED_STATUSES.includes(room.status);
  const blueprint = room.architecture_blueprint;
  const model = room.architecture_model ?? null;
  const sent = META_STATUSES.includes(room.status);
  const inReview = room.status === 'ENGINEERING_REVIEW';

  if (!approved) {
    return (
      <Card className="glass noise space-y-4 p-8 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-[color:var(--warning)]" aria-hidden />
        <h2 className="t-h3 text-[color:var(--text)]">{t('architect.blocked.title')}</h2>
        <p className="mx-auto max-w-md t-body text-[color:var(--muted)]">{t('architect.blocked.desc')}</p>
        <div>
          <Link href={`/project-rooms/${roomId}`}><Button variant="primary">{t('architect.blocked.cta')}</Button></Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <WorkflowContextHeader room={room} stage={blueprint ? 'Architect AI' : 'Aguardando Blueprint'} />
      <Card surface="primary" className="glass noise relative overflow-hidden p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="t-overline">{t('architect.blueprint.title')}</p>
            <h2 className="mt-2 t-h2 text-[color:var(--text)]">{room.title}</h2>
          </div>
          <RoomStatusBadge status={room.status} />
        </div>

        {blueprint ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={blueprint.degraded ? 'warning' : 'success'}>
              {blueprint.degraded ? t('architect.blueprint.degraded') : t('architect.blueprint.aiAuthored')}
            </Badge>
            <Badge>{t('architect.confidence')}: {Math.round((room.confidence ?? 0) * 100)}%</Badge>
            <Badge>{t('architect.generatedAt')}: {new Date(blueprint.generated_at).toLocaleString(locale)}</Badge>
          </div>
        ) : (
          <p className="mt-4 max-w-2xl t-body text-[color:var(--muted)]">{t('architect.generateHint')}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {!blueprint ? (
            <Button variant="primary" onClick={() => setWorkflowOpen(true)}>{t('architect.generate')}</Button>
          ) : sent ? (
            <Link href={`/meta-factory?projectId=${roomId}`}>
              <Button variant="primary">{t('architect.openMetaFactory')} <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          ) : inReview ? (
            <Link href={`/engineering-review?projectId=${roomId}`}>
              <Button variant="primary">{t('architect.openEngineeringReview')} <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          ) : (
            <>
              <Button variant="primary" loading={busy === 'send'} onClick={() => void send()}>
                {busy === 'send' ? t('architect.sending') : t('architect.sendToEngineeringReview')} <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setWorkflowOpen(true)}>Regenerar com IA</Button>
            </>
          )}
        </div>

        {error ? <p className="mt-3 t-caption text-[color:var(--danger)]" role="alert">{error}</p> : null}
      </Card>

      {blueprint ? (
        <Tabs
          items={[
            {
              id: 'decisions',
              label: 'Decisões',
              icon: Blocks,
              content: (
                <div className="space-y-3">
                  {blueprint.decisions.map((decision, index) => (
                    <DecisionCard key={`${decision.area}-${index}`} decision={decision} />
                  ))}
                </div>
              ),
            },
            {
              id: 'model',
              label: 'Modelo',
              icon: Boxes,
              content: model ? <ArchitectureModelTab model={model} /> : <p className="t-caption text-[color:var(--muted-2)]">Modelo de arquitetura indisponÃ­vel.</p>,
            },
            {
              id: 'strategies',
              label: 'Estratégias',
              icon: Layers,
              content: model ? <ArchitectureStrategiesTab model={model} /> : <p className="t-caption text-[color:var(--muted-2)]">Estratégias indisponÃ­veis.</p>,
            },
            ...(blueprint.responseDiagnostics
              ? [{
                  id: 'ai-response',
                  label: 'Resposta da IA',
                  icon: FileSearch,
                  content: <BlueprintResponseViewer diagnostics={blueprint.responseDiagnostics} />,
                }]
              : []),
          ]}
        />
      ) : null}
      {blueprint ? <BlueprintVersionHistory room={room} onRoom={acceptRoomUpdate} /> : null}
      <WorkflowTimeline room={room} />
      <ArchitectWorkflowModal
        room={room}
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        onRoom={acceptRoomUpdate}
      />
    </div>
  );
}


function Meta({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] p-3">
      <p className="t-overline">{label}</p>
      <p className="mt-1 font-semibold text-[color:var(--text)]">{value}</p>
    </div>
  );
}
function ConfidenceBadge({ value }: { readonly value?: number }) {
  if (value === undefined || value === null) return null;
  const pct = Math.round(value * 100);
  const tone = pct >= 90 ? 'success' : pct >= 70 ? 'accent' : 'warning';
  return <Badge tone={tone}><Gauge className="mr-1 h-3 w-3" aria-hidden /> {pct}%</Badge>;
}

function DecisionCard({ decision }: { readonly decision: BlueprintDecision }) {
  const { t } = useLocale();
  const Icon = AREA_ICON[decision.area] ?? Blocks;
  const areaLabel = t(`architect.area.${decision.area}`);
  const label = areaLabel.startsWith('architect.area.') ? decision.area : areaLabel;
  const impacts: [string, string | undefined][] = [
    ['SeguranÃ§a', decision.security_impact],
    ['Escalabilidade', decision.scalability_impact],
    ['Custo', decision.cost_impact],
    ['ManutenÃ§Ã£o', decision.maintainability_impact],
  ];

  return (
    <AccordionItem
      icon={Icon}
      title={`${label}: ${decision.choice}`}
      subtitle={decision.confidence_basis ? `ConfianÃ§a â€” ${decision.confidence_basis}` : undefined}
      right={<ConfidenceBadge value={decision.confidence} />}
    >
    <div className="space-y-3">
      {decision.context ? <p className="t-caption text-[color:var(--muted-2)]">{decision.context}</p> : null}

      <div>
        <p className="t-caption font-semibold text-[color:var(--text)]">{t('architect.decision.justification')}</p>
        <p className="mt-1 t-body text-[color:var(--muted)]">{decision.justification}</p>
      </div>

      {decision.impact ? (
        <div>
          <p className="t-caption font-semibold text-[color:var(--text)]">Impacto</p>
          <p className="mt-1 t-caption text-[color:var(--muted)]">{decision.impact}</p>
        </div>
      ) : null}

      {impacts.some(([, v]) => v) ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {impacts.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-2.5">
              <p className="t-overline">{k}</p>
              <p className="mt-0.5 t-caption text-[color:var(--muted)]">{v}</p>
            </div>
          ))}
        </div>
      ) : null}

      {decision.tradeoffs?.length ? (
        <div>
          <p className="t-caption font-semibold text-[color:var(--text)]">Trade-offs</p>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 t-caption text-[color:var(--muted)]">
            {decision.tradeoffs.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {decision.risks?.length ? (
        <div>
          <p className="t-caption font-semibold text-[color:var(--text)]">Riscos</p>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 t-caption text-[color:var(--muted)]">
            {decision.risks.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {decision.when_to_reconsider ? (
        <div>
          <p className="t-caption font-semibold text-[color:var(--text)]">Quando reconsiderar</p>
          <p className="mt-1 t-caption text-[color:var(--muted)]">{decision.when_to_reconsider}</p>
        </div>
      ) : null}

      <div>
        <p className="t-caption font-semibold text-[color:var(--text)]">{t('architect.decision.alternatives')}</p>
        {decision.alternatives_considered.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {decision.alternatives_considered.map((alt) => <Badge key={alt} tone="neutral">{alt}</Badge>)}
          </div>
        ) : (
          <p className="mt-1 t-caption">{t('architect.decision.noAlternatives')}</p>
        )}
      </div>

      {decision.dependencies?.length || decision.requirement_links?.length ? (
        <div className="grid gap-2 border-t border-[color:var(--border)] pt-3 sm:grid-cols-2">
          {decision.dependencies?.length ? (
            <div>
              <p className="t-overline">DependÃªncias</p>
              <div className="mt-1 flex flex-wrap gap-1">{decision.dependencies.map((dep) => <Badge key={dep} tone="neutral">{dep}</Badge>)}</div>
            </div>
          ) : null}
          {decision.requirement_links?.length ? (
            <div>
              <p className="t-overline">Requisitos da spec</p>
              <ul className="mt-1 space-y-0.5 t-caption text-[color:var(--muted)]">{decision.requirement_links.map((req, index) => <li key={index}>â€¢ {req}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {decision.evidence?.length ? (
        <div>
          <p className="t-overline">EvidÃªncias utilizadas</p>
          <ul className="mt-1 space-y-0.5 t-caption text-[color:var(--muted)]">{decision.evidence.map((ev, index) => <li key={index}>â€¢ {ev}</li>)}</ul>
        </div>
      ) : null}
    </div>
    </AccordionItem>
  );
}

function RoomStatusBadge({ status }: { readonly status: string }) {
  const tone = ['BLUEPRINT_READY', 'ENGINEERING_REVIEW', 'ENGINEERING_APPROVED', 'WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY'].includes(status)
    ? 'success'
    : status === 'PROMPT_APPROVED'
      ? 'accent'
      : 'neutral';
  return <Badge tone={tone}>{status.replaceAll('_', ' ').toLowerCase()}</Badge>;
}
