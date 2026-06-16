'use client';

import { Command, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';

interface GlobalSearchProps {
  readonly onOpen: () => void;
}

export function GlobalSearch({ onOpen }: GlobalSearchProps) {
  const { t } = useLocale();

  return (
    <>
      <button
        type="button"
        className="focus-ring search-surface micro-interaction group hidden h-11 min-w-64 items-center justify-between gap-4 rounded-full border border-[color:var(--border)] bg-white/5 px-4 text-sm text-[color:var(--muted)] hover:min-w-72 hover:border-[color-mix(in_srgb,var(--accent)_34%,transparent)] hover:bg-white/10 hover:text-[color:var(--text)] xl:inline-flex"
        onClick={onOpen}
        aria-label={t('search.ariaLabel')}
      >
        <span className="inline-flex items-center gap-2">
          <Search className="h-4 w-4 transition duration-300 group-hover:text-[color:var(--accent)]" />
          {t('search.placeholder')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-[color:var(--muted)] transition duration-300 group-hover:border-[color-mix(in_srgb,var(--accent)_26%,transparent)] group-hover:text-[color:var(--text)]">
          <Command className="h-3 w-3" /> K
        </span>
      </button>

      <Button
        type="button"
        variant="ghost"
        className="search-surface h-11 w-11 rounded-[var(--radius-xl)] p-0 xl:hidden"
        onClick={onOpen}
        aria-label={t('search.ariaLabel')}
      >
        <Search className="h-4 w-4" />
      </Button>
    </>
  );
}
