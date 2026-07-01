'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, GitCompare, History, Loader2, RotateCcw, Trash2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useActiveLlm } from '@/hooks/use-active-llm';
import { projectRoomsClient, type BlueprintStreamEvent } from '@/lib/api/project-rooms';
import { userKeysClient } from '@/lib/api/user-keys';
import type { ArchitectureBlueprint, BlueprintDecision } from '@contracts/architecture-blueprint.contract';
import type { BlueprintVersion, ProjectRoom } from '@contracts/project-room.contract';

const STEPS = [
  'Conectando ao provider', 'Enviando PromptMaster', 'Recebendo resposta',
  'Analisando requisitos', 'Calculando trade-offs', 'Revisando arquitetura',
  'Validando segurança', 'Finalizando Blueprint',
];

type Phase = 'confirm' | 'processing' | 'comparison' | 'complete' | 'error';

export function ArchitectWorkflowModal({ room, open, onClose, onRoom }: {
  readonly room: ProjectRoom;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRoom: (room: ProjectRoom) => void;
}) {
  const llm = useActiveLlm();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [provider, setProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [events, setEvents] = useState<BlueprintStreamEvent[]>([]);
  const [streamed, setStreamed] = useState<BlueprintDecision[]>([]);
  const [result, setResult] = useState<ProjectRoom | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const onRoomRef = useRef(onRoom);
  const before = room.architecture_blueprint;

  useEffect(() => { onRoomRef.current = onRoom; }, [onRoom]);

  useEffect(() => {
    if (!open) return;
    setPhase(room.status === 'BLUEPRINT_GENERATING' ? 'processing' : 'confirm');
    setProvider(llm.provider ?? null);
    setEvents([]);
    setStreamed([]);
    setResult(null);
    setError('');
    void userKeysClient.status().then((status) => setProviders(status.sessions.filter((item) => item.active).map((item) => item.provider))).catch(() => setProviders([]));
  }, [open, llm.provider]);

  useEffect(() => {
    if (!open || room.status !== 'BLUEPRINT_GENERATING') return;
    let active = true;
    const poll = window.setInterval(() => {
      void projectRoomsClient.get(room.room_id).then((updated) => {
        if (!active) return;
        onRoomRef.current(updated);
        if (updated.status === 'BLUEPRINT_READY') {
          setResult(updated);
          setStreamed(updated.architecture_blueprint?.decisions ?? []);
          setEvents((current) => [...current, { type: 'progress', stage: 'complete', label: 'Blueprint recuperado', progress: 100 }]);
          setPhase('comparison');
          window.clearInterval(poll);
        } else if (updated.status === 'FAILED') {
          setError(updated.last_failure?.backend_message ?? 'A execução falhou no servidor.');
          setPhase('error');
          window.clearInterval(poll);
        }
      }).catch(() => undefined);
    }, 1500);
    return () => { active = false; window.clearInterval(poll); };
  }, [open, room.room_id, room.status]);

  useEffect(() => {
    if (phase !== 'processing') return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function generate(mode: 'llm' | 'deterministic') {
    setPhase('processing');
    setElapsed(0);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const updated = await projectRoomsClient.streamBlueprint(room.room_id, {
        mode,
        user_model_choice: mode === 'llm' ? llm.model : null,
        provider_override: mode === 'llm' ? provider : null,
        signal: controller.signal,
      }, (event) => {
        setEvents((current) => [...current, event]);
        if (event.type === 'decision') setStreamed((current) => [...current, event.decision]);
      });
      setResult(updated);
      onRoom(updated);
      setPhase('comparison');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setError('Geração cancelada. O Blueprint anterior foi preservado.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Falha ao gerar o Blueprint.');
      }
      setPhase('error');
    } finally {
      abortRef.current = null;
    }
  }

  async function cancelGeneration() {
    try {
      await projectRoomsClient.cancelBlueprint(room.room_id);
    } finally {
      abortRef.current?.abort();
      setError('Geração cancelada. A versão anterior foi preservada.');
      setPhase('error');
    }
  }

  if (!open) return null;
  const generated = result?.architecture_blueprint ?? null;
  const progress = [...events].reverse().find((item) => 'progress' in item)?.progress ?? 4;

  return createPortal((
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Refinar Blueprint com IA">
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[color:var(--surface-1)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] px-6 py-5">
          <div>
            <p className="t-overline">Architect AI · workflow controlado</p>
            <h2 className="mt-1 t-h2 text-[color:var(--text)]">{phase === 'confirm' ? 'Refinar Blueprint com IA' : phase === 'processing' ? 'Arquitetura em construção' : phase === 'comparison' ? 'Blueprint Comparison' : phase === 'complete' ? 'Blueprint Enterprise Ready' : 'Execução interrompida'}</h2>
          </div>
          <Button variant="ghost" className="h-9 w-9 p-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></Button>
        </header>

        {phase === 'confirm' ? (
          <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_.8fr]">
            {llm.isReady ? (
              <Card surface="primary" className="space-y-5 p-6">
                <div className="flex items-center justify-between gap-3"><div><p className="t-overline">Provider detectado automaticamente</p><p className="mt-1 text-xl font-semibold text-[color:var(--text)]">{llm.providerLabel}</p><p className="t-caption">{llm.model}</p></div><Badge tone="success">Conexão pronta</Badge></div>
                {providers.length > 1 ? (
                  <label className="block text-sm font-medium text-[color:var(--text)]">Provider desta execução
                    <select className="mt-2 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2" value={provider ?? ''} onChange={(event) => setProvider(event.target.value)}>
                      {providers.map((item) => <option key={item} value={item}>{item === llm.provider ? `${llm.providerLabel} · padrão global` : item}</option>)}
                    </select>
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-3"><Button variant="primary" onClick={() => void generate('llm')}>Continuar com {llm.providerLabel}</Button><Button variant="secondary" onClick={() => llm.openProviderSettings()}>Trocar provider</Button><Button variant="ghost" onClick={onClose}>Cancelar</Button></div>
              </Card>
            ) : (
              <Card className="space-y-4 border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] p-6">
                <div className="flex gap-3"><AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" /><div><h3 className="font-semibold text-[color:var(--text)]">Modo Offline</h3><p className="mt-1 t-body text-[color:var(--muted)]">Nenhum provider válido está configurado. O motor determinístico será identificado claramente e não será apresentado como IA.</p></div></div>
                <div className="flex flex-wrap gap-3"><Button variant="primary" onClick={() => llm.openProviderSettings()}>Conectar IA</Button><Button variant="secondary" onClick={() => void generate('deterministic')}>Continuar Offline</Button><Button variant="ghost" onClick={onClose}>Cancelar</Button></div>
              </Card>
            )}
            <Card className="p-6"><p className="t-overline">Esta execução irá</p><ul className="mt-4 space-y-3 text-sm text-[color:var(--muted)]">{['Reanalisar o PromptMaster', 'Revisar a arquitetura', 'Calcular trade-offs', 'Revisar riscos', 'Criar uma nova versão sem substituir a atual'].map((item) => <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[color:var(--success)]" />{item}</li>)}</ul><p className="mt-5 t-caption">Workspace: <strong className="text-[color:var(--text)]">{room.workspace_id || 'Enterprise'}</strong></p></Card>
          </div>
        ) : null}

        {phase === 'processing' ? (
          <div className="grid gap-6 p-6 lg:grid-cols-[.72fr_1.28fr]">
            <div className="space-y-4">
              <Card className="p-5"><div className="flex items-center justify-between"><span className="font-semibold">Architect AI</span><span className="t-mono text-sm">{elapsed}s</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--border)]"><div className="h-full bg-[image:var(--accent-gradient)] transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 t-caption">{progress}% · {llm.model ?? 'Motor determinístico'}</p></Card>
              <ol className="space-y-2">{STEPS.map((step, index) => { const threshold = [8,18,24,38,54,70,94,100][index]; const done = progress >= threshold; const active = !done && (index === 0 || progress >= [0,8,18,24,38,54,70,94][index]); return <li key={step} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 text-sm">{done ? <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" /> : active ? <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" /> : <span className="h-4 w-4 rounded-full border border-[color:var(--border)]" />}{step}</li>; })}</ol>
              <Button variant="ghost" onClick={() => void cancelGeneration()}>Cancelar execução</Button>
            </div>
            <Card className="min-h-[480px] p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Arquitetura sendo construída</h3><Badge tone="accent">Streaming</Badge></div>{streamed.length ? <div className="mt-4 space-y-3">{streamed.map((decision) => <div key={decision.area} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4"><p className="t-overline">{decision.area}</p><p className="mt-1 font-semibold text-[color:var(--text)]">{decision.choice}</p><p className="mt-1 t-caption">{decision.justification}</p>{decision.tradeoffs?.length ? <p className="mt-2 text-xs text-[color:var(--muted)]">Trade-offs: {decision.tradeoffs.join(' · ')}</p> : null}</div>)}</div> : <div className="grid min-h-[380px] place-items-center text-center"><div><Loader2 className="mx-auto h-8 w-8 animate-spin text-[color:var(--accent)]" /><p className="mt-3 text-sm text-[color:var(--muted)]">Aguardando os primeiros blocos do provider…</p></div></div>}</Card>
          </div>
        ) : null}

        {phase === 'comparison' && generated ? <div className="p-6"><BlueprintComparison before={before} after={generated} /><div className="mt-6 flex justify-end"><Button variant="primary" onClick={() => setPhase('complete')}>Revisar conclusão</Button></div></div> : null}
        {phase === 'complete' && result && generated ? <Completion room={result} blueprint={generated} elapsed={elapsed} onClose={onClose} /> : null}
        {phase === 'error' ? <div className="p-8"><Card className="mx-auto max-w-2xl space-y-4 border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] p-6"><AlertTriangle className="h-7 w-7 text-[color:var(--danger)]" /><h3 className="t-h3">A geração não foi concluída</h3><p className="t-body text-[color:var(--muted)]">{error}</p><div className="flex gap-3"><Button variant="primary" onClick={() => setPhase('confirm')}><RotateCcw className="h-4 w-4" />Tentar novamente</Button><Button variant="ghost" onClick={onClose}>Voltar ao Blueprint atual</Button></div></Card></div> : null}
      </div>
    </div>
  ), document.body);
}

export function BlueprintComparison({ before, after }: { readonly before: ArchitectureBlueprint | null; readonly after: ArchitectureBlueprint }) {
  const rows = useMemo(() => {
    const old = new Map((before?.decisions ?? []).map((item) => [item.area, item]));
    return after.decisions.map((item) => ({ before: old.get(item.area), after: item, changed: old.get(item.area)?.choice !== item.choice }));
  }, [after, before]);
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="t-overline">Blueprint atual vs Blueprint IA</p><h3 className="mt-1 t-h2">{rows.filter((row) => row.changed).length} mudanças arquiteturais</h3></div><GitCompare className="h-7 w-7 text-[color:var(--accent)]" /></div><div className="space-y-3">{rows.map((row) => <Card key={row.after.area} className="p-5"><div className="flex items-center justify-between"><p className="t-overline">{row.after.area}</p><Badge tone={row.changed ? 'accent' : 'neutral'}>{row.changed ? 'Alterado' : 'Mantido'}</Badge></div><div className="mt-3 grid gap-3 md:grid-cols-2"><Diff label="Antes" value={row.before?.choice ?? 'Não definido'} /><Diff label="Depois" value={row.after.choice} /></div><dl className="mt-4 grid gap-3 text-sm md:grid-cols-2"><div><dt className="font-semibold">Por que mudou</dt><dd className="mt-1 text-[color:var(--muted)]">{row.after.justification}</dd></div><div><dt className="font-semibold">Impacto</dt><dd className="mt-1 text-[color:var(--muted)]">{row.after.impact || 'Impacto contido na área.'}</dd></div><div><dt className="font-semibold">Benefício</dt><dd className="mt-1 text-[color:var(--muted)]">{row.after.maintainability_impact || row.after.scalability_impact || 'Decisão alinhada aos requisitos.'}</dd></div><div><dt className="font-semibold">Trade-off</dt><dd className="mt-1 text-[color:var(--muted)]">{row.after.tradeoffs?.join(' · ') || 'Nenhum trade-off adicional declarado.'}</dd></div></dl></Card>)}</div></div>;
}

function Diff({ label, value }: { readonly label: string; readonly value: string }) { return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3"><p className="t-overline">{label}</p><p className="mt-1 font-semibold text-[color:var(--text)]">{value}</p></div>; }

function Completion({ room, blueprint, elapsed, onClose }: { readonly room: ProjectRoom; readonly blueprint: ArchitectureBlueprint; readonly elapsed: number; readonly onClose: () => void }) {
  const version = room.active_blueprint_version ?? room.blueprint_versions.at(-1)?.version ?? 1;
  const tokens = Object.values(blueprint.tokens).reduce((sum, value) => sum + value, 0);
  const risks = blueprint.decisions.reduce((sum, item) => sum + (item.risks?.length ?? 0), 0);
  const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${room.title}-blueprint-v${version}.json`; anchor.click(); URL.revokeObjectURL(url); };
  return <div className="p-6"><Card surface="primary" className="p-7"><CheckCircle2 className="h-9 w-9 text-[color:var(--success)]" /><h3 className="mt-4 t-h2">Blueprint gerado com sucesso</h3><p className="mt-1 t-body text-[color:var(--muted)]">Versão v{version} preservada no histórico e pronta para revisão.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[['Provider', blueprint.providerLabel], ['Tempo', `${Math.max(elapsed, Math.round(blueprint.latencyMs / 1000))}s`], ['Tokens', blueprint.tokensUsed.toLocaleString()], ['Score', `${Math.round(blueprint.confidence * 100)}%`], ['Decisões', String(blueprint.decisions.length)], ['Riscos', String(risks)]].map(([label,value]) => <Diff key={label} label={label} value={value} />)}</div><div className="mt-7 flex flex-wrap gap-3"><Button variant="secondary" onClick={onClose}>Editar Blueprint</Button><Link href={`/engineering-review?projectId=${room.room_id}`}><Button variant="primary">Abrir Engineering Review</Button></Link><Button variant="secondary" onClick={download}><Download className="h-4 w-4" />Exportar Blueprint</Button><Button variant="ghost" onClick={() => window.print()}>Baixar PDF</Button></div></Card></div>;
}

export function BlueprintVersionHistory({ room, onRoom }: { readonly room: ProjectRoom; readonly onRoom: (room: ProjectRoom) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [comparison, setComparison] = useState<{ before: ArchitectureBlueprint; after: ArchitectureBlueprint } | null>(null);
  const versions = [...(room.blueprint_versions ?? [])].reverse();
  if (!versions.length) return null;
  async function mutate(version: number, action: 'restore' | 'duplicate' | 'delete') { setBusy(version); try { const updated = action === 'restore' ? await projectRoomsClient.restoreBlueprintVersion(room.room_id, version) : action === 'duplicate' ? await projectRoomsClient.duplicateBlueprintVersion(room.room_id, version) : await projectRoomsClient.deleteBlueprintVersion(room.room_id, version); onRoom(updated); } finally { setBusy(null); } }
  function compare(item: BlueprintVersion) {
    const active = versions.find((candidate) => candidate.version === room.active_blueprint_version) ?? versions[0];
    const base = item.version === active.version ? versions.find((candidate) => candidate.version === item.base_version) ?? versions[1] : item;
    if (base && active) setComparison({ before: base.blueprint, after: active.blueprint });
  }
  return <Card className="p-6"><div className="flex items-center gap-2"><History className="h-5 w-5 text-[color:var(--accent)]" /><h2 className="t-h3">Histórico de Blueprints</h2></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="border-b border-[color:var(--border)] text-[color:var(--muted-2)]"><tr>{['Versão','Provider / modelo','Data','Tempo','Tokens','Score','Hash','Ações'].map((item) => <th key={item} className="px-3 py-2 font-medium">{item}</th>)}</tr></thead><tbody>{versions.map((item) => <VersionRow key={item.id} item={item} active={item.version === room.active_blueprint_version} busy={busy === item.version} onAction={mutate} onCompare={compare} canDelete={versions.length > 1} />)}</tbody></table></div>{comparison ? <div className="mt-8 border-t border-[color:var(--border)] pt-6"><BlueprintComparison before={comparison.before} after={comparison.after} /></div> : null}</Card>;
}

export function WorkflowTimeline({ room }: { readonly room: ProjectRoom }) {
  const entries = [...(room.operational_log ?? [])].slice(-12).reverse();
  if (!entries.length) return null;
  return <Card className="p-6"><div className="flex items-center gap-2"><ClockIcon /><h2 className="t-h3">Timeline do workflow</h2></div><ol className="mt-5 space-y-0">{entries.map((entry, index) => <li key={entry.id} className="grid grid-cols-[64px_20px_1fr] gap-2"><time className="pt-0.5 font-mono text-xs text-[color:var(--muted-2)]">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div className="flex flex-col items-center"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${entry.status === 'failed' ? 'bg-[color:var(--danger)]' : entry.status === 'running' ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--success)]'}`} />{index < entries.length - 1 ? <span className="min-h-8 w-px flex-1 bg-[color:var(--border)]" /> : null}</div><div className="pb-4"><p className="text-sm font-semibold text-[color:var(--text)]">{entry.message}</p>{entry.detail ? <p className="t-caption">{entry.detail}</p> : null}</div></li>)}</ol></Card>;
}

function ClockIcon() { return <span className="grid h-7 w-7 place-items-center rounded-full border border-[color:var(--border)] text-xs text-[color:var(--accent)]">●</span>; }

function VersionRow({ item, active, busy, onAction, onCompare, canDelete }: { readonly item: BlueprintVersion; readonly active: boolean; readonly busy: boolean; readonly onAction: (version: number, action: 'restore' | 'duplicate' | 'delete') => void; readonly onCompare: (item: BlueprintVersion) => void; readonly canDelete: boolean }) {
  const total = Object.values(item.tokens).reduce((sum, value) => sum + value, 0);
  return <tr className="border-b border-[color:var(--border)] last:border-0"><td className="px-3 py-3"><span className="font-semibold">v{item.version}</span>{active ? <Badge tone="success" className="ml-2">Atual</Badge> : null}</td><td className="px-3 py-3"><p>{item.providerLabel}</p><p className="t-caption">{item.model || 'offline'}</p></td><td className="px-3 py-3">{new Date(item.generated_at).toLocaleString()}</td><td className="px-3 py-3">{Math.round(item.generation_time_ms / 1000)}s</td><td className="px-3 py-3">{total.toLocaleString()}</td><td className="px-3 py-3">{item.score}%</td><td className="px-3 py-3 font-mono text-xs" title={item.hash}>{item.hash.slice(0, 10)}</td><td className="px-3 py-3"><div className="flex gap-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Button variant="ghost" className="h-8 px-2" disabled={active && !item.base_version} onClick={() => onCompare(item)}><GitCompare className="h-3.5 w-3.5" />Comparar</Button><Button variant="ghost" className="h-8 px-2" disabled={active} onClick={() => onAction(item.version, 'restore')}><RotateCcw className="h-3.5 w-3.5" />Restaurar</Button><Button variant="ghost" className="h-8 px-2" onClick={() => onAction(item.version, 'duplicate')}><Copy className="h-3.5 w-3.5" />Duplicar</Button><Button variant="ghost" className="h-8 px-2" disabled={!canDelete} onClick={() => onAction(item.version, 'delete')}><Trash2 className="h-3.5 w-3.5" /></Button></>}</div></td></tr>;
}
