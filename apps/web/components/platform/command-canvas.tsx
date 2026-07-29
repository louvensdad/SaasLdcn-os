'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Circle, Factory, Focus, Network, SearchCheck, Sparkles } from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';
import { useProjects } from '@/hooks/use-projects';
import { useSystemStatus } from '@/hooks/use-system-status';
import { cn } from '@/lib/cn';

const STEPS = [
  { id: 'intent', href: '/project-rooms', icon: Sparkles },
  { id: 'architecture', href: '/architect', icon: Network },
  { id: 'review', href: '/engineering-review', icon: SearchCheck },
  { id: 'build', href: '/meta-factory', icon: Factory },
] as const;

const COPY = {
  'pt-BR': {
    eyebrow: 'FOCO OPERACIONAL', title: 'Uma decisão por vez.', subtitle: 'O canvas lê o estado real da plataforma e reduz toda a complexidade ao próximo movimento verificável.',
    completed: 'Concluída', live: 'Contexto ao vivo', project: 'Projeto em foco', noProject: 'Nenhum projeto ainda', systems: 'motores ativos', projects: 'projetos', choose: 'Escolha uma etapa', continue: 'Continuar daqui', start: 'Começar agora',
    intent: ['Intenção', 'Defina o problema', 'Uma conversa estruturada vira PromptMaster.md.'], architecture: ['Arquitetura', 'Desenhe o sistema', 'Decisões técnicas viram um Blueprint justificável.'], review: ['Revisão', 'Questione as decisões', 'Riscos, lacunas e trade-offs ficam explícitos.'], build: ['Construção', 'Materialize o produto', 'Agentes, build e gates produzem artefatos verificáveis.'],
  },
  'en-US': {
    eyebrow: 'OPERATIONAL FOCUS', title: 'One decision at a time.', subtitle: 'The canvas reads the platform’s real state and reduces complexity to the next verifiable move.',
    completed: 'Completed', live: 'Live context', project: 'Project in focus', noProject: 'No projects yet', systems: 'active engines', projects: 'projects', choose: 'Choose a stage', continue: 'Continue from here', start: 'Start now',
    intent: ['Intent', 'Define the problem', 'A structured conversation becomes PromptMaster.md.'], architecture: ['Architecture', 'Design the system', 'Technical decisions become a defensible Blueprint.'], review: ['Review', 'Challenge decisions', 'Risks, gaps and trade-offs become explicit.'], build: ['Build', 'Materialize the product', 'Skills, builds and gates produce verifiable artifacts.'],
  },
  'es-ES': {
    eyebrow: 'FOCO OPERATIVO', title: 'Una decisión a la vez.', subtitle: 'El canvas lee el estado real de la plataforma y reduce la complejidad al siguiente movimiento verificable.',
    completed: 'Completada', live: 'Contexto en vivo', project: 'Proyecto en foco', noProject: 'Todavía no hay proyectos', systems: 'motores activos', projects: 'proyectos', choose: 'Elige una etapa', continue: 'Continuar desde aquí', start: 'Empezar ahora',
    intent: ['Intención', 'Define el problema', 'Una conversación estructurada se convierte en PromptMaster.md.'], architecture: ['Arquitectura', 'Diseña el sistema', 'Las decisiones técnicas se convierten en un Blueprint justificable.'], review: ['Revisión', 'Cuestiona las decisiones', 'Los riesgos, vacíos y trade-offs quedan explícitos.'], build: ['Construcción', 'Materializa el producto', 'Skills, builds y gates producen artefactos verificables.'],
  },
  'fr-FR': {
    eyebrow: 'FOCUS OPÉRATIONNEL', title: 'Une décision à la fois.', subtitle: 'Le canvas lit l’état réel de la plateforme et réduit la complexité au prochain mouvement vérifiable.',
    completed: 'Terminée', live: 'Contexte en direct', project: 'Projet ciblé', noProject: 'Aucun projet pour le moment', systems: 'moteurs actifs', projects: 'projets', choose: 'Choisissez une étape', continue: 'Continuer ici', start: 'Commencer maintenant',
    intent: ['Intention', 'Définissez le problème', 'Une conversation structurée devient PromptMaster.md.'], architecture: ['Architecture', 'Concevez le système', 'Les décisions techniques deviennent un Blueprint défendable.'], review: ['Revue', 'Questionnez les décisions', 'Les risques, lacunes et compromis deviennent explicites.'], build: ['Construction', 'Matérialisez le produit', 'Les Skills, builds et gates produisent des artefacts vérifiables.'],
  },
} as const;

function stageFromStatus(status?: string): number {
  if (status === 'generated' || status === 'ready_for_generation' || status === 'generation_blocked') return 3;
  if (status === 'gatekeeper_approved') return 2;
  if (status === 'blueprint_ready') return 1;
  return 0;
}

export function CommandCanvas() {
  const { locale } = useLocale();
  const copy = COPY[locale] ?? COPY['pt-BR'];
  const projects = useProjects();
  const system = useSystemStatus();
  const activeProject = projects.data?.[0];
  const suggestedStage = stageFromStatus(activeProject?.status);
  const [selected, setSelected] = useState(suggestedStage);
  const step = STEPS[selected];
  const words = copy[step.id];
  const activeEngines = system.data?.active_engines.length;
  const projectCount = projects.data?.length;
  const completed = useMemo(() => STEPS.map((_, index) => index < suggestedStage), [suggestedStage]);

  return (
    <section className="relative isolate mb-8 overflow-hidden rounded-[calc(var(--radius-xl)+4px)] border border-[color:color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color:var(--surface-1)] shadow-[var(--shadow-3)]" aria-labelledby="command-canvas-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_34%),linear-gradient(115deg,transparent_0%,transparent_48%,color-mix(in_srgb,var(--accent)_7%,transparent)_49%,transparent_65%)]" aria-hidden="true" />
      <div className="relative grid min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex flex-col p-6 sm:p-9 lg:p-12">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <Focus className="h-4 w-4" aria-hidden="true" />
            <p className="ds-metadata font-semibold tracking-[0.22em]">{copy.eyebrow}</p>
          </div>
          <h1 id="command-canvas-title" className="mt-7 max-w-3xl text-balance text-[clamp(2.6rem,7vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-[color:var(--text)]">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty ds-body text-[color:var(--text-secondary)]">{copy.subtitle}</p>

          <div className="mt-auto pt-12">
            <p className="mb-4 ds-metadata text-[color:var(--muted)]">{copy.choose}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label={copy.choose}>
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const selectedNow = selected === index;
                return (
                  <button key={item.id} type="button" role="tab" aria-selected={selectedNow} onClick={() => setSelected(index)} className={cn('focus-ring group min-h-24 cursor-pointer rounded-[var(--radius-lg)] border p-4 text-left transition-[background-color,border-color,color] duration-200', selectedNow ? 'border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_13%,var(--surface-2))]' : 'border-[color:var(--border)] bg-[color:var(--surface-2)] hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border))]')}>
                    <span className="flex items-center justify-between">
                      <Icon className={cn('h-4 w-4', selectedNow ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted)]')} aria-hidden="true" />
                      {completed[index] ? <><Check className="h-4 w-4 text-[color:var(--success)]" aria-hidden="true" /><span className="sr-only">{copy.completed}</span></> : <Circle className="h-3 w-3 text-[color:var(--border-strong)]" aria-hidden="true" />}
                    </span>
                    <strong className="mt-5 block ds-body-sm text-[color:var(--text)]">{copy[item.id][0]}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="relative flex flex-col border-t border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--surface-2)_88%,transparent)] p-6 lg:border-l lg:border-t-0 lg:p-8" aria-live="polite">
          <span className="ds-metadata text-[color:var(--accent)]">0{selected + 1} / 04</span>
          <div className="mt-10">
            <p className="ds-metadata text-[color:var(--muted)]">{words[0]}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--text)]">{words[1]}</h2>
            <p className="mt-4 ds-body-sm leading-relaxed text-[color:var(--text-secondary)]">{words[2]}</p>
          </div>
          <Link href={step.href} className="focus-ring mt-8 inline-flex min-h-12 items-center justify-between rounded-[var(--radius-md)] bg-[color:var(--accent)] px-4 font-semibold text-white transition-opacity hover:opacity-90">
            {activeProject ? copy.continue : copy.start}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="mt-auto border-t border-[color:var(--border)] pt-6">
            <p className="ds-metadata text-[color:var(--muted)]">{copy.live}</p>
            <p className="mt-3 truncate ds-body-sm font-semibold text-[color:var(--text)]">{activeProject?.project_name ?? copy.noProject}</p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 ds-metadata text-[color:var(--text-secondary)]">
              <span>{activeEngines ?? '—'} {copy.systems}</span><span>{projectCount ?? '—'} {copy.projects}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
