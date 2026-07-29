'use client';

import { Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useShellStore } from '@/stores/use-shell-store';

const OPTIONS = [
  { id: 'light', Icon: Sun, label: 'Light' },
  { id: 'dark', Icon: Moon, label: 'Dark' },
] as const;

// Two icon toggles (sun / moon) matching the reference header, instead of a
// text "Dark | Light" segmented pill. The active theme's icon is filled in the
// accent colour; the other is a muted, clickable ghost.
export function ThemeSwitcher() {
  const themeId = useShellStore((state) => state.themeId);
  const setThemeId = useShellStore((state) => state.setThemeId);

  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map(({ id, Icon, label }) => {
        const active = id === themeId;
        return (
          <button
            key={id}
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setThemeId(id)}
            className={cn(
              'focus-ring grid h-9 w-9 place-items-center rounded-full transition-colors',
              active
                ? 'text-[color:var(--accent)]'
                : 'text-[color:var(--muted)] hover:bg-[color:var(--control-hover)] hover:text-[color:var(--text)]',
            )}
            style={active ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : undefined}
          >
            <Icon className="h-[1.15rem] w-[1.15rem]" />
          </button>
        );
      })}
    </div>
  );
}
