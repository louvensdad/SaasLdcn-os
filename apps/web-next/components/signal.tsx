'use client';

import { useI18n } from '@/lib/i18n/i18n';

/** The nine signal families of the design system: the shape carries the meaning, color only reinforces it. */
export type Family = 'proof' | 'pulse' | 'caution' | 'fault' | 'idle' | 'hand' | 'stop' | 'na' | 'unknown';

export const FAMILIES: readonly Family[] = ['proof', 'pulse', 'hand', 'caution', 'fault', 'stop', 'idle', 'na', 'unknown'];

export function Signal({ family, label, live, className }: {
  readonly family: Family;
  /** What the signal is about; the family word is appended for screen readers. */
  readonly label?: string;
  /** Only when an event stream is actually connected. */
  readonly live?: boolean;
  readonly className?: string;
}) {
  const { t } = useI18n();
  const word = t(`signal.${family}`);
  return (
    <svg className={`sig s-${family}${live ? ' is-spinning' : ''}${className ? ` ${className}` : ''}`} role="img" aria-label={label ? `${label}: ${word}` : word}>
      <use href={`#sig-${family}`} />
    </svg>
  );
}

export function Icon({ name, className = 'ico' }: { readonly name: string; readonly className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
