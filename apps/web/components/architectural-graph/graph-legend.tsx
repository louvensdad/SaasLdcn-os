'use client';

import { Badge } from '@/components/ui/badge';

export function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Architectural graph legend">
      {['sync', 'async', 'data', 'telemetry', 'event', 'risk', 'readiness'].map((item) => (
        <Badge key={item} className="border-white/10 bg-white/[0.04]">
          {item}
        </Badge>
      ))}
    </div>
  );
}
