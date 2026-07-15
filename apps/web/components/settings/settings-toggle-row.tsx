'use client';

interface SettingsToggleRowProps {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}

/** Same switch AdvancedTab's dev-mode toggle used to hand-roll -- shared now
 * so every settings toggle (dev mode today, any future preference) looks and
 * behaves identically. */
export function SettingsToggleRow({ label, description, checked, onChange, disabled }: SettingsToggleRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[color:var(--text)]">{label}</p>
        {description ? <p className="mt-1 ds-caption">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="focus-ring inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-[color:var(--border)] p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style={checked ? { background: 'color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
      >
        <span
          className="h-5 w-5 rounded-full bg-[color:var(--text)] transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
