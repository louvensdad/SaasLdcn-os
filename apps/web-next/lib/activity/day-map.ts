import type { Family } from '@/components/signal';
import type { ActivityEvent } from '@/lib/api/types';
import { familyFor } from '@/lib/status';

/**
 * The day map of Activity: one lane per category, the hours of one day across, a mark per recorded event. Events of one
 * category and one project less than `EPISODE_GAP` apart form an episode bar — a reading of the timestamps, never a
 * replacement for them: every event keeps its own mark.
 */
export const EPISODE_GAP_MINUTES = 30;

export interface DayEvent {
  readonly event: ActivityEvent;
  /** Minutes since the local midnight of its day. */
  readonly minute: number;
  readonly family: Family;
}

export interface Episode {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  readonly family: Family;
  readonly events: readonly DayEvent[];
}

export interface Lane {
  readonly category: string;
  readonly events: readonly DayEvent[];
  readonly episodes: readonly Episode[];
}

/** Worst first: an episode takes the family of the most serious event in it. */
const SEVERITY: readonly Family[] = ['fault', 'hand', 'caution', 'stop', 'pulse', 'proof', 'idle', 'na', 'unknown'];

export function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysOf(items: readonly ActivityEvent[]): readonly string[] {
  return [...new Set(items.map((item) => localDay(item.occurred_at)).filter((day) => day !== 'unknown'))].sort().reverse();
}

export function dayLanes(items: readonly ActivityEvent[], day: string): readonly Lane[] {
  const byCategory = new Map<string, DayEvent[]>();
  for (const event of items) {
    if (localDay(event.occurred_at) !== day) continue;
    const date = new Date(event.occurred_at);
    const entry: DayEvent = { event, minute: date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60, family: familyFor(event.status) };
    byCategory.set(event.category, [...(byCategory.get(event.category) ?? []), entry]);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, events]) => {
      const sorted = [...events].sort((a, b) => a.minute - b.minute);
      const episodes: Episode[] = [];
      let current: DayEvent[] = [];
      const close = () => {
        if (current.length === 0) return;
        const family = SEVERITY.find((candidate) => current.some((entry) => entry.family === candidate)) ?? 'unknown';
        episodes.push({
          key: `${category}:${current[0]!.event.id}`, start: current[0]!.minute, end: current[current.length - 1]!.minute, family, events: current,
        });
        current = [];
      };
      for (const entry of sorted) {
        const last = current[current.length - 1];
        if (last && (entry.minute - last.minute > EPISODE_GAP_MINUTES || entry.event.project_id !== last.event.project_id)) close();
        current.push(entry);
      }
      close();
      return { category, events: sorted, episodes };
    });
}
