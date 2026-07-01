'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { ArrowRight, Check, Factory, FlaskConical } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useLocale } from '@/hooks/use-locale';
import type { Project } from '@/lib/api/types';

function statusTone(status: string): BadgeTone {
  if (status === 'generated' || status === 'ready') return 'success';
  if (status === 'ready_with_warnings') return 'warning';
  if (status === 'blocked' || status === 'generation_blocked' || status === 'failed') return 'danger';
  return 'accent';
}

function format(value: string) {
  return value.replaceAll('_', ' ');
}

export function ProjectHero({ project }: { readonly project: Project }) {
  const { t } = useLocale();
  const tg = project.technology_graph;
  const gate = project.gatekeeper_snapshot?.decision;

  return (
    <Card surface="primary" className="glass noise relative overflow-hidden p-8">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%)] blur-3xl" />
      <div className="relative">
        <p className="t-overline">{t('projectHero.eyebrow')}</p>
        <h1 className="mt-3 t-h1 text-[color:var(--text)]">{project.project_name}</h1>
        <p className="mt-2 t-mono text-sm text-[color:var(--muted)]">
          {tg.language.name} · {tg.runtime.name} · {tg.framework.name} · {tg.architecture.name}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={statusTone(project.status)}>{t('projectHero.status')}: {format(project.status)}</Badge>
          <Badge tone={statusTone(project.readiness_status)}>{t('projectHero.readiness')}: {format(project.readiness_status)}</Badge>
          {gate ? <Badge tone={statusTone(gate)}>{t('projectHero.gatekeeper')}: {format(gate)}</Badge> : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/engineering-laboratory"><Button variant="primary"><FlaskConical className="h-4 w-4" />{t('projectHero.openLab')}</Button></Link>
          <Link href="/meta-factory"><Button variant="secondary"><Factory className="h-4 w-4" />{t('projectHero.openMetaFactory')}</Button></Link>
          <a href="#engineering-details"><Button variant="ghost">{t('projectHero.details')} <ArrowRight className="h-4 w-4" /></Button></a>
        </div>
      </div>
    </Card>
  );
}

const JOURNEY = ['idea', 'promptMaster', 'architect', 'review', 'metaFactory', 'lab', 'deploy'] as const;

export function ProjectJourney({ project }: { readonly project: Project }) {
  const { t } = useLocale();
  // Derived from REAL snapshot presence + status — not invented.
  const done = [
    true, // idea
    Boolean(project.prompt_master_snapshot),
    Boolean(project.blueprint_snapshot),
    Boolean(project.gatekeeper_snapshot),
    project.status === 'generated',
    false, // lab
    false, // deploy
  ];
  let reached = 0;
  for (const d of done) { if (!d) break; reached += 1; }

  return (
    <Card className="glass p-5">
      <ol className="flex flex-col gap-2 md:flex-row md:items-center" aria-label={t('projectJourney.title')}>
        {JOURNEY.map((key, index) => {
          const state = index < reached ? 'done' : index === reached ? 'current' : 'todo';
          return (
            <Fragment key={key}>
              <li className="flex items-center gap-2.5">
                <span className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  state === 'done' && 'accent-fill',
                  state === 'current' && 'border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-[color:var(--accent)]',
                  state === 'todo' && 'border border-[color:var(--border-strong)] text-[color:var(--muted-2)]',
                )}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                </span>
                <span className={cn('text-sm', state === 'todo' ? 'text-[color:var(--muted-2)]' : 'font-medium text-[color:var(--text)]')}>
                  {t(`projectJourney.${key}`)}
                </span>
              </li>
              {index < JOURNEY.length - 1 ? <li aria-hidden className="hidden h-px flex-1 bg-[color:var(--border)] md:block" /> : null}
            </Fragment>
          );
        })}
      </ol>
    </Card>
  );
}
