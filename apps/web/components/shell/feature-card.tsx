import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

interface FeatureCardProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly footer?: ReactNode;
}

export function FeatureCard({ eyebrow, title, description, footer }: FeatureCardProps) {
  return (
    <Card className="flex h-full flex-col justify-between gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-xl font-semibold tracking-normal text-[color:var(--text)]">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{description}</p>
      </div>
      {footer ? <div>{footer}</div> : null}
    </Card>
  );
}
