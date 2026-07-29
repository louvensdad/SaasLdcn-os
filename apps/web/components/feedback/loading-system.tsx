'use client';

import { Loader2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

export function PageLoading({ label }: { readonly label?: string }) {
  const { t } = useLocale();

  return (
    <Card className="flex min-h-64 items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--accent)]" />
        <p className="mt-4 text-sm font-semibold text-[color:var(--text)]">{label ?? t('loading.preparingSurface')}</p>
        <p className="mt-2 text-xs text-[color:var(--muted)]">{t('loading.foundationState')}</p>
      </div>
    </Card>
  );
}

export function ButtonLoading({ label }: { readonly label?: string }) {
  const { t } = useLocale();

  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? t('loading.working')}
    </span>
  );
}

export function CardLoading({ className }: { readonly className?: string }) {
  return (
    <Card className={cn('space-y-4', className)}>
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </Card>
  );
}
