import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

export function InlineError({ children }: { readonly children: ReactNode }) {
  return (
    <p className="mt-2 flex items-center gap-2 text-xs font-medium text-[color:var(--danger)]">
      <AlertTriangle className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

export function PageError({
  title = 'Recoverable foundation error',
  description = 'This surface can be retried without losing the current shell state.',
  actionLabel = 'Retry',
  onRetry,
  className,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <Card className={cn('border-[color-mix(in_srgb,var(--danger)_34%,var(--border))]', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
            <AlertTriangle className="h-4 w-4 text-[color:var(--danger)]" />
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{description}</p>
        </div>
        <Button type="button" variant="soft" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          {actionLabel}
        </Button>
      </div>
    </Card>
  );
}
