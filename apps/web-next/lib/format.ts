import type { Locale } from '@/lib/i18n/locales';

/** Dates and numbers always in the reader's locale; an unparseable value is shown as it came, never guessed. */
export function formatWhen(value: string | null | undefined, locale: Locale, withTime = true): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

export function formatTime(value: number | null | undefined, locale: Locale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(value));
}

/** A duration the backend measured in milliseconds, in the reader's units: 850 ms, 41 s, 4 min 12 s. */
export function formatDuration(ms: number | null | undefined, locale: Locale): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const unit = (value: number, name: 'millisecond' | 'second' | 'minute', digits = 0) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short', maximumFractionDigits: digits }).format(value);
  if (ms < 1000) return unit(Math.round(ms), 'millisecond');
  if (ms < 60_000) return unit(ms / 1000, 'second', ms < 10_000 ? 1 : 0);
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${unit(minutes, 'minute')} ${unit(seconds, 'second')}` : unit(minutes, 'minute');
}

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Estimated cost: always marked as an estimate by the label next to it, never rounded to look exact. */
export function formatUsd(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);
}

/** Byte sizes the backend reports as integers; binary units, one decimal past KB. */
export function formatBytes(value: number, locale: Locale): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(size)} ${units[unit]}`;
}
