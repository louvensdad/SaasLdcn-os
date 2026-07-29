'use client';

import { useState } from 'react';

import { CollapsibleSection } from '@/components/system/CollapsibleSection';
import { SystemCard } from '@/components/system/SystemCard';
import type { SystemHealthItem, SystemHealthStatus } from '@/hooks/useSystemHealth';

interface SystemGroupAccordionProps {
  readonly title: string;
  readonly summary: string;
  readonly actionLabel: string;
  readonly collapseLabel: string;
  readonly items: readonly SystemHealthItem[];
  readonly forceOpen?: boolean;
  readonly statusLabels: Record<SystemHealthStatus, string>;
  readonly emptyLabel: string;
}

export function SystemGroupAccordion({
  title,
  summary,
  actionLabel,
  collapseLabel,
  items,
  forceOpen = false,
  statusLabels,
  emptyLabel,
}: SystemGroupAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <CollapsibleSection
      title={title}
      summary={summary}
      actionLabel={actionLabel}
      collapseLabel={collapseLabel}
      open={open}
      forceOpen={forceOpen}
      onOpenChange={setOpen}
    >
      {items.length ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <SystemCard
              key={item.id}
              id={item.id}
              name={item.name}
              category={item.category}
              status={item.status}
              statusLabel={statusLabels[item.status]}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-gray-800/50 bg-gray-900/50 p-4 text-sm text-[color:var(--muted)]">{emptyLabel}</p>
      )}
    </CollapsibleSection>
  );
}