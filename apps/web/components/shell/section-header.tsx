import { cn } from '@/lib/cn';

interface SectionHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
}

export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-8 flex flex-col gap-3', className)}>
      <h1 className="ds-page-title text-[color:var(--text)]">
        {title}
      </h1>
      {description ? (
        <p className="ds-body max-w-3xl text-[color:var(--muted)]">{description}</p>
      ) : null}
    </div>
  );
}
