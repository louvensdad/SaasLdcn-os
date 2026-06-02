import { Loader2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

export function PageLoading({ label = 'Preparing operational surface' }: { readonly label?: string }) {
  return (
    <Card className="flex min-h-64 items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--accent)]" />
        <p className="mt-4 text-sm font-semibold text-[color:var(--text)]">{label}</p>
        <p className="mt-2 text-xs text-[color:var(--muted)]">Loading foundation state.</p>
      </div>
    </Card>
  );
}

export function ButtonLoading({ label = 'Working' }: { readonly label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
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
