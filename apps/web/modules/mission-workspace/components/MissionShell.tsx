'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Menu, PanelRightClose, PanelRightOpen, ShieldAlert, Sparkles, X } from 'lucide-react';
import { LlmConfirmationGate } from '@/components/llm/llm-confirmation-gate';
import { MissionEngine } from '../engine/MissionEngine';
import { useMissionStore } from '../stores/missionStore';
import { coerceToStringArray } from '../types';
import type { MissionFieldDefinition, MissionStepDefinition } from '../types';

export function MissionShell({ missionId }: { missionId: string }) {
  const store = useMissionStore();
  const [mobilePanel, setMobilePanel] = useState<'journey' | 'context' | null>(null);
  const loadMission = useMissionStore((state) => state.loadMission);
  const flushAutosave = useMissionStore((state) => state.flushAutosave);
  useEffect(() => { void loadMission(missionId); return () => { void flushAutosave(); }; }, [flushAutosave, loadMission, missionId]);
  const mission = store.activeMission;
  const genome = store.activeGenome;
  const activeSteps = useMemo(() => mission && genome ? MissionEngine.resolveActiveSteps(genome, mission.context) : [], [mission, genome]);
  const step = activeSteps.find((item) => item.id === mission?.journey.currentStepId) ?? activeSteps[0];
  if (store.loading && !mission) return <div className="flex items-center gap-2 p-8 text-[color:var(--muted)]"><Loader2 className="h-4 w-4 animate-spin"/>Carregando missão…</div>;
  if (!mission || !genome || !step) return <div className="p-8 text-[color:var(--danger)]">{store.error ?? 'Missão não encontrada.'}</div>;
  return <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[color:var(--bg)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3"><div className="flex items-center gap-3"><Link href="/wizard" aria-label="Voltar"><ArrowLeft className="h-5 w-5"/></Link><div><h1 className="font-semibold text-[color:var(--text)]">{mission.title || genome.title}</h1><p className="text-xs text-[color:var(--muted)]">{genome.title} · modo {mission.mode}</p></div></div><div className="flex items-center gap-2 text-xs text-[color:var(--muted)]"><button className="rounded-lg border border-[color:var(--border)] p-2 lg:hidden" onClick={() => setMobilePanel('journey')} aria-label="Abrir jornada"><Menu className="h-4 w-4"/></button><span aria-live="polite">{store.saveStatus === 'saving' ? 'Salvando…' : store.saveStatus === 'error' ? 'Erro ao salvar' : store.lastSavedAt ? 'Progresso salvo' : 'Autosave ativo'}</span><button className="rounded-lg border border-[color:var(--border)] p-2 lg:hidden" onClick={() => setMobilePanel('context')} aria-label="Abrir contexto"><PanelRightOpen className="h-4 w-4"/></button></div></header>
    {store.error ? <div role="alert" className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{store.error}</div> : null}
    <div className={`grid flex-1 ${store.leftPanelCollapsed && store.rightPanelCollapsed ? 'lg:grid-cols-[3.5rem_1fr_3.5rem]' : store.leftPanelCollapsed ? 'lg:grid-cols-[3.5rem_1fr_18rem]' : store.rightPanelCollapsed ? 'lg:grid-cols-[14rem_1fr_3.5rem]' : 'lg:grid-cols-[14rem_minmax(0,1fr)_18rem]'}`}>
      <aside className="hidden border-r border-[color:var(--border)] lg:block"><Journey steps={activeSteps} collapsed={store.leftPanelCollapsed}/></aside>
      <main className="min-w-0 overflow-y-auto p-5 lg:p-8"><MissionStep step={step} isLastStep={activeSteps.at(-1)?.id === step.id}/></main>
      <aside className="hidden border-l border-[color:var(--border)] lg:block"><ContextPanel collapsed={store.rightPanelCollapsed}/></aside>
    </div>
    {mobilePanel ? <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobilePanel(null)}><aside role="dialog" aria-modal="true" className={`h-full w-[min(88vw,22rem)] bg-[color:var(--bg)] p-4 ${mobilePanel === 'context' ? 'ml-auto' : ''}`} onClick={(event) => event.stopPropagation()}><button className="mb-4 ml-auto block" onClick={() => setMobilePanel(null)} aria-label="Fechar"><X/></button>{mobilePanel === 'journey' ? <Journey steps={activeSteps}/> : <ContextPanel/>}</aside></div> : null}
    {store.pendingSuggestion ? <SuggestionModal/> : null}
    {store.pendingImpact ? <ImpactModal/> : null}
    {store.pendingArtifacts ? <ArtifactsReviewModal/> : null}
  </div>;
}

function Journey({ steps, collapsed = false }: { steps: readonly MissionStepDefinition[]; collapsed?: boolean }) {
  const { activeMission, goToStep, toggleLeftPanel } = useMissionStore();
  return <div className="p-3"><button onClick={toggleLeftPanel} className="mb-4 hidden w-full justify-end text-[color:var(--muted)] lg:flex" aria-label="Recolher jornada">{collapsed ? <ChevronRight/> : <ChevronLeft/>}</button>{!collapsed ? <><div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[color:var(--accent)]" style={{ width: `${activeMission?.journey.progress ?? 0}%` }}/></div><ol className="space-y-1">{steps.map((step, index) => { const state = activeMission?.journey.steps.find((item) => item.definitionId === step.id); return <li key={step.id}><button onClick={() => goToStep(step.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${state?.status === 'active' ? 'bg-white/10 text-[color:var(--text)]' : 'text-[color:var(--muted)] hover:bg-white/5'}`}><span className="mr-2 opacity-60">{index + 1}</span>{step.title}</button></li>; })}</ol></> : <ol className="space-y-2">{steps.map((step, index) => <li key={step.id}><button title={step.title} onClick={() => goToStep(step.id)} className="h-8 w-8 rounded-lg border border-[color:var(--border)] text-xs">{index + 1}</button></li>)}</ol>}</div>;
}

function MissionStep({ step, isLastStep }: { step: MissionStepDefinition; isLastStep: boolean }) {
  const { activeMission, advanceStep, previewArtifacts, loading } = useMissionStore();
  const [showGate, setShowGate] = useState(false);
  return <section className="mx-auto max-w-3xl"><div className="mb-7"><p className="ds-caption text-[color:var(--accent)]">ETAPA ATUAL</p><h2 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{step.title}</h2><p className="mt-2 text-sm text-[color:var(--muted)]">{step.description}</p></div><div className="space-y-6">{step.fields.map((field) => <MissionField key={field.id} step={step} field={field} value={activeMission?.context.answers[`${step.id}.${field.id}`]}/>)}</div>
    {isLastStep ? (
      // There is no next step to advance to here -- advanceStep() would just
      // recompute the journey onto the same step, which reads as "the button
      // does nothing". The real action on the final step is generating the
      // deliverables (same flow as the "Gerar entregáveis" button in the
      // context panel) -- always as a draft the user reviews, never
      // auto-saved (see ArtifactsReviewModal).
      showGate ? <div className="mt-8"><LlmConfirmationGate capability="mission_report" usageLabel="Gerar entregáveis" compact onConfirmed={async ({ mode, model }) => { if (mode !== 'llm' || !model) return; setShowGate(false); await previewArtifacts({ useUserKey: true, userModelChoice: model, hasValidatedUserKey: true }); }}/></div>
        : <button disabled={loading} onClick={() => setShowGate(true)} className="mt-8 rounded-xl bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-white">Gerar entregáveis</button>
    ) : <button onClick={() => advanceStep()} className="mt-8 rounded-xl bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-white">Validar e continuar</button>}
  </section>;
}

function MissionField({ step, field, value }: { step: MissionStepDefinition; field: MissionFieldDefinition; value: unknown }) {
  const { updateAnswer, executeFieldAction, aiLoading } = useMissionStore();
  const [actionId, setActionId] = useState<string | null>(null);
  const key = `${step.id}.${field.id}`;
  const common = { id: key, value: typeof value === 'string' || typeof value === 'number' ? value : '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => updateAnswer(step.id, field.id, event.target.value), className: 'focus-ring w-full rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-2.5 text-sm text-[color:var(--text)]' };
  return <div><label htmlFor={key} className="mb-1.5 block text-sm font-medium text-[color:var(--text)]">{field.label}{field.required ? <span className="ml-1 text-red-400">*</span> : null}</label>{field.description ? <p className="mb-2 text-xs text-[color:var(--muted)]">{field.description}</p> : null}
    {field.type === 'select' ? <select {...common}><option value="">Selecione…</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>
      : field.type === 'toggle' ? <input id={key} type="checkbox" checked={value === true} onChange={(e) => updateAnswer(step.id, field.id, e.target.checked)}/>
      : field.type === 'chips' ? <ChipsInput id={key} value={coerceToStringArray(value)} onChange={(next) => updateAnswer(step.id, field.id, next)} placeholder={field.placeholder}/>
      : field.type === 'multiselect' ? <MultiselectInput id={key} options={field.options ?? []} value={coerceToStringArray(value)} onChange={(next) => updateAnswer(step.id, field.id, next)}/>
      : <textarea {...common} rows={field.type === 'text' || field.type === 'number' ? 2 : field.type === 'code' ? 10 : 5} placeholder={field.placeholder}/>}
    {field.aiActions.length ? <div className="mt-2 flex flex-wrap gap-2">{field.aiActions.map((action) => <button key={action.id} disabled={aiLoading[field.id]} onClick={() => setActionId(action.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] px-2.5 py-1.5 text-xs text-[color:var(--muted)] hover:text-[color:var(--text)]"><Sparkles className="h-3.5 w-3.5"/>{action.label}</button>)}</div> : null}
    {actionId ? <div className="mt-3"><LlmConfirmationGate capability="mission_field_action" usageLabel={field.aiActions.find((item) => item.id === actionId)?.label ?? 'Ação de IA'} compact onConfirmed={async ({ mode, model }) => { if (mode !== 'llm' || !model) return; const selected = actionId; setActionId(null); await executeFieldAction(step.id, field.id, selected, { useUserKey: true, userModelChoice: model, hasValidatedUserKey: true }); }}/></div> : null}
  </div>;
}

/** Tag-style input for `chips` fields -- stores `string[]`, never the raw
 * text a plain textarea would produce (see coerceToStringArray callers:
 * without this, "architecture.modules" ends up a string and every rule
 * that does `.some()`/`.map()` on it crashes the mission). */
function ChipsInput({ id, value, onChange, placeholder }: { id: string; value: readonly string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft('');
  };
  return <div className="focus-within:ring-2 focus-within:ring-[color:var(--accent)] rounded-xl border border-[color:var(--border)] bg-white/5 px-3 py-2.5">
    {value.length ? <div className="mb-2 flex flex-wrap gap-1.5">{value.map((chip) => <span key={chip} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-[color:var(--text)]">{chip}<button type="button" onClick={() => onChange(value.filter((item) => item !== chip))} aria-label={`Remover ${chip}`} className="text-[color:var(--muted)] hover:text-[color:var(--text)]"><X className="h-3 w-3"/></button></span>)}</div> : null}
    <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } else if (e.key === 'Backspace' && !draft && value.length) { onChange(value.slice(0, -1)); } }}
      onBlur={commit} placeholder={placeholder ?? 'Digite e pressione Enter'}
      className="w-full bg-transparent text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"/>
  </div>;
}

/** Checkbox-pill picker for `multiselect` fields -- same `string[]` storage
 * as ChipsInput, but constrained to the field's declared options. */
function MultiselectInput({ id, options, value, onChange }: { id: string; options: readonly string[]; value: readonly string[]; onChange: (next: string[]) => void }) {
  return <div id={id} className="flex flex-wrap gap-2">{options.map((option) => { const checked = value.includes(option); return <label key={option} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs ${checked ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--text)]' : 'border-[color:var(--border)] text-[color:var(--muted)]'}`}><input type="checkbox" className="sr-only" checked={checked} onChange={() => onChange(checked ? value.filter((item) => item !== option) : [...value, option])}/>{option}</label>; })}</div>;
}

function ContextPanel({ collapsed = false }: { collapsed?: boolean }) {
  const { activeMission, activeGenome, toggleRightPanel, previewArtifacts, loading } = useMissionStore();
  const [showGate, setShowGate] = useState(false);
  if (collapsed) return <button onClick={toggleRightPanel} className="m-3" aria-label="Abrir contexto"><PanelRightOpen/></button>;
  return <div className="space-y-5 p-4"><button onClick={toggleRightPanel} className="hidden w-full justify-start text-[color:var(--muted)] lg:flex" aria-label="Recolher contexto"><PanelRightClose/></button><section><h3 className="text-sm font-semibold text-[color:var(--text)]">Blueprint em tempo real</h3><dl className="mt-3 space-y-2 text-xs text-[color:var(--muted)]"><div className="flex justify-between"><dt>Respostas</dt><dd>{Object.keys(activeMission?.context.answers ?? {}).length}</dd></div><div className="flex justify-between"><dt>Riscos ativos</dt><dd>{activeMission?.context.risks.filter((risk) => !risk.dismissed).length}</dd></div><div className="flex justify-between"><dt>Lacunas abertas</dt><dd>{activeMission?.context.gaps.filter((gap) => gap.status === 'open').length}</dd></div></dl></section><section><h3 className="text-sm font-semibold text-[color:var(--text)]">Especialistas</h3><div className="mt-2 flex flex-wrap gap-1">{activeGenome?.specialists.map((role) => <span key={role} className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-[color:var(--muted)]">{role.replaceAll('_', ' ')}</span>)}</div></section>{activeMission?.context.risks.filter((risk) => !risk.dismissed).map((risk) => <div key={risk.id} className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs"><ShieldAlert className="mb-2 h-4 w-4 text-amber-300"/><strong>{risk.title}</strong><p className="mt-1 text-[color:var(--muted)]">{risk.suggestedAction}</p></div>)}<section><h3 className="text-sm font-semibold">Conhecimento contextual</h3><ul className="mt-2 space-y-1 text-xs text-[color:var(--muted)]">{activeGenome?.knowledgeTopics.map((topic) => <li key={topic}>{topic.replaceAll('_', ' ')}</li>)}</ul></section>{showGate ? <LlmConfirmationGate capability="mission_report" usageLabel="Gerar artefatos" compact onConfirmed={async ({ mode, model }) => { if (mode !== 'llm' || !model) return; setShowGate(false); await previewArtifacts({ useUserKey: true, userModelChoice: model, hasValidatedUserKey: true }); }}/> : <button disabled={loading} onClick={() => setShowGate(true)} className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs">Gerar entregáveis</button>}</div>;
}

function SuggestionModal() {
  const { pendingSuggestion: suggestion, acceptSuggestion, modifySuggestion, rejectSuggestion } = useMissionStore();
  const [draft, setDraft] = useState(suggestion?.proposed ?? '');
  const [reason, setReason] = useState('');
  if (!suggestion) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="suggestion-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] p-6"><h2 id="suggestion-title" className="text-lg font-semibold">Sugestão da IA · {suggestion.specialist.replaceAll('_', ' ')}</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><div><p className="ds-caption mb-2 text-[color:var(--muted)]">ATUAL</p><pre className="min-h-28 whitespace-pre-wrap rounded-xl bg-white/5 p-3 text-xs">{String(suggestion.current ?? 'Vazio')}</pre></div><div><p className="ds-caption mb-2 text-[color:var(--muted)]">SUGESTÃO</p><textarea value={draft} onChange={(e) => { setDraft(e.target.value); modifySuggestion(e.target.value); }} rows={8} className="w-full rounded-xl border border-[color:var(--border)] bg-white/5 p-3 text-xs"/></div></div><div className="mt-4 rounded-xl bg-white/5 p-3 text-sm"><strong>Por quê:</strong> {suggestion.reason}<br/><strong>Impacto:</strong> {suggestion.impact}</div><label className="mt-4 block text-xs text-[color:var(--muted)]">Motivo da rejeição (opcional)<input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-transparent p-2"/></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => rejectSuggestion(reason)} className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm">Rejeitar</button><button onClick={acceptSuggestion} className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white">Aceitar alteração</button></div></div></div>;
}

/** Every "Gerar entregáveis" click lands here first -- one staged LLM call
 * per artifact (see mission_artifact_engine.py's draft_artifact), all using
 * the mission's full answer context, complementing gaps explicitly marked
 * as such. Nothing is written to the mission's real artifacts until the
 * user reviews (and can edit) every draft and clicks "Aceitar e salvar" --
 * confirmArtifacts() is the only thing that persists. */
function ArtifactsReviewModal() {
  const { pendingArtifacts, artifactsDegraded, loading, editPendingArtifact, confirmArtifacts, cancelArtifactsPreview } = useMissionStore();
  const [activeIndex, setActiveIndex] = useState(0);
  if (!pendingArtifacts || pendingArtifacts.length === 0) return null;
  const active = pendingArtifacts[Math.min(activeIndex, pendingArtifacts.length - 1)];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="artifacts-review-title" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)]">
    <div className="border-b border-[color:var(--border)] p-6 pb-4">
      <h2 id="artifacts-review-title" className="text-lg font-semibold text-[color:var(--text)]">Revisar entregáveis gerados</h2>
      <p className="mt-1 text-sm text-[color:var(--muted)]">Nada foi salvo ainda. Revise (e edite se quiser) cada artefato antes de aceitar.</p>
      {artifactsDegraded ? <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">Pelo menos um artefato foi gerado em modo degradado (nenhum LLM real respondeu) -- revise com atenção antes de aceitar.</p> : null}
    </div>
    <div className="flex flex-1 overflow-hidden">
      <nav className="w-48 shrink-0 overflow-y-auto border-r border-[color:var(--border)] p-3">
        <ul className="space-y-1">{pendingArtifacts.map((draft, index) => <li key={`${draft.type}_${index}`}><button onClick={() => setActiveIndex(index)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${index === activeIndex ? 'bg-white/10 text-[color:var(--text)]' : 'text-[color:var(--muted)] hover:bg-white/5'}`}>{draft.title}{draft.degraded ? <span className="ml-1.5 text-amber-300">●</span> : null}</button></li>)}</ul>
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        <label htmlFor="artifact-draft-content" className="mb-2 block text-sm font-medium text-[color:var(--text)]">{active.title}</label>
        <textarea id="artifact-draft-content" value={active.content} onChange={(event) => editPendingArtifact(pendingArtifacts.indexOf(active), event.target.value)} rows={18} className="focus-ring w-full rounded-xl border border-[color:var(--border)] bg-white/5 p-3 font-mono text-xs text-[color:var(--text)]"/>
      </div>
    </div>
    <div className="flex justify-end gap-2 border-t border-[color:var(--border)] p-6 pt-4">
      <button onClick={cancelArtifactsPreview} className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm">Cancelar</button>
      <button disabled={loading} onClick={() => void confirmArtifacts()} className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white">Aceitar e salvar</button>
    </div>
  </div></div>;
}

function ImpactModal() {
  const { pendingImpact, confirmImpact, cancelImpact } = useMissionStore();
  if (!pendingImpact) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="alertdialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] p-6"><h2 className="text-lg font-semibold">Revisar impacto da alteração</h2><p className="mt-2 text-sm text-[color:var(--muted)]">{pendingImpact.analysis.message}</p><ul className="mt-4 space-y-2">{pendingImpact.analysis.impactedSteps.map((impact) => <li key={impact.stepId} className="rounded-lg bg-white/5 p-3 text-xs"><strong>{impact.stepId}</strong><p className="mt-1 text-[color:var(--muted)]">{impact.reason}</p></li>)}</ul><div className="mt-5 flex justify-end gap-2"><button onClick={cancelImpact} className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-sm">Manter estado atual</button><button onClick={confirmImpact} className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white">Aplicar e revisar etapas</button></div></div></div>;
}
