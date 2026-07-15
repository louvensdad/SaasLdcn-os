import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface SettingsDangerZoneProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Visually separates destructive actions (sign out, delete account, reset
 * local state) from the rest of a tab -- a danger-tinted border/background
 * instead of a plain Card, so the user reads intent before reading text. */
export function SettingsDangerZone({ title, description, children, className }: SettingsDangerZoneProps) {
  return (
    <Card
      className={cn(
        'space-y-4 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-6',
        className,
      )}
    >
      <div>
        <h3 className="ds-subsection text-[color:var(--danger)]">{title}</h3>
        {description ? <p className="mt-2 ds-body ds-text-muted">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </Card>
  );
}
