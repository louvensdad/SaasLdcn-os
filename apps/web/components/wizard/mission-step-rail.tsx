'use client';

import { Check, Circle } from 'lucide-react';

import type { MissionStepTopic } from '@contracts/mission.contract';

interface Props {
  readonly steps: MissionStepTopic[];
  readonly currentStepId: string | null | undefined;
}

export function MissionStepRail({ steps, currentStepId }: Props) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((step, index) => {
        const state = currentIndex < 0 ? 'pending' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
        return (
          <li
            key={step.id}
            className={`flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-sm ${
              state === 'current' ? 'bg-[color:var(--accent)]/10 text-[color:var(--accent)]' : 'text-[color:var(--muted)]'
            }`}
          >
            {state === 'done' ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--success)]" aria-hidden />
            ) : (
              <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${state === 'current' ? 'text-[color:var(--accent)]' : ''}`} aria-hidden />
            )}
            <span className={state === 'current' ? 'font-medium text-[color:var(--text)]' : ''}>{step.title}</span>
          </li>
        );
      })}
    </ol>
  );
}
