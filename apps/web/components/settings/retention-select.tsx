'use client';

import { Select } from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale';

// Mirrors MIN/MAX_KEY_TTL_SECONDS on the backend (5 min .. 90 days).
const OPTIONS = [
  { value: 3600, labelKey: 'settings.retention.hour' },
  { value: 86_400, labelKey: 'settings.retention.day' },
  { value: 604_800, labelKey: 'settings.retention.week' },
  { value: 2_592_000, labelKey: 'settings.retention.month' },
  { value: 7_776_000, labelKey: 'settings.retention.quarter' },
] as const;

interface Props {
  /** null = backend default (platform TTL for keys, "until disconnect" for git tokens). */
  readonly value: number | null;
  readonly onChange: (ttlSeconds: number | null) => void;
  /** Label for the null option, e.g. t('settings.retention.keyDefault'). */
  readonly defaultOptionLabel: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** How long the platform may keep a user-supplied secret (LLM key / git token)
 * before it self-destructs server-side. */
export function RetentionSelect({ value, onChange, defaultOptionLabel, disabled, className }: Props) {
  const { t } = useLocale();
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="ds-caption">{t('settings.retention.label')}</span>
      <Select
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{defaultOptionLabel}</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
        ))}
      </Select>
    </label>
  );
}

/** "3d 4h" / "2h 05min" / "12min" from a seconds-to-live count. */
export function formatRemaining(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const days = Math.floor(clamped / 86_400);
  const hours = Math.floor((clamped % 86_400) / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${Math.max(1, minutes)}min`;
}
