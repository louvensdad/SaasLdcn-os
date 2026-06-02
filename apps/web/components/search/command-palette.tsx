'use client';

import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  BrainCircuit,
  Palette,
  Search,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { Badge } from '@/components/ui/badge';
import { useArchitectures } from '@/hooks/use-architectures';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useFrameworks } from '@/hooks/use-frameworks';
import { useLanguages } from '@/hooks/use-languages';
import { cn } from '@/lib/cn';
import {
  createArchetypeSearchItems,
  createCapabilitySearchItems,
  createFrameworkSpecialistSearchItems,
  createTechnologySearchItems,
  filterSearchItems,
  SEARCH_ITEMS,
  type SearchItem,
} from '@/lib/search-items';
import { useShellStore } from '@/stores/use-shell-store';
import { useUiStore } from '@/stores/use-ui-store';

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function itemIcon(kind: SearchItem['kind']) {
  if (kind === 'theme') return Palette;
  if (kind === 'documentation') return BookOpen;
  if (kind === 'action') return ArrowRight;
  if (kind === 'specialist') return BrainCircuit;
  if (kind === 'registry') return Search;
  return FileText;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const themeId = useShellStore((state) => state.themeId);
  const setThemeId = useShellStore((state) => state.setThemeId);
  const openNotificationCenter = useUiStore((state) => state.openNotificationCenter);
  const openModal = useUiStore((state) => state.openModal);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const addToast = useUiStore((state) => state.addToast);
  const languagesQuery = useLanguages();
  const frameworksQuery = useFrameworks();
  const architecturesQuery = useArchitectures();
  const archetypesQuery = useArchetypes();
  const capabilitiesQuery = useCapabilities();

  const items = useMemo(() => {
    const dynamicLanguageItems = createTechnologySearchItems(
      (languagesQuery.data ?? []).map((language) => ({
        id: language.id,
        name: language.name,
        description: language.description,
        category: language.ecosystem,
        keywords: [language.ecosystem],
        prefix: 'language',
      })),
    );
    const dynamicFrameworkItems = createTechnologySearchItems(
      (frameworksQuery.data ?? []).map((framework) => ({
        id: framework.id,
        name: framework.name,
        description: framework.description,
        category: framework.framework_type,
        keywords: [framework.framework_type, framework.language_id, framework.runtime_id],
        prefix: 'framework',
      })),
    );
    const dynamicArchitectureItems = createTechnologySearchItems(
      (architecturesQuery.data ?? []).map((architecture) => ({
        id: architecture.id,
        name: architecture.name,
        description: architecture.description,
        category: architecture.complexity_level,
        keywords: [architecture.complexity_level],
        prefix: 'architecture',
      })),
    );
    const dynamicArchetypeItems = createArchetypeSearchItems(archetypesQuery.data ?? []);
    const dynamicCapabilityItems = createCapabilitySearchItems(capabilitiesQuery.data ?? []);
    const dynamicSpecialistItems = createFrameworkSpecialistSearchItems(frameworksQuery.data ?? []);
    return filterSearchItems(query, [
      ...SEARCH_ITEMS,
      ...dynamicLanguageItems,
      ...dynamicFrameworkItems,
      ...dynamicSpecialistItems,
      ...dynamicArchitectureItems,
      ...dynamicArchetypeItems,
      ...dynamicCapabilityItems,
    ]);
  }, [architecturesQuery.data, archetypesQuery.data, capabilitiesQuery.data, frameworksQuery.data, languagesQuery.data, query]);
  const activeItem = items[activeIndex];

  useEffect(() => {
    if (!open) return;

    setQuery('');
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function executeItem(item: SearchItem | undefined) {
    if (!item) return;

    if (item.themeId) {
      setThemeId(item.themeId);
    }

    if (item.href) {
      router.push(item.href);
    }

    if (item.actionId === 'open-notifications') {
      openNotificationCenter();
    }

    if (item.actionId === 'open-example-modal') {
      openModal('confirmation');
    }

    if (item.actionId === 'open-example-drawer') {
      openDrawer('details');
    }

    if (item.actionId) {
      addToast({
        tone: 'info',
        title: 'Command executed',
        description: item.title,
      });
    }

    onOpenChange(false);
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (items.length ? (current + 1) % items.length : 0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        items.length ? (current - 1 + items.length) % items.length : 0,
      );
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      executeItem(activeItem);
      return;
    }

    if (event.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])',
      );

      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/58 px-3 pt-20 backdrop-blur-sm sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
          onMouseDown={() => onOpenChange(false)}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search LDCN OS"
            className="glass-panel-strong cinematic-surface w-full max-w-2xl overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-cinematic)]"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 8, scale: 0.98 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 210, damping: 26 }
            }
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={onDialogKeyDown}
          >
            <div className="ambient-grid pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <Search className="h-4 w-4 text-[color:var(--muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-base text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
                placeholder="Search LDCN OS..."
                aria-label="Search LDCN OS"
              />
              <span className="ai-orb ai-orb-compact hidden h-5 w-5 rounded-full sm:inline-block" aria-hidden />
              <Badge>Esc</Badge>
            </div>

            <div className="relative max-h-[60vh] overflow-y-auto p-2">
              {items.length ? (
                items.map((item, index) => {
                  const Icon = itemIcon(item.kind);
                  const selected = index === activeIndex;
                  const activeTheme = item.themeId === themeId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'focus-ring micro-interaction flex w-full items-center gap-3 rounded-[var(--radius-xl)] border px-3 py-3 text-left',
                        selected
                          ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]'
                          : 'border-transparent hover:bg-white/5',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => executeItem(item)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-xl)] bg-white/5 text-[color:var(--text)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
                          {item.title}
                          {activeTheme ? <Check className="h-4 w-4 text-[color:var(--accent)]" /> : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[color:var(--muted)]">
                          {item.description}
                        </span>
                      </span>
                      <Badge className="hidden sm:inline-flex">{item.kind}</Badge>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">
                  No foundation command found.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
