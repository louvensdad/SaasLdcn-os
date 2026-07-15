import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

type SettingsSectionSurface = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'none';

interface SettingsSectionProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly surface?: SettingsSectionSurface;
}

/** The header+Card wrapper every settings tab already reached for ad hoc
 * (InterfaceTab, AiProvidersTab) -- formalized so every tab shares the same
 * title/description/action rhythm instead of re-deriving it per file.
 *
 * `surface="none"` skips the Card entirely (header + plain children) -- for
 * tabs whose content is already its own distinctly-styled surface (Runtime's
 * HealthCard/OperationalRail, Advanced's registry graph), so they get the
 * same consistent title/description without a Card-inside-a-Card. */
export function SettingsSection({ title, description, action, children, className, surface = 'secondary' }: SettingsSectionProps) {
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="ds-section text-[color:var(--text)]">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl ds-body ds-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );

  if (surface === 'none') {
    return (
      <div className={cn('space-y-5', className)}>
        {header}
        {children}
      </div>
    );
  }

  return (
    <Card surface={surface} className={cn('space-y-5 p-6', className)}>
      {header}
      {children}
    </Card>
  );
}
