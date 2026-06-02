'use client';

import { Minus, Plus, Scan } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Graph toolbar">
      <Button type="button" variant="ghost" aria-label="Zoom out" onClick={onZoomOut}><Minus className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" aria-label="Fit graph" onClick={onFit}><Scan className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" aria-label="Zoom in" onClick={onZoomIn}><Plus className="h-4 w-4" /></Button>
      <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{Math.round(zoom * 100)}%</span>
    </div>
  );
}
