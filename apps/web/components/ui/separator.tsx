import { cn } from '@/lib/cn';

interface SeparatorProps {
  readonly className?: string;
}

export function Separator({ className }: SeparatorProps) {
  return <div className={cn('h-px w-full bg-white/10', className)} />;
}
