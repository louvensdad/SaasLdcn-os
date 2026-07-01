'use client';

import { Check } from 'lucide-react';
import { Fragment } from 'react';

import { cn } from '@/lib/cn';
import { useLocale } from '@/hooks/use-locale';
import { deriveJourney } from '@/lib/architecture-review/derive';
import type { ProjectRoomStatus } from '@contracts/project-room.contract';

/** Where the project sits in the journey, derived from the real room status:
 * Project Room → PromptMaster → Architect → Architecture Review → Meta-Factory. */
export function JourneyTimeline({ status }: { readonly status: ProjectRoomStatus }) {
  const { t } = useLocale();
  const steps = deriveJourney(status);

  return (
    <ol className="flex flex-col gap-2 md:flex-row md:items-center" aria-label={t('review.timeline.title')}>
      {steps.map((step, index) => (
        <Fragment key={step.key}>
          <li className="flex items-center gap-2.5">
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                step.state === 'done' && 'accent-fill',
                step.state === 'current' && 'border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-[color:var(--accent)]',
                step.state === 'todo' && 'border border-[color:var(--border-strong)] text-[color:var(--muted-2)]',
              )}
            >
              {step.state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span className={cn('text-sm', step.state === 'todo' ? 'text-[color:var(--muted-2)]' : 'font-medium text-[color:var(--text)]')}>
              {t(`review.timeline.${step.key}`)}
            </span>
          </li>
          {index < steps.length - 1 ? (
            <li aria-hidden className="hidden h-px flex-1 bg-[color:var(--border)] md:block" />
          ) : null}
        </Fragment>
      ))}
    </ol>
  );
}
