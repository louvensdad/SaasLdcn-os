import { cn } from '@/lib/cn';

interface SkeletonProps {
  readonly className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'shimmer rounded-[var(--radius-xl)]',
        className,
      )}
    />
  );
}
