import { Card } from '@/components/ui/card';

interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly trend?: string;
}

export function MetricCard({ label, value, detail, trend }: MetricCardProps) {
  return (
    <Card className="min-h-40 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
          {label}
        </p>
        <span className="status-dot" aria-hidden />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-semibold tracking-normal text-[color:var(--text)]">
            {value}
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{detail}</p>
        </div>
        {trend ? (
          <div className="rounded-full border border-[color:var(--border)] bg-white/5 px-3 py-1 text-xs font-semibold text-[color:var(--text)]">
            {trend}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
