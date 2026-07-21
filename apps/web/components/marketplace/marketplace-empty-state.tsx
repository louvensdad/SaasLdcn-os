'use client';

import { Store } from 'lucide-react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';

const TAXONOMY = [
  'IA', 'Backend', 'Frontend', 'DevOps', 'Cloud',
  'Banco de Dados', 'Segurança', 'Automação', 'Integrações',
] as const;

interface Props {
  readonly onPublishFirst: () => void;
}

/** Premium empty state: two real CTAs (explore vs. publish) plus the full
 * category taxonomy as illustrative chips -- not interactive when the
 * catalog is genuinely empty (nothing to filter yet), matching
 * empty-state.tsx's visual language (cinematic-surface/ambient-grid/icon
 * chip) without forcing this into that component's closed one-CTA union. */
export function MarketplaceEmptyState({ onPublishFirst }: Props) {
  const { t } = useLocale();

  return (
    <Card className="cinematic-surface relative overflow-hidden text-center">
      <div className="ambient-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-white/5">
        <Store className="h-6 w-6 text-[color:var(--accent)]" />
      </div>
      <h3 className="relative mt-4 text-lg font-semibold text-[color:var(--text)]">{t('marketplace.empty.title')}</h3>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-[color:var(--muted)]">
        {t('marketplace.empty.description')}
      </p>
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-3">
        <ActionLink href="/templates" variant="soft">{t('marketplace.empty.exploreExamples')}</ActionLink>
        <Button type="button" variant="primary" onClick={onPublishFirst}>
          {t('marketplace.empty.publishFirst')}
        </Button>
      </div>
      <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
        {TAXONOMY.map((label) => (
          <Badge key={label} tone="neutral" className="opacity-70">{label}</Badge>
        ))}
      </div>
    </Card>
  );
}
