interface SettingsMetricCardProps {
  readonly label: string;
  readonly value: string;
}

/** Formalizes the ad hoc `Metric` helper that used to live inline in
 * app/(app)/settings/page.tsx -- same look, shared across every tab now. */
export function SettingsMetricCard({ label, value }: SettingsMetricCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3">
      <p className="ds-caption">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[color:var(--text)]">{value}</p>
    </div>
  );
}
