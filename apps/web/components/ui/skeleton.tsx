import { cn } from '@/lib/cn';

interface SkeletonProps {
  readonly className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[var(--radius-xl)] bg-gradient-to-r from-white/[0.05] via-white/10 to-white/[0.05]',
        className,
      )}
    />
  );
}
