'use client';

import { Minus, Plus, Scan } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';

export function GraphToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  readonly zoom: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('graph.toolbar')}>
      <Button type="button" variant="ghost" aria-label={t('graph.zoomOut')} onClick={onZoomOut}><Minus className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" aria-label={t('graph.fit')} onClick={onFit}><Scan className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" aria-label={t('graph.zoomIn')} onClick={onZoomIn}><Plus className="h-4 w-4" /></Button>
      <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{Math.round(zoom * 100)}%</span>
    </div>
  );
}
