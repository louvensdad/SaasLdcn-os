'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

import { THEMES, type ThemeId } from '@/lib/themes';
import { useShellStore } from '@/stores/use-shell-store';
import { cn } from '@/lib/cn';

/**
 * Premium theme picker: each theme is a card with a LIVE preview. The preview
 * box carries `data-theme={id}`, so the CSS variable blocks resolve to that
 * theme's real palette for the swatch — no hardcoded hexes to drift. Clicking a
 * card switches the app theme immediately.
 */
export function ThemeGallery() {
  const themeId = useShellStore((state) => state.themeId);
  const setThemeId = useShellStore((state) => state.setThemeId);
  const reduce = useReducedMotion();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {THEMES.map((theme, index) => {
        const active = theme.id === themeId;
        return (
          <motion.button
            key={theme.id}
            type="button"
            onClick={() => setThemeId(theme.id as ThemeId)}
            aria-pressed={active}
            aria-label={theme.name}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
            whileHover={reduce ? undefined : { y: -2 }}
            className={cn(
              'focus-ring group overflow-hidden rounded-[var(--radius-lg)] border text-left transition-colors',
              active
                ? 'border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] shadow-[0_0_20px_var(--glow)]'
                : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]',
            )}
          >
            <div data-theme={theme.id} className="relative h-28 w-full" style={{ background: 'var(--bg)' }}>
              <div
                className="absolute inset-0"
                style={{ backgroundImage: 'radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 45%)' }}
              />
              <div className="absolute inset-x-3 top-3 h-6 rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
              <div className="absolute left-3 top-12 h-3 w-20 rounded-full" style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
              <div className="absolute left-3 top-[4.7rem] flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent-2)' }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--success)' }} />
              </div>
              {active ? (
                <span
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full"
                  style={{ background: 'var(--accent)', color: 'var(--control-selected-text)' }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : null}
            </div>
            <div className="space-y-1 p-4">
              <p className="text-sm font-semibold text-[color:var(--text)]">{theme.name}</p>
              <p className="t-caption">{theme.description}</p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
