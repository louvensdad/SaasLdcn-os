import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
}

export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-col gap-2', className)}>
      <h2 className="text-lg font-semibold tracking-normal text-[color:var(--text)] md:text-xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-3xl text-sm leading-6 text-[color:var(--muted)]">{description}</p>
      ) : null}
    </div>
  );
}
