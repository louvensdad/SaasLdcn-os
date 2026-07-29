import type { DetailsHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface DisclosureProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  readonly title: string;
  readonly description?: string;
  readonly badge?: ReactNode;
}

export function Disclosure({
  title,
  description,
  badge,
  children,
  className,
  ...props
}: DisclosureProps) {
  return (
    <details
      className={cn(
        'advanced-disclosure surface-tertiary min-w-0 rounded-[var(--radius-xl)]',
        className,
      )}
      {...props}
    >
      <summary className="focus-ring micro-interaction flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-xl)] px-5 py-4">
        <span className="min-w-0">
          <span className="ds-subsection block text-[color:var(--text)]">{title}</span>
          {description ? (
            <span className="ds-caption mt-1 block text-[color:var(--muted)]">{description}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {badge}
          <span aria-hidden="true" className="text-[color:var(--muted)]">
            +
          </span>
        </span>
      </summary>
      <div className="min-w-0 p-5">{children}</div>
    </details>
  );
}
