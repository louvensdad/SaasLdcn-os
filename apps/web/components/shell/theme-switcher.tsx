'use client';

import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { THEMES, type ThemeId } from '@/lib/themes';
import { useShellStore } from '@/stores/use-shell-store';

export function ThemeSwitcher() {
  const themeId = useShellStore((state) => state.themeId);
  const setThemeId = useShellStore((state) => state.setThemeId);

  return (
    <div className="glass-panel grid w-full max-w-full grid-cols-2 gap-1 rounded-[var(--radius-xl)] p-1 xl:flex xl:w-auto xl:rounded-full">
      {THEMES.map((theme) => {
        const active = theme.id === themeId;

        return (
          <Button
            key={theme.id}
            type="button"
            variant={active ? 'primary' : 'ghost'}
            className={cn(
              'h-9 min-w-0 rounded-[var(--radius-xl)] px-3 text-xs font-semibold xl:flex-none xl:rounded-full',
              active && 'shadow-none',
            )}
            onClick={() => setThemeId(theme.id as ThemeId)}
          >
            <motion.span
              animate={{ opacity: active ? 1 : 0.75 }}
              transition={{ duration: 0.2 }}
            >
              <span className="block truncate">{theme.name}</span>
            </motion.span>
          </Button>
        );
      })}
    </div>
  );
}
