'use client';

import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';

export function GraphLegend() {
  const { t } = useLocale();

  return (
    <div className="flex flex-wrap gap-2" aria-label={t('graph.legend')}>
      {['sync', 'async', 'data', 'telemetry', 'event', 'risk', 'readiness'].map((item) => (
        <Badge key={item} className="border-white/10 bg-white/[0.04]">
          {item}
        </Badge>
      ))}
    </div>
  );
}
