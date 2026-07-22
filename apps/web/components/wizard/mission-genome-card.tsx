'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import type { MissionGenome } from '@contracts/mission.contract';

interface Props {
  readonly genome: MissionGenome;
}

export function MissionGenomeCard({ genome }: Props) {
  const { t } = useLocale();
  return (
    <Link href={`/wizard/new?type=${encodeURIComponent(genome.id)}`}>
      <Card interactive className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="accent">{t(`missions.category.${genome.category}`)}</Badge>
          <ArrowRight className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
        </div>
        <h3 className="text-base font-semibold text-[color:var(--text)]">{genome.title}</h3>
        <p className="flex-1 text-sm text-[color:var(--muted)]">{genome.description}</p>
        {genome.specialists.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {genome.specialists.slice(0, 3).map((specialist) => (
              <Badge key={specialist} tone="neutral" className="ds-metadata">
                {specialist}
              </Badge>
            ))}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}
